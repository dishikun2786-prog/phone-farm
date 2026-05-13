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

    data class Home(override val commandId: String) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.MEDIUM }

    data class Back(override val commandId: String) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.MEDIUM }

    data class Tap(override val commandId: String, val x: Float, val y: Float) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.MEDIUM }

    data class Swipe(
        override val commandId: String,
        val x1: Float, val y1: Float,
        val x2: Float, val y2: Float,
        val durationMs: Long = 300L,
    ) : RemoteCommand() { override val requiredPermission = PermissionLevel.MEDIUM }

    data class Type(override val commandId: String, val text: String) :
        RemoteCommand() { override val requiredPermission = PermissionLevel.MEDIUM }

    data class Launch(override val commandId: String, val packageName: String) :
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
                is RemoteCommand.Home -> handleHome(command)
                is RemoteCommand.Back -> handleBack(command)
                is RemoteCommand.Tap -> handleTap(command)
                is RemoteCommand.Swipe -> handleSwipe(command)
                is RemoteCommand.Type -> handleType(command)
                is RemoteCommand.Launch -> handleLaunch(command)
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

    private suspend fun handleHome(cmd: RemoteCommand.Home): RemoteCommandResult {
        val service = accessibilityService ?: return RemoteCommandResult.Error("Accessibility service not running")
        return if (service.home()) RemoteCommandResult.Success("Home")
        else RemoteCommandResult.Error("Home action failed")
    }

    private suspend fun handleBack(cmd: RemoteCommand.Back): RemoteCommandResult {
        val service = accessibilityService ?: return RemoteCommandResult.Error("Accessibility service not running")
        return if (service.back()) RemoteCommandResult.Success("Back")
        else RemoteCommandResult.Error("Back action failed")
    }

    private suspend fun handleTap(cmd: RemoteCommand.Tap): RemoteCommandResult {
        val service = accessibilityService ?: return RemoteCommandResult.Error("Accessibility service not running")
        service.click(cmd.x, cmd.y)
        return RemoteCommandResult.Success("Tap at (${cmd.x}, ${cmd.y})")
    }

    private suspend fun handleSwipe(cmd: RemoteCommand.Swipe): RemoteCommandResult {
        val service = accessibilityService ?: return RemoteCommandResult.Error("Accessibility service not running")
        service.swipe(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.durationMs)
        return RemoteCommandResult.Success("Swipe from (${cmd.x1},${cmd.y1}) to (${cmd.x2},${cmd.y2})")
    }

    private suspend fun handleType(cmd: RemoteCommand.Type): RemoteCommandResult {
        val service = accessibilityService ?: return RemoteCommandResult.Error("Accessibility service not running")
        service.inputText(cmd.text)
        return RemoteCommandResult.Success("Typed: ${cmd.text}")
    }

    private suspend fun handleLaunch(cmd: RemoteCommand.Launch): RemoteCommandResult {
        try {
            val intent = context.packageManager.getLaunchIntentForPackage(cmd.packageName)
                ?: return RemoteCommandResult.Error("Package not found: ${cmd.packageName}")
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            return RemoteCommandResult.Success("Launched ${cmd.packageName}")
        } catch (e: Exception) {
            return RemoteCommandResult.Error("Launch failed: ${e.message}")
        }
    }

    private suspend fun handleReboot(cmd: RemoteCommand.Reboot): RemoteCommandResult {
        return try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
            pm.reboot(null)
            RemoteCommandResult.Success("Rebooting")
        } catch (e: Exception) {
            // Fallback: shell reboot (requires root/Shizuku)
            try {
                Runtime.getRuntime().exec(arrayOf("reboot"))
                RemoteCommandResult.Success("Rebooting (shell)")
            } catch (e2: Exception) {
                RemoteCommandResult.Error("Reboot failed: need root or system permission")
            }
        }
    }

    private suspend fun handleLockScreen(cmd: RemoteCommand.LockScreen): RemoteCommandResult {
        return try {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
            dpm.lockNow()
            RemoteCommandResult.Success("Screen locked")
        } catch (e: Exception) {
            // Fallback: simulate power button via accessibility service
            val service = accessibilityService
            if (service != null) {
                service.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN)
                RemoteCommandResult.Success("Screen locked (A11y)")
            } else {
                RemoteCommandResult.Error("LockScreen failed: ${e.message}")
            }
        }
    }

    private suspend fun handleUnlockScreen(cmd: RemoteCommand.UnlockScreen): RemoteCommandResult {
        val service = accessibilityService ?: return RemoteCommandResult.Error("Accessibility service not running")
        // Dismiss keyguard by swiping up from bottom
        try {
            val wm = context.getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager
            val metrics = android.util.DisplayMetrics()
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealMetrics(metrics)
            val cx = metrics.widthPixels / 2f
            val startY = metrics.heightPixels * 0.8f
            val endY = metrics.heightPixels * 0.2f
            service.swipe(cx, startY, cx, endY, 200)
            RemoteCommandResult.Success("Unlock swipe performed")
        } catch (e: Exception) {
            RemoteCommandResult.Error("UnlockScreen failed: ${e.message}")
        }
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
        return try {
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            am.killBackgroundProcesses(cmd.packageName)
            RemoteCommandResult.Success("Stopped ${cmd.packageName}")
        } catch (e: Exception) {
            // Fallback: am force-stop via shell (requires Shizuku/root)
            try {
                Runtime.getRuntime().exec(arrayOf("am", "force-stop", cmd.packageName))
                RemoteCommandResult.Success("Stopped ${cmd.packageName} (shell)")
            } catch (e2: Exception) {
                RemoteCommandResult.Error("StopApp failed: ${e.message} | shell: ${e2.message}")
            }
        }
    }

    private suspend fun handleClearAppData(cmd: RemoteCommand.ClearAppData): RemoteCommandResult {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("pm", "clear", cmd.packageName))
            process.waitFor()
            val output = process.inputStream.bufferedReader().readText().trim()
            if (output.contains("Success")) {
                RemoteCommandResult.Success("Cleared ${cmd.packageName} data: $output")
            } else {
                RemoteCommandResult.Error("ClearAppData failed: $output")
            }
        } catch (e: Exception) {
            RemoteCommandResult.Error("ClearAppData failed: ${e.message}")
        }
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
        return try {
            val resolved = when (cmd.namespace.lowercase()) {
                "system" -> android.provider.Settings.System
                "secure" -> android.provider.Settings.Secure
                "global" -> android.provider.Settings.Global
                else -> return RemoteCommandResult.Error("Unknown namespace: ${cmd.namespace}")
            }
            if (!android.provider.Settings.System.canWrite(context)) {
                // Try via shell for WRITE_SECURE_SETTINGS guarded keys
                val process = Runtime.getRuntime().exec(
                    arrayOf("settings", "put", cmd.namespace.lowercase(), cmd.key, cmd.value)
                )
                process.waitFor()
                return RemoteCommandResult.Success("Setting ${cmd.key}=${cmd.value} (shell)")
            }
            android.provider.Settings.System.putString(context.contentResolver, cmd.key, cmd.value)
            RemoteCommandResult.Success("Setting ${cmd.key}=${cmd.value}")
        } catch (e: Exception) {
            RemoteCommandResult.Error("ModifySetting failed: ${e.message}")
        }
    }
}
