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
import com.phonefarm.client.crash.CrashReporter
import com.phonefarm.client.engine.ScriptManager
import com.phonefarm.client.stream.StreamController
import com.phonefarm.client.webrtc.P2pConnectionManager
import com.phonefarm.client.webrtc.WebrtcManager
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
    private val scriptManager: ScriptManager,
    private val crashReporter: CrashReporter,
    private val p2pConnectionManager: P2pConnectionManager,
    private val webrtcManager: WebrtcManager,
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
        // Wire CrashReporter to send reports via WebSocket
        crashReporter.onReportCrash = { crashJson ->
            webSocketClient.sendRaw(crashJson)
        }

        scope.launch {
            // Observe connection state to report pending crashes on connect
            webSocketClient.connectionState.collect { state ->
                if (state == ConnectionState.AUTHENTICATED) {
                    try {
                        crashReporter.reportPendingCrashes()
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to report pending crashes", e)
                    }
                }
            }
        }

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
            // Dynamic remote_* commands from server
            is WebSocketMessage.RemoteCommandMessage -> handleRemoteCommandMessage(message)
            // Task lifecycle & stream state
            is WebSocketMessage.TaskComplete -> handleTaskComplete(message)
            is WebSocketMessage.StreamState -> { /* informational — stream state change */ }
            is WebSocketMessage.HeartbeatAck -> { /* heartbeat acknowledged by server */ }
            // ── WebRTC P2P Signaling ──
            is WebSocketMessage.WebrtcOffer -> handleWebrtcOffer(message)
            is WebSocketMessage.WebrtcAnswer -> handleWebrtcAnswer(message)
            is WebSocketMessage.WebrtcIceCandidate -> handleWebrtcIceCandidate(message)
            is WebSocketMessage.WebrtcRequestConnection -> handleWebrtcRequestConnection(message)
            is WebSocketMessage.WebrtcAcceptConnection -> handleWebrtcAcceptConnection(message)
            is WebSocketMessage.WebrtcRejectConnection -> handleWebrtcRejectConnection(message)

            // Session — auth_ok from server carries webrtc config
            is WebSocketMessage.AuthOk -> handleAuthOk(message)

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
        val version = msg.version ?: "ota"
        // If server sent base64 file contents directly, save them
        if (msg.files != null && msg.files!!.isNotEmpty()) {
            var saved = 0
            for ((name, contentBase64) in msg.files!!) {
                try {
                    val content = String(android.util.Base64.decode(contentBase64, android.util.Base64.DEFAULT))
                    scriptManager.saveScript(name, content, version)
                    saved++
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to save script $name: ${e.message}")
                }
            }
            Log.i(TAG, "Deploy scripts: saved $saved/${msg.files!!.size} files (v$version)")
        } else if (msg.manifest != null) {
            // Only manifest (hashes) — sync from cloud for changed scripts
            scope.launch {
                try {
                    val updated = scriptManager.syncFromCloud(msg.manifest!!)
                    Log.i(TAG, "Script sync: $updated files updated from manifest (${msg.manifest!!.size} entries)")
                } catch (e: Exception) {
                    Log.w(TAG, "Script sync failed: ${e.message}")
                }
            }
        }
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
        Log.i(TAG, "Executing shell command: ${msg.command}")
        try {
            val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", msg.command))
            val stdout = process.inputStream.bufferedReader().readText().take(5000)
            val stderr = process.errorStream.bufferedReader().readText().take(1000)
            val exited = process.waitFor(msg.timeoutMs ?: 5000L, java.util.concurrent.TimeUnit.MILLISECONDS)
            if (!exited) process.destroyForcibly()
            val exitCode = if (exited) process.exitValue() else -1

            webSocketClient.send(
                WebSocketMessage.RemoteCommandResult(
                    commandId = msg.commandId ?: "shell_${System.currentTimeMillis()}",
                    success = exitCode == 0,
                    result = if (exitCode == 0) stdout else "exit=$exitCode: $stderr",
                    durationMs = 0,
                )
            )
        } catch (e: Exception) {
            Log.e(TAG, "Shell command failed: ${msg.command}", e)
            webSocketClient.send(
                WebSocketMessage.RemoteCommandResult(
                    commandId = msg.commandId ?: "shell_${System.currentTimeMillis()}",
                    success = false,
                    result = e.message ?: "Shell error",
                    durationMs = 0,
                )
            )
        }
    }

    private suspend fun handleVlmConfigUpdate(msg: WebSocketMessage.VlmConfigUpdate) {
        vlmAgent?.let { agent ->
            if (msg.modelName != null) agent.updateModel(msg.modelName)
            if (msg.maxSteps != null) agent.updateMaxSteps(msg.maxSteps)
        }
        Log.i(TAG, "VLM config updated: model=${msg.modelName}, maxSteps=${msg.maxSteps}")
    }

    private suspend fun handleFilePush(msg: WebSocketMessage.FilePush) {
        Log.i(TAG, "File push: ${msg.remotePath} (${msg.fileId})")
        scope.launch {
            try {
                val url = msg.downloadUrl ?: return@launch
                val client = okhttp3.OkHttpClient.Builder()
                    .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(120, java.util.concurrent.TimeUnit.SECONDS)
                    .build()
                val request = okhttp3.Request.Builder().url(url).build()
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    val file = java.io.File(msg.remotePath)
                    file.parentFile?.mkdirs()
                    file.writeBytes(response.body?.bytes() ?: ByteArray(0))
                    Log.i(TAG, "File saved: ${msg.remotePath} (${file.length()} bytes)")
                    webSocketClient.send(
                        WebSocketMessage.RemoteCommandResult(
                            commandId = msg.fileId,
                            success = true,
                            result = "Saved: ${file.length()} bytes",
                            durationMs = 0,
                        )
                    )
                } else {
                    Log.w(TAG, "File push download failed: ${response.code}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "File push failed: ${e.message}", e)
            }
        }
    }

    private suspend fun handleFilePull(msg: WebSocketMessage.FilePull) {
        Log.i(TAG, "File pull request: ${msg.localPath} (${msg.fileId})")
        scope.launch {
            try {
                val file = java.io.File(msg.localPath)
                if (!file.exists()) {
                    webSocketClient.send(
                        WebSocketMessage.RemoteCommandResult(
                            commandId = msg.fileId,
                            success = false,
                            result = "File not found: ${msg.localPath}",
                            durationMs = 0,
                        )
                    )
                    return@launch
                }
                val content = file.readBytes()
                val base64 = android.util.Base64.encodeToString(content, android.util.Base64.NO_WRAP)
                webSocketClient.send(
                    WebSocketMessage.DeviceScreenshot(
                        deviceId = "",
                        imageBase64 = base64,
                        format = "file",
                        width = 0,
                        height = 0,
                        timestamp = System.currentTimeMillis(),
                    )
                )
            } catch (e: Exception) {
                Log.e(TAG, "File pull failed: ${e.message}", e)
            }
        }
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

    // ── WebRTC P2P Signaling Handlers ──

    private suspend fun handleWebrtcOffer(msg: WebSocketMessage.WebrtcOffer) {
        Log.i(TAG, "WebRTC offer from ${msg.from} to ${msg.to}")
        p2pConnectionManager.handleIncomingOffer(msg.from, msg.sdp)
    }

    private suspend fun handleWebrtcAnswer(msg: WebSocketMessage.WebrtcAnswer) {
        Log.i(TAG, "WebRTC answer from ${msg.from} to ${msg.to}")
        p2pConnectionManager.handleIncomingAnswer(msg.from, msg.sdp)
    }

    private suspend fun handleWebrtcIceCandidate(msg: WebSocketMessage.WebrtcIceCandidate) {
        Log.d(TAG, "WebRTC ICE candidate from ${msg.from} to ${msg.to}")
        p2pConnectionManager.handleIncomingIceCandidate(
            msg.from, msg.candidate, msg.sdpMid, msg.sdpMLineIndex
        )
    }

    private suspend fun handleWebrtcRequestConnection(msg: WebSocketMessage.WebrtcRequestConnection) {
        Log.i(TAG, "WebRTC connection request from ${msg.from} to ${msg.to}")
        // Auto-accept incoming P2P connection requests within the group
        p2pConnectionManager.handleIncomingRequest(msg.from)
    }

    private suspend fun handleWebrtcAcceptConnection(msg: WebSocketMessage.WebrtcAcceptConnection) {
        Log.i(TAG, "WebRTC connection accepted by ${msg.from}")
        p2pConnectionManager.handleIncomingAccept(msg.from)
    }

    private suspend fun handleWebrtcRejectConnection(msg: WebSocketMessage.WebrtcRejectConnection) {
        Log.w(TAG, "WebRTC connection rejected by ${msg.from}: ${msg.reason}")
        p2pConnectionManager.handleIncomingReject(msg.from, msg.reason)
    }

    private fun handleAuthOk(msg: WebSocketMessage.AuthOk) {
        val webrtc = msg.webrtc ?: run {
            Log.d(TAG, "auth_ok received without webrtc config")
            return
        }
        if (!webrtc.enabled) {
            Log.i(TAG, "WebRTC disabled by server config")
            return
        }
        Log.i(TAG, "Configuring TURN: ${webrtc.turnServerUrl} user=${webrtc.turnUsername}")
        webrtcManager.configureTurn(
            url = webrtc.turnServerUrl,
            username = webrtc.turnUsername,
            credential = webrtc.turnCredential,
        )
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

    private suspend fun handleRemoteCommandMessage(msg: WebSocketMessage.RemoteCommandMessage) {
        val a11y = accessibilityService
        val requestId = msg.requestId
        val params = msg.params

        try {
            val result = when (msg.command) {
                "reboot" -> remoteCommandHandler.handleCommand(
                    com.phonefarm.client.remote.RemoteCommand.Reboot(requestId)
                )
                "lock_screen" -> remoteCommandHandler.handleCommand(
                    com.phonefarm.client.remote.RemoteCommand.LockScreen(requestId)
                )
                "unlock_screen" -> remoteCommandHandler.handleCommand(
                    com.phonefarm.client.remote.RemoteCommand.UnlockScreen(requestId)
                )
                "screenshot" -> remoteCommandHandler.handleCommand(
                    com.phonefarm.client.remote.RemoteCommand.Screenshot(
                        commandId = requestId,
                        quality = params?.get("quality")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() } ?: 80,
                        scale = params?.get("scale")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toFloatOrNull() } ?: 0.5f,
                    )
                )
                "shell" -> remoteCommandHandler.handleCommand(
                    com.phonefarm.client.remote.RemoteCommand.Shell(
                        commandId = requestId,
                        command = params?.get("command")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } ?: "",
                        timeoutMs = params?.get("timeoutMs")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toLongOrNull() } ?: 10_000L,
                    )
                )
                "home" -> remoteCommandHandler.handleCommand(
                    com.phonefarm.client.remote.RemoteCommand.Home(requestId)
                )
                "back" -> remoteCommandHandler.handleCommand(
                    com.phonefarm.client.remote.RemoteCommand.Back(requestId)
                )
                "tap" -> {
                    val x = params?.get("x")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toFloatOrNull() } ?: 0f
                    val y = params?.get("y")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toFloatOrNull() } ?: 0f
                    remoteCommandHandler.handleCommand(
                        com.phonefarm.client.remote.RemoteCommand.Tap(requestId, x, y)
                    )
                }
                "swipe" -> {
                    val x1 = params?.get("x1")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toFloatOrNull() } ?: 0f
                    val y1 = params?.get("y1")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toFloatOrNull() } ?: 0f
                    val x2 = params?.get("x2")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toFloatOrNull() } ?: 0f
                    val y2 = params?.get("y2")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toFloatOrNull() } ?: 0f
                    val dur = params?.get("durationMs")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toLongOrNull() } ?: 300L
                    remoteCommandHandler.handleCommand(
                        com.phonefarm.client.remote.RemoteCommand.Swipe(requestId, x1, y1, x2, y2, dur)
                    )
                }
                "type" -> {
                    val text = params?.get("text")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } ?: ""
                    remoteCommandHandler.handleCommand(
                        com.phonefarm.client.remote.RemoteCommand.Type(requestId, text)
                    )
                }
                "launch" -> {
                    val pkg = params?.get("packageName")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } ?: ""
                    remoteCommandHandler.handleCommand(
                        com.phonefarm.client.remote.RemoteCommand.Launch(requestId, pkg)
                    )
                }
                "start_app" -> {
                    val pkg = params?.get("packageName")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } ?: ""
                    remoteCommandHandler.handleCommand(
                        com.phonefarm.client.remote.RemoteCommand.StartApp(requestId, pkg)
                    )
                }
                "stop_app" -> {
                    val pkg = params?.get("packageName")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } ?: ""
                    remoteCommandHandler.handleCommand(
                        com.phonefarm.client.remote.RemoteCommand.StopApp(requestId, pkg)
                    )
                }
                "clear_app_data" -> {
                    val pkg = params?.get("packageName")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } ?: ""
                    remoteCommandHandler.handleCommand(
                        com.phonefarm.client.remote.RemoteCommand.ClearAppData(requestId, pkg)
                    )
                }
                "modify_setting" -> {
                    val ns = params?.get("namespace")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } ?: "system"
                    val key = params?.get("key")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } ?: ""
                    val value = params?.get("value")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } ?: ""
                    remoteCommandHandler.handleCommand(
                        com.phonefarm.client.remote.RemoteCommand.ModifySetting(requestId, ns, key, value)
                    )
                }
                "config_push" -> {
                    Log.i(TAG, "Config push received: ${params}")
                    RemoteCmdResult.Success("Config applied")
                }
                else -> {
                    Log.w(TAG, "Unknown remote command: ${msg.command}")
                    RemoteCmdResult.Error("Unknown command: ${msg.command}")
                }
            }

            // Send result back to server
            when (result) {
                is RemoteCmdResult.Success -> {
                    webSocketClient.send(
                        WebSocketMessage.RemoteCommandResult(
                            commandId = requestId,
                            success = true,
                            result = result.output,
                            durationMs = 0,
                        )
                    )
                }
                is RemoteCmdResult.Error -> {
                    Log.w(TAG, "Remote command failed: ${msg.command} — ${result.message}")
                    webSocketClient.send(
                        WebSocketMessage.RemoteCommandResult(
                            commandId = requestId,
                            success = false,
                            result = result.message,
                            durationMs = 0,
                        )
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Remote command execution error: ${msg.command}", e)
            webSocketClient.send(
                WebSocketMessage.RemoteCommandResult(
                    commandId = requestId,
                    success = false,
                    result = e.message ?: "Unknown error",
                    durationMs = 0,
                )
            )
        }
    }

    private suspend fun handleTaskComplete(msg: WebSocketMessage.TaskComplete) {
        val payload = msg.payload ?: return
        Log.i(TAG, "Task complete: taskId=${payload.taskId} status=${payload.status} steps=${payload.totalSteps}")
        scriptEngine?.stop()
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
