package com.phonefarm.client.remote

import android.content.Context
import com.phonefarm.client.service.PhoneFarmAccessibilityService
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Server-to-device command dispatch with permission-level checking.
 *
 * Receives command objects (deserialized from WebSocket JSON messages),
 * checks the command's required permission level against the device's
 * current grant state, and dispatches to the appropriate handler.
 *
 * Command permission levels:
 *  - LOW:    read-only (get device info, list files, get battery level)
 *  - MEDIUM: UI automation (click, input text, swipe)
 *  - HIGH:   system-level (shell, reboot, install/remove packages)
 *  - CRITICAL: destructive (factory reset, device wipe)
 */

// ---- sealed command hierarchy ----

sealed class RemoteCommand {
    abstract val commandId: String
    abstract val requiredPermission: PermissionLevel

    /** Minimum permission level required for this command. */
    enum class PermissionLevel(val level: Int) {
        LOW(0),
        MEDIUM(1),
        HIGH(2),
        CRITICAL(3),
    }

    data class Reboot(override val commandId: String) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.CRITICAL }

    data class LockScreen(override val commandId: String) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.MEDIUM }

    data class UnlockScreen(override val commandId: String) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.MEDIUM }

    data class StartApp(override val commandId: String, val packageName: String) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.MEDIUM }

    data class StopApp(override val commandId: String, val packageName: String) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.MEDIUM }

    data class ClearAppData(override val commandId: String, val packageName: String) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.HIGH }

    data class Screenshot(override val commandId: String, val quality: Int = 80, val scale: Float = 0.5f) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.MEDIUM }

    data class Shell(override val commandId: String, val command: String, val timeoutMs: Long = 10_000L) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.HIGH }

    data class FilePush(override val commandId: String, val remotePath: String, val content: ByteArray) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.HIGH }

    data class FilePull(override val commandId: String, val remotePath: String) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.MEDIUM }

    data class FileDelete(override val commandId: String, val remotePath: String) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.HIGH }

    data class FileList(override val commandId: String, val remotePath: String) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.LOW }

    data class ModifySetting(
        override val commandId: String,
        val namespace: String,   // "system", "secure", "global"
        val key: String,
        val value: String,
    ) : RemoteCommand() { override val requiredPermission = PermissionLevel.HIGH }
}

// ---- sealed result hierarchy ----

sealed class RemoteCommandResult {
    data class Success(val output: String? = null, val data: ByteArray? = null) : RemoteCommandResult()
    data class Error(val message: String, val code: Int = -1) : RemoteCommandResult()
}

// ---- handler ----

