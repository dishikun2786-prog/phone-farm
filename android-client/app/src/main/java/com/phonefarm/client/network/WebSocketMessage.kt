package com.phonefarm.client.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * Sealed class hierarchy for all PhoneFarm WebSocket message types.
 *
 * Every message has a `type` field used for polymorphic serialization.
 * Types are organized into categories:
 * - Session layer: auth, heartbeat
 * - Device layer: device_online, device_offline, device_heartbeat, device_screenshot
 * - Task layer: start_task, stop_task, task_status_update, task_result
 * - Config layer: config_update, deploy_scripts, vlm_config_update
 * - Command layer: shell_command, screenshot_request, remote_command, remote_command_result
 * - File layer: file_push, file_pull
 * - System layer: activate, activation_status, plugin_update, model_status, alert_notification
 *
 * Extended messages: VideoFrame, ControlMessage (binary; see ProtobufCodec).
 */
@Serializable
sealed class WebSocketMessage {
    abstract val type: String

    // ---- Session ----

    @Serializable
    data class Auth(
        override val type: String = "auth",
        val token: String,
        val deviceId: String,
        val clientVersion: String,
    ) : WebSocketMessage()

    @Serializable
    data class Heartbeat(
        override val type: String = "heartbeat",
        val timestamp: Long,
        val seq: Int,
    ) : WebSocketMessage()

    // ---- Device ----

    @Serializable
    data class DeviceOnline(
        override val type: String = "device_online",
        val deviceId: String,
        val deviceName: String,
        val model: String,
        val androidVersion: Int,
        val scriptVersion: String,
        val ipAddress: String,
    ) : WebSocketMessage()

    @Serializable
    data class DeviceOffline(
        override val type: String = "device_offline",
        val deviceId: String,
        val reason: String,
    ) : WebSocketMessage()

    @Serializable
    data class DeviceHeartbeat(
        override val type: String = "device_heartbeat",
        val deviceId: String,
        val timestamp: Long,
        val batteryLevel: Int,
        val batteryCharging: Boolean,
        val screenOn: Boolean,
        val currentPackage: String?,
        val activeTaskCount: Int,
        val memoryMb: Int,
        val cpuUsage: Int,
    ) : WebSocketMessage()

    @Serializable
    data class DeviceScreenshot(
        override val type: String = "device_screenshot",
        val deviceId: String,
        val imageBase64: String,
        val format: String, // "jpeg" | "png" | "webp"
        val width: Int,
        val height: Int,
        val timestamp: Long,
    ) : WebSocketMessage()

    // ---- Task ----

    @Serializable
    data class StartTask(
        override val type: String = "start_task",
        val taskId: String,
        val scriptName: String,
        val platform: String?,
        val config: JsonObject,
        val priority: Int = 0,
    ) : WebSocketMessage()

    @Serializable
    data class StopTask(
        override val type: String = "stop_task",
        val taskId: String,
        val reason: String?,
    ) : WebSocketMessage()

    @Serializable
    data class TaskStatusUpdate(
        override val type: String = "task_status_update",
        val taskId: String,
        val status: String, // "running", "completed", "failed", "timeout", "stopped"
        val progress: Int, // 0-100
        val message: String?,
        val timestamp: Long,
    ) : WebSocketMessage()

    @Serializable
    data class TaskResult(
        override val type: String = "task_result",
        val taskId: String,
        val success: Boolean,
        val stats: JsonObject?,
        val errorMessage: String?,
        val durationMs: Long,
    ) : WebSocketMessage()

    // ---- Config ----

    @Serializable
    data class ConfigUpdate(
        override val type: String = "config_update",
        val configKey: String,
        val configValue: String,
        val version: Int,
    ) : WebSocketMessage()

    @Serializable
    data class DeployScripts(
        override val type: String = "deploy_scripts",
        val manifest: Map<String, String>, // name → sha256
    ) : WebSocketMessage()

    @Serializable
    data class VlmConfigUpdate(
        override val type: String = "vlm_config_update",
        val modelName: String?,
        val maxSteps: Int?,
        val endpointUrl: String?,
    ) : WebSocketMessage()

    // ---- Command ----

    @Serializable
    data class ShellCommand(
        override val type: String = "shell_command",
        val commandId: String,
        val command: String,
        val timeoutMs: Long = 30000,
    ) : WebSocketMessage()

    @Serializable
    data class ScreenshotRequest(
        override val type: String = "screenshot_request",
        val requestId: String,
        val scale: Float = 0.5f,
        val quality: Int = 80,
        val format: String = "jpeg",
    ) : WebSocketMessage()

    @Serializable
    data class RemoteCommand(
        override val type: String = "remote_command",
        val commandId: String,
        val action: String, // "click", "swipe", "input", "back", "home", "launch", "screenshot"
        val params: JsonObject?,
    ) : WebSocketMessage()

    @Serializable
    data class RemoteCommandResult(
        override val type: String = "remote_command_result",
        val commandId: String,
        val success: Boolean,
        val result: String?,
        val durationMs: Long,
    ) : WebSocketMessage()

    // ---- File ----

    @Serializable
    data class FilePush(
        override val type: String = "file_push",
        val fileId: String,
        val remotePath: String,
        val contentBase64: String,
        val overwrite: Boolean = true,
    ) : WebSocketMessage()

    @Serializable
    data class FilePull(
        override val type: String = "file_pull",
        val fileId: String,
        val localPath: String,
    ) : WebSocketMessage()

    // ---- System ----

    @Serializable
    data class Activate(
        override val type: String = "activate",
        val activationCode: String,
        val deviceId: String,
        val deviceName: String?,
    ) : WebSocketMessage()

    @Serializable
    data class ActivationStatus(
        override val type: String = "activation_status",
        val success: Boolean,
        val message: String?,
        val expiresAt: Long?,
    ) : WebSocketMessage()

    @Serializable
    data class PluginUpdate(
        override val type: String = "plugin_update",
        val pluginId: String,
        val version: String,
        val downloadUrl: String?,
        val sha256: String?,
    ) : WebSocketMessage()

    @Serializable
    data class ModelStatus(
        override val type: String = "model_status",
        val modelId: String,
        val status: String, // "downloading", "ready", "loaded", "error"
        val progress: Int,
        val errorMessage: String?,
    ) : WebSocketMessage()

    @Serializable
    data class AlertNotification(
        override val type: String = "alert_notification",
        val alertType: String, // "task", "system", "update", "alert"
        val title: String,
        val body: String,
        val actionUrl: String?,
        val isRead: Boolean = false,
        val timestamp: Long,
    ) : WebSocketMessage()
}

/**
 * Connection state enum for the WebSocket lifecycle.
 */
enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING,
    AUTHENTICATED,
}
