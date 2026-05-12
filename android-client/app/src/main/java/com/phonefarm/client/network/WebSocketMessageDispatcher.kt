package com.phonefarm.client.network

import android.util.Base64
import android.util.Log
import com.phonefarm.client.engine.ScriptEngine
import com.phonefarm.client.remote.RemoteCommand
import com.phonefarm.client.remote.RemoteCommandHandler
import com.phonefarm.client.remote.RemoteCommandResult as RemoteCmdResult
import com.phonefarm.client.service.PhoneFarmAccessibilityService
import com.phonefarm.client.vlm.VlmAgent
import com.phonefarm.client.edge.EdgePipeline
import com.phonefarm.client.edge.model.CompiledState
import com.phonefarm.client.stream.StreamController
import kotlinx.coroutines.*
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Central dispatcher for inbound WebSocket messages from the control server.
 *
 * Routes messages by type to their respective handlers:
 *   start_task       -> ScriptEngine
 *   stop_task        -> ScriptEngine
 *   config_update    -> CloudConfigSyncer
 *   screenshot_request -> AccessibilityService screenshot capture
 *   remote_command   -> RemoteCommandHandler
 *   shell_command    -> RemoteShellExecutor
 *   deploy_scripts   -> ScriptManager OTA
 *   vlm_config_update -> VlmAgent
 *   file_push / file_pull -> RemoteFileManager
 */