@Singleton
class RemoteCommandHandler @Inject constructor(
    private val accessibilityService: PhoneFarmAccessibilityService?,
    @ApplicationContext private val context: Context,
    private val remoteScreenshotCapture: RemoteScreenshotCapture,
    private val remoteFileManager: RemoteFileManager,
    private val remoteShellExecutor: RemoteShellExecutor,
) {

    companion object {
        private const val TAG = "RemoteCommandHandler"
    }

    /**
     * The device's current granted permission level.
     * Defaults to LOW (read-only) until explicitly elevated by a trusted command.
     */
    @Volatile
    var currentPermissionLevel: RemoteCommand.PermissionLevel = RemoteCommand.PermissionLevel.LOW

    /**
     * Dispatch a remote command to the appropriate handler.
     *
     * First verifies that [currentPermissionLevel] satisfies the command's
     * [RemoteCommand.requiredPermission], then routes to the specific handler.
     *
     * @param command  Any sealed [RemoteCommand] variant.
     * @return [RemoteCommandResult.Success] or [RemoteCommandResult.Error].
     */
    suspend fun handleCommand(command: RemoteCommand): RemoteCommandResult {
        // Permission check.
        if (currentPermissionLevel.level < command.requiredPermission.level) {
            return RemoteCommandResult.Error(
                "Permission denied: required=${command.requiredPermission}, " +
                    "current=$currentPermissionLevel",
                code = 403,
            )
        }

        return try {
            when (command) {
                is RemoteCommand.Reboot -> handleReboot(command)
                is RemoteCommand.LockScreen -> handleLockScreen(command)
                is RemoteCommand.UnlockScreen -> handleUnlockScreen(command)
                is RemoteCommand.StartApp -> handleStartApp(command)
                is RemoteCommand.StopApp -> handleStopApp(command)
                is RemoteCommand.ClearAppData -> handleClearAppData(command)
                is RemoteCommand.Screenshot -> handleScreenshot(command)
                is RemoteCommand.Shell -> handleShell(command)
                is RemoteCommand.FilePush -> handleFilePush(command)
                is RemoteCommand.FilePull -> handleFilePull(command)
                is RemoteCommand.FileDelete -> handleFileDelete(command)
                is RemoteCommand.FileList -> handleFileList(command)
                is RemoteCommand.ModifySetting -> handleModifySetting(command)
            }
        } catch (e: Exception) {
            RemoteCommandResult.Error("Command execution failed: ${e.message}", code = 500)
        }
    }

    // ---- command handlers ----

    private suspend fun handleReboot(cmd: RemoteCommand.Reboot): RemoteCommandResult {
        // TODO: Issue reboot via PowerManager or Runtime.exec("reboot").
        return RemoteCommandResult.Error("Reboot not yet implemented")
    }

    private suspend fun handleLockScreen(cmd: RemoteCommand.LockScreen): RemoteCommandResult {
        // TODO: Use DevicePolicyManager.lockNow() or simulate power button.
        return RemoteCommandResult.Error("LockScreen not yet implemented")
    }

    private suspend fun handleUnlockScreen(cmd: RemoteCommand.UnlockScreen): RemoteCommandResult {
        // TODO: Dismiss keyguard via WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        //       or simulate swipe up via accessibility service.
        return RemoteCommandResult.Error("UnlockScreen not yet implemented")
    }

    private suspend fun handleStartApp(cmd: RemoteCommand.StartApp): RemoteCommandResult {
        try {
            val intent = context.packageManager.getLaunchIntentForPackage(cmd.packageName)
                ?: return RemoteCommandResult.Error("Package not found: ${cmd.packageName}")
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            return RemoteCommandResult.Success("Started ${cmd.packageName}")
        } catch (e: Exception) {
            return RemoteCommandResult.Error("StartApp failed: ${e.message}")
        }
    }

    private suspend fun handleStopApp(cmd: RemoteCommand.StopApp): RemoteCommandResult {
        // TODO: Force-stop the app via ActivityManager.killBackgroundProcesses
        //       or Runtime.exec("am force-stop ${cmd.packageName}").
        return RemoteCommandResult.Error("StopApp not yet implemented")
    }

    private suspend fun handleClearAppData(cmd: RemoteCommand.ClearAppData): RemoteCommandResult {
        // TODO: Clear app data via DevicePolicyManager.wipeData or
        //       Runtime.exec("pm clear ${cmd.packageName}").
        return RemoteCommandResult.Error("ClearAppData not yet implemented")
    }

    private suspend fun handleScreenshot(cmd: RemoteCommand.Screenshot): RemoteCommandResult {
        return remoteScreenshotCapture.capture(cmd.quality, cmd.scale)
    }

    private suspend fun handleShell(cmd: RemoteCommand.Shell): RemoteCommandResult {
        return remoteShellExecutor.execute(cmd.command, cmd.timeoutMs)
    }

    private suspend fun handleFilePush(cmd: RemoteCommand.FilePush): RemoteCommandResult {
        return remoteFileManager.push(cmd.remotePath, cmd.content)
    }

    private suspend fun handleFilePull(cmd: RemoteCommand.FilePull): RemoteCommandResult {
        return remoteFileManager.pull(cmd.remotePath)
    }

    private suspend fun handleFileDelete(cmd: RemoteCommand.FileDelete): RemoteCommandResult {
        return remoteFileManager.delete(cmd.remotePath)
    }

    private suspend fun handleFileList(cmd: RemoteCommand.FileList): RemoteCommandResult {
        return remoteFileManager.list(cmd.remotePath)
    }

    private suspend fun handleModifySetting(cmd: RemoteCommand.ModifySetting): RemoteCommandResult {
        // TODO: Modify system settings via Settings.System/Secure/Global.putString(),
        //       requiring WRITE_SETTINGS / WRITE_SECURE_SETTINGS permission.
        return RemoteCommandResult.Error("ModifySetting not yet implemented")
    }
}
