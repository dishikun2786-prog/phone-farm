package com.phonefarm.client.privilege

import android.os.SystemClock
import android.util.Log
import com.phonefarm.client.edge.model.DeviceAction
import com.phonefarm.client.remote.RemoteShellExecutor
import com.phonefarm.client.remote.RemoteCommandResult
import javax.inject.Inject
import javax.inject.Singleton

/**
 * High-privilege touch injection via Shizuku shell commands.
 *
 * Uses Android's `input` command through Shizuku's elevated shell,
 * which bypasses the limitations of AccessibilityService.dispatchGesture():
 * - No "too many gestures" throttling
 * - Faster injection (no AccessibilityService queue delay)
 * - Works across all apps including system dialogs
 *
 * Execution priority in ActionExecutor:
 *   DeviceOwner > Shizuku > AccessibilityService (fallback)
 */
@Singleton
class ShizukuActionExecutor @Inject constructor(
    private val shellExecutor: RemoteShellExecutor,
) {

    companion object {
        private const val TAG = "ShizukuActionExecutor"
    }

    /**
     * Check whether Shizuku-based execution is available.
     */
    fun isAvailable(): Boolean = shellExecutor.isShizukuAvailable()

    /**
     * Execute a tap at pixel coordinates (x, y).
     */
    suspend fun tap(x: Int, y: Int): Boolean {
        val cmd = "input tap $x $y"
        val result = shellExecutor.execute(cmd)
        return result is RemoteCommandResult.Success
    }

    /**
     * Execute a swipe from (x1, y1) to (x2, y2) over durationMs.
     */
    suspend fun swipe(x1: Int, y1: Int, x2: Int, y2: Int, durationMs: Long = 300): Boolean {
        val cmd = "input swipe $x1 $y1 $x2 $y2 $durationMs"
        val result = shellExecutor.execute(cmd)
        return result is RemoteCommandResult.Success
    }

    /**
     * Type text via `input text` (ASCII only). For non-ASCII text,
     * the caller should use PhoneFarmIME instead.
     */
    suspend fun type(text: String): Boolean {
        // Escape special shell characters
        val escaped = text.replace("\"", "\\\"")
            .replace("'", "\\'")
            .replace("\$", "\\\$")
            .replace("`", "\\`")
        val cmd = "input text \"$escaped\""
        val result = shellExecutor.execute(cmd)
        return result is RemoteCommandResult.Success
    }

    /**
     * Launch an app by package name.
     */
    suspend fun launch(packageName: String): Boolean {
        val cmd = "monkey -p $packageName -c android.intent.category.LAUNCHER 1"
        val result = shellExecutor.execute(cmd)
        return result is RemoteCommandResult.Success
    }

    /**
     * Press the back button.
     */
    suspend fun back(): Boolean {
        val cmd = "input keyevent 4"
        val result = shellExecutor.execute(cmd)
        return result is RemoteCommandResult.Success
    }

    /**
     * Press the home button.
     */
    suspend fun home(): Boolean {
        val cmd = "input keyevent 3"
        val result = shellExecutor.execute(cmd)
        return result is RemoteCommandResult.Success
    }

    /**
     * Execute a generic DeviceAction via Shizuku shell.
     * Returns true if the action was executed successfully.
     */
    suspend fun executeAction(action: DeviceAction): Boolean {
        return when (action) {
            is DeviceAction.Tap -> tap(action.x, action.y)
            is DeviceAction.LongPress -> swipe(action.x, action.y, action.x, action.y, action.durationMs.toLong())
            is DeviceAction.Swipe -> swipe(action.x1, action.y1, action.x2, action.y2, action.durationMs.toLong())
            is DeviceAction.Type -> type(action.text)
            is DeviceAction.Back -> back()
            is DeviceAction.Home -> home()
            is DeviceAction.Launch -> launch(action.packageName)
            is DeviceAction.Wait -> {
                kotlinx.coroutines.delay(action.durationMs.toLong())
                true
            }
            is DeviceAction.Terminate -> true
            is DeviceAction.DismissKeyboard -> back()
            is DeviceAction.AutoConfirm -> tap(action.x, action.y)
        }
    }
}