@Singleton
class WebSocketMessageDispatcher @Inject constructor(
    private val webSocketClient: WebSocketClient,
    private val cloudConfigSyncer: CloudConfigSyncer,
    private val remoteCommandHandler: RemoteCommandHandler,
    private val edgePipeline: EdgePipeline,
    private val streamController: StreamController,
    private val actionExecutor: com.phonefarm.client.edge.ActionExecutor,
    private val edgeLoop: com.phonefarm.client.edge.EdgeLoop,
) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var scriptEngine: ScriptEngine? = null
    private var vlmAgent: VlmAgent? = null
    private var accessibilityService: PhoneFarmAccessibilityService? = null

    companion object {
        const val TAG = "WSMsgDispatcher"
    }

    fun setScriptEngine(engine: ScriptEngine) { scriptEngine = engine }
    fun setVlmAgent(agent: VlmAgent) { vlmAgent = agent }
    fun setAccessibilityService(service: PhoneFarmAccessibilityService) {
        accessibilityService = service
    }

    fun start() {
        scope.launch {
            webSocketClient.messages.collect { message ->
                try {
                    dispatch(message)
                } catch (e: Exception) {
                    Log.e(TAG, "Error dispatching message type=${message.type}", e)
                }
            }
        }
    }

    private suspend fun dispatch(message: WebSocketMessage) {
        Log.d(TAG, "Received: type=${message.type}")

        when (message) {
            is WebSocketMessage.StartTask -> handleStartTask(message)
            is WebSocketMessage.StopTask -> handleStopTask(message)
            is WebSocketMessage.ConfigUpdate -> handleConfigUpdate(message)
            is WebSocketMessage.DeployScripts -> handleDeployScripts(message)
            is WebSocketMessage.ScreenshotRequest -> handleScreenshotRequest(message)
            is WebSocketMessage.RemoteCommand -> handleRemoteCommand(message)
            is WebSocketMessage.ShellCommand -> handleShellCommand(message)
            is WebSocketMessage.VlmConfigUpdate -> handleVlmConfigUpdate(message)
            is WebSocketMessage.FilePush -> handleFilePush(message)
            is WebSocketMessage.FilePull -> handleFilePull(message)
            is WebSocketMessage.ActivationStatus -> { /* handled by ActivationManager */ }
            is WebSocketMessage.PluginUpdate -> handlePluginUpdate(message)
            is WebSocketMessage.ModelStatus -> { /* handled by ModelManager */ }
            is WebSocketMessage.AlertNotification -> { /* handled by NotificationManager */ }
            // Edge-Cloud messages
            is WebSocketMessage.EdgeState -> { /* informational — device uploads, cloud processes */ }
            is WebSocketMessage.StepResult -> { /* informational — forwarded to cloud DecisionRouter */ }
            is WebSocketMessage.ExecuteDecision -> handleExecuteDecision(message)
            is WebSocketMessage.StartStream -> handleStartStream(message)
            is WebSocketMessage.StopStream -> handleStopStream(message)
            is WebSocketMessage.ReactionRulesUpdate -> handleReactionRulesUpdate(message)
            // Session / Device layer — informational, no action needed
            is WebSocketMessage.Auth,
            is WebSocketMessage.Heartbeat,
            is WebSocketMessage.DeviceOnline,
            is WebSocketMessage.DeviceOffline,
            is WebSocketMessage.DeviceHeartbeat,
            is WebSocketMessage.DeviceScreenshot,
            is WebSocketMessage.TaskStatusUpdate,
            is WebSocketMessage.TaskResult,
            is WebSocketMessage.RemoteCommandResult,
            is WebSocketMessage.Activate -> {
                Log.d(TAG, "Informational message: ${message.type}")
            }
        }
    }

    private suspend fun handleStartTask(msg: WebSocketMessage.StartTask) {
        val engine = scriptEngine ?: run {
            Log.w(TAG, "ScriptEngine not initialized — cannot start task")
            reportTaskResult(msg.taskId, false, "ScriptEngine not ready", 0)
            return
        }

        try {
            Log.i(TAG, "Starting task: ${msg.scriptName} (taskId=${msg.taskId})")
            val configMap = mutableMapOf<String, Any>()
            for ((key, value) in msg.config) {
                configMap[key] = value.toString()
            }
            engine.execute(msg.scriptName, configMap)
            reportTaskResult(msg.taskId, true, null, 0)
        } catch (e: Exception) {
            Log.e(TAG, "Task failed: ${msg.scriptName}", e)
            reportTaskResult(msg.taskId, false, e.message ?: "Unknown error", 0)
        }
    }

    private suspend fun handleStopTask(msg: WebSocketMessage.StopTask) {
        scriptEngine?.stop()
        Log.i(TAG, "Task stopped: ${msg.taskId}")
    }

    private suspend fun handleConfigUpdate(msg: WebSocketMessage.ConfigUpdate) {
        cloudConfigSyncer.handleConfigUpdate(msg)
    }

    private suspend fun handleDeployScripts(msg: WebSocketMessage.DeployScripts) {
        Log.i(TAG, "Deploy scripts manifest received: ${msg.manifest.size} scripts")
    }

    private suspend fun handleScreenshotRequest(msg: WebSocketMessage.ScreenshotRequest) {
        val service = accessibilityService ?: return
        try {
            val bitmap = service.captureScreen(msg.scale, msg.quality)
            if (bitmap != null) {
                val bos = java.io.ByteArrayOutputStream()
                bitmap.compress(
                    android.graphics.Bitmap.CompressFormat.valueOf(msg.format.uppercase()),
                    msg.quality,
                    bos,
                )
                val imageBytes = bos.toByteArray()
                webSocketClient.send(
                    WebSocketMessage.DeviceScreenshot(
                        deviceId = "",
                        imageBase64 = Base64.encodeToString(imageBytes, Base64.NO_WRAP),
                        format = msg.format,
                        width = bitmap.width,
                        height = bitmap.height,
                        timestamp = System.currentTimeMillis(),
                    )
                )
                bitmap.recycle()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Screenshot capture failed", e)
        }
    }

    private suspend fun handleRemoteCommand(msg: WebSocketMessage.RemoteCommand) {
        val cmd: RemoteCommand = when (msg.action) {
            "screenshot" -> RemoteCommand.Screenshot(
                commandId = msg.commandId,
                quality = 80,
                scale = 0.5f,
            )
            else -> {
                Log.w(TAG, "Unknown remote action: ${msg.action}")
                return
            }
        }
        val result = remoteCommandHandler.handleCommand(cmd)
        when (result) {
            is RemoteCmdResult.Success -> {
                webSocketClient.send(
                    WebSocketMessage.RemoteCommandResult(
                        commandId = msg.commandId,
                        success = true,
                        result = result.output,
                        durationMs = 0,
                    )
                )
            }
            is RemoteCmdResult.Error -> {
                Log.w(TAG, "Remote command failed: ${result.message}")
                webSocketClient.send(
                    WebSocketMessage.RemoteCommandResult(
                        commandId = msg.commandId,
                        success = false,
                        result = result.message,
                        durationMs = 0,
                    )
                )
            }
        }
    }

    private suspend fun handleShellCommand(msg: WebSocketMessage.ShellCommand) {
        Log.d(TAG, "Shell command received: ${msg.command}")
    }

    private suspend fun handleVlmConfigUpdate(msg: WebSocketMessage.VlmConfigUpdate) {
        vlmAgent?.let { agent ->
            if (msg.modelName != null) agent.updateModel(msg.modelName)
            if (msg.maxSteps != null) agent.updateMaxSteps(msg.maxSteps)
        }
        Log.i(TAG, "VLM config updated: model=${msg.modelName}, maxSteps=${msg.maxSteps}")
    }

    private suspend fun handleFilePush(msg: WebSocketMessage.FilePush) {
        Log.d(TAG, "File push: ${msg.remotePath} (${msg.fileId})")
    }

    private suspend fun handleFilePull(msg: WebSocketMessage.FilePull) {
        Log.d(TAG, "File pull request: ${msg.localPath} (${msg.fileId})")
    }

    private suspend fun handlePluginUpdate(msg: WebSocketMessage.PluginUpdate) {
        Log.i(TAG, "Plugin update: ${msg.pluginId} v${msg.version}")
    }

    private fun reportTaskResult(
        taskId: String,
        success: Boolean,
        errorMessage: String?,
        durationMs: Long,
    ) {
        webSocketClient.send(
            WebSocketMessage.TaskResult(
                taskId = taskId,
                success = success,
                stats = null,
                errorMessage = errorMessage,
                durationMs = durationMs,
            )
        )
    }

    // ── Edge-Cloud Message Handlers ──

    private suspend fun handleExecuteDecision(msg: WebSocketMessage.ExecuteDecision) {
        val decision = msg.decision ?: run {
            Log.w(TAG, "ExecuteDecision with null decision")
            return
        }
        val actionJson = decision.action ?: run {
            Log.w(TAG, "ExecuteDecision with null action")
            return
        }

        val deviceAction = mapToDeviceAction(actionJson)
        Log.i(TAG, "Executing cloud decision: $deviceAction")

        edgeLoop.handleCloudDecision(
            action = deviceAction,
            finished = decision.finished == true,
        )
    }

    private suspend fun handleStartStream(msg: WebSocketMessage.StartStream) {
        Log.i(TAG, "Start stream requested: maxSize=${msg.maxSize}, bitRate=${msg.bitRate}")
        streamController.handleStartStream(
            com.phonefarm.client.stream.StreamConfig(
                maxSize = msg.maxSize ?: 1080,
                bitRate = msg.bitRate ?: 4_000_000,
                maxFps = msg.maxFps ?: 15,
                audio = msg.audio ?: false
            )
        )
    }

    private suspend fun handleStopStream(msg: WebSocketMessage.StopStream) {
        Log.i(TAG, "Stop stream: reason=${msg.reason}")
        streamController.handleStopStream(msg.reason ?: "server_requested")
    }

    private suspend fun handleReactionRulesUpdate(msg: WebSocketMessage.ReactionRulesUpdate) {
        Log.i(TAG, "Reaction rules update: ${msg.rules?.size ?: 0} rules")
        val rules = msg.rules?.map { rule ->
            com.phonefarm.client.edge.model.ReactionRule(
                id = rule.id ?: "",
                scenario = rule.scenario ?: "",
                conditions = com.phonefarm.client.edge.model.RuleConditions(
                    popupKeywords = rule.conditions?.popupKeywords ?: emptyList(),
                    maxChangeRatio = rule.conditions?.maxChangeRatio?.toFloat() ?: 1.0f,
                    keyboardVisible = rule.conditions?.keyboardVisible,
                    pageTypes = (rule.conditions?.pageTypes ?: emptyList()).map {
                        try { com.phonefarm.client.edge.model.PageType.valueOf(it) }
                        catch (_: Exception) { com.phonefarm.client.edge.model.PageType.PAGE_UNKNOWN }
                    },
                    appPackages = rule.conditions?.appPackages ?: emptyList()
                ),
                autoAction = mapToDeviceAction(rule.autoAction),
                confidence = rule.confidence?.toFloat() ?: 0.5f,
                enabled = rule.enabled ?: true,
                source = com.phonefarm.client.edge.model.RuleSource.CLOUD
            )
        } ?: emptyList()
        edgePipeline.localReactor.updateCloudRules(rules)
    }

    private fun mapToDeviceAction(action: kotlinx.serialization.json.JsonObject?): com.phonefarm.client.edge.model.DeviceAction {
        if (action == null) return com.phonefarm.client.edge.model.DeviceAction.Wait(1000)
        val type = action["type"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
        return when (type) {
            "tap" -> com.phonefarm.client.edge.model.DeviceAction.Tap(
                action["x"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() } ?: 0,
                action["y"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() } ?: 0
            )
            "long_press" -> com.phonefarm.client.edge.model.DeviceAction.LongPress(
                action["x"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() } ?: 0,
                action["y"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() } ?: 0,
                action["durationMs"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() } ?: 800
            )
            "swipe" -> com.phonefarm.client.edge.model.DeviceAction.Swipe(
                action["x1"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() } ?: 0,
                action["y1"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() } ?: 0,
                action["x2"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() } ?: 0,
                action["y2"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() } ?: 0
            )
            "type" -> com.phonefarm.client.edge.model.DeviceAction.Type(
                action["text"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } ?: ""
            )
            "back" -> com.phonefarm.client.edge.model.DeviceAction.Back
            "home" -> com.phonefarm.client.edge.model.DeviceAction.Home
            "launch" -> com.phonefarm.client.edge.model.DeviceAction.Launch(
                action["packageName"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } ?: ""
            )
            "wait" -> com.phonefarm.client.edge.model.DeviceAction.Wait(
                action["durationMs"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() } ?: 1000
            )
            "terminate" -> com.phonefarm.client.edge.model.DeviceAction.Terminate(
                action["message"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
            )
            "dismiss_keyboard" -> com.phonefarm.client.edge.model.DeviceAction.DismissKeyboard
            else -> com.phonefarm.client.edge.model.DeviceAction.Wait(1000)
        }
    }

    fun stop() {
        scope.cancel()
    }
}
