package com.phonefarm.client.network

import android.util.Log
import com.phonefarm.client.data.local.SecurePreferences
import com.phonefarm.client.di.TokenHolder
import com.phonefarm.client.engine.ScriptEngine
import com.phonefarm.client.remote.RemoteCommandHandler
import com.phonefarm.client.service.PhoneFarmAccessibilityService
import com.phonefarm.client.vlm.VlmAgent
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Central dispatcher for inbound WebSocket messages from the control server.
 *
 * Routes messages by type to their respective handlers:
 *   auth_ok          → complete connection handshake
 *   start_task       → ScriptEngine
 *   stop_task        → ScriptEngine
 *   config_update    → CloudConfigSyncer
 *   screenshot_request → RemoteScreenshotCapture
 *   remote_command   → RemoteCommandHandler
 *   shell_command    → RemoteShellExecutor
 */
@Singleton
class WebSocketMessageDispatcher @Inject constructor(
    private val webSocketClient: WebSocketClient,
    private val cloudConfigSyncer: CloudConfigSyncer,
    private val remoteCommandHandler: RemoteCommandHandler,
    private val securePreferences: SecurePreferences,
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
    fun setAccessibilityService(service: PhoneFarmAccessibilityService) { accessibilityService = service }

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
            is WebSocketMessage.AuthOk -> handleAuthOk(message)
            is WebSocketMessage.StartTask -> handleStartTask(message)
            is WebSocketMessage.StopTask -> handleStopTask(message)
            is WebSocketMessage.ConfigUpdate -> handleConfigUpdate(message)
            is WebSocketMessage.DeployScripts -> handleDeployScripts(message)
            is WebSocketMessage.ScreenshotRequest -> handleScreenshotRequest(message)
            is WebSocketMessage.RemoteCommand -> handleRemoteCommand(message)
            is WebSocketMessage.DeviceOnline,
            is WebSocketMessage.DeviceOffline,
            is WebSocketMessage.DeviceHeartbeat,
            is WebSocketMessage.TaskStatusUpdate,
            is WebSocketMessage.TaskResult,
            is WebSocketMessage.Heartbeat,
            is WebSocketMessage.Auth,
            is WebSocketMessage.DeviceScreenshot,
            is WebSocketMessage.VlmConfigUpdate,
            is WebSocketMessage.AlertNotification,
            is WebSocketMessage.PluginUpdate,
            is WebSocketMessage.ModelStatus,
            is WebSocketMessage.ActivationStatus,
            is WebSocketMessage.Activate,
            is WebSocketMessage.FilePush,
            is WebSocketMessage.FilePull,
            is WebSocketMessage.ShellCommand,
            is WebSocketMessage.AuthError -> {
                Log.d(TAG, "Unhandled message type: ${message.type}")
            }
        }
    }

    private fun handleAuthOk(msg: WebSocketMessage.AuthOk) {
        Log.i(TAG, "WebSocket authenticated. udpPort=${msg.udpPort}")
        // Connection is now fully established — ready to receive task instructions
    }

    private suspend fun handleStartTask(msg: WebSocketMessage.StartTask) {
        val engine = scriptEngine ?: run {
            Log.w(TAG, "ScriptEngine not initialized — cannot start task")
            reportTaskResult(msg.taskId, false, "ScriptEngine not ready")
            return
        }

        try {
            Log.i(TAG, "Starting task: ${msg.scriptName} (taskId=${msg.taskId})")
            engine.execute(msg.scriptName, msg.config ?: emptyMap())
            reportTaskResult(msg.taskId, true, null)
        } catch (e: Exception) {
            Log.e(TAG, "Task failed: ${msg.scriptName}", e)
            reportTaskResult(msg.taskId, false, e.message ?: "Unknown error")
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
            val screenshot = service.takeScreenshot()
            if (screenshot != null) {
                webSocketClient.send(
                    WebSocketMessage.DeviceScreenshot(
                        deviceId = "",
                        data = android.util.Base64.encodeToString(screenshot, android.util.Base64.NO_WRAP),
                    )
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Screenshot capture failed", e)
        }
    }

    private suspend fun handleRemoteCommand(msg: WebSocketMessage.RemoteCommand) {
        val cmd = com.phonefarm.client.remote.RemoteCommand.Screenshot(
            commandId = msg.commandId,
        )
        val result = remoteCommandHandler.handleCommand(cmd)
        when (result) {
            is com.phonefarm.client.remote.RemoteCommandResult.Success -> {
                webSocketClient.send(
                    WebSocketMessage.TaskResult(
                        type = "remote_command_result",
                        deviceId = "",
                        taskId = msg.commandId,
                        status = "completed",
                        stats = mapOf("output" to (result.output ?: "")),
                    )
                )
            }
            is com.phonefarm.client.remote.RemoteCommandResult.Error -> {
                Log.w(TAG, "Remote command failed: ${result.message}")
            }
        }
    }

    private fun reportTaskResult(taskId: String, success: Boolean, error: String?) {
        webSocketClient.send(
            WebSocketMessage.TaskResult(
                type = "task_result",
                deviceId = "",
                taskId = taskId,
                status = if (success) "completed" else "failed",
                stats = if (error != null) mapOf("error" to error) else emptyMap(),
            )
        )
    }

    fun stop() {
        scope.cancel()
    }
}
