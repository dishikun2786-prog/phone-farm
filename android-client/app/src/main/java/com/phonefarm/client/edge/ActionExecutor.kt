package com.phonefarm.client.edge

import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import android.view.accessibility.AccessibilityNodeInfo
import android.view.inputmethod.InputMethodManager
import com.phonefarm.client.edge.model.DeviceAction
import com.phonefarm.client.privilege.ShizukuActionExecutor
import com.phonefarm.client.service.PhoneFarmAccessibilityService
import com.phonefarm.client.service.PhoneFarmInputMethodService
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Unified device action executor with multi-strategy support.
 *
 * Execution priority:
 *   DeviceOwner > Shizuku > AccessibilityService (fallback)
 *
 * For Type actions with non-ASCII text, uses PhoneFarmIME for reliable
 * input instead of AccessibilityService ACTION_SET_TEXT.
 */
@Singleton
class ActionExecutor @Inject constructor(
    @ApplicationContext val context: Context,
    private val shizukuExecutor: ShizukuActionExecutor?,
) {

    companion object {
        private const val TAG = "ActionExecutor"
        private const val IME_SWITCH_TIMEOUT_MS = 3000L
    }

    /** Execution strategy for touch actions. */
    enum class Strategy {
        /** Use Shizuku `input` command (faster, more reliable) */
        SHIZUKU,
        /** Use AccessibilityService.dispatchGesture() (fallback) */
        ACCESSIBILITY,
    }

    /** Current execution strategy — set externally based on privilege level. */
    @Volatile
    var touchStrategy: Strategy = Strategy.ACCESSIBILITY

    /**
     * Execute a single device action.
     */
    suspend fun execute(action: DeviceAction): ExecutionResult {
        val t0 = SystemClock.elapsedRealtime()

        return try {
            // Try Shizuku first for touch actions
            if (touchStrategy == Strategy.SHIZUKU && shizukuExecutor?.isAvailable() == true) {
                when (action) {
                    is DeviceAction.Tap,
                    is DeviceAction.LongPress,
                    is DeviceAction.Swipe,
                    is DeviceAction.Back,
                    is DeviceAction.Home,
                    is DeviceAction.Launch,
                    is DeviceAction.DismissKeyboard,
                    is DeviceAction.AutoConfirm -> {
                        val ok = shizukuExecutor.executeAction(action)
                        if (ok) {
                            delay(100)
                            val durationMs = SystemClock.elapsedRealtime() - t0
                            return ExecutionResult.Success(action, durationMs)
                        }
                        // Fall through to A11y on Shizuku failure
                    }
                    else -> {} // Type, Wait, Terminate handled below
                }
            }

            // AccessibilityService fallback
            val service = PhoneFarmAccessibilityService.instance
            if (service == null) {
                android.util.Log.w(TAG, "AccessibilityService unavailable — cannot execute $action")
                return ExecutionResult.ServiceUnavailable
            }

            when (action) {
                is DeviceAction.Tap -> service.click(action.x.toFloat(), action.y.toFloat())
                is DeviceAction.LongPress -> service.longPress(
                    action.x.toFloat(), action.y.toFloat(), action.durationMs.toLong()
                )
                is DeviceAction.Swipe -> service.swipe(
                    action.x1.toFloat(), action.y1.toFloat(),
                    action.x2.toFloat(), action.y2.toFloat(),
                    action.durationMs.toLong()
                )
                is DeviceAction.Type -> executeType(action.text)
                is DeviceAction.Back -> service.back()
                is DeviceAction.Home -> service.home()
                is DeviceAction.Launch -> launchApp(action.packageName)
                is DeviceAction.Wait -> delay(action.durationMs.toLong())
                is DeviceAction.Terminate -> {} // Handled at orchestration level
                is DeviceAction.DismissKeyboard -> service.dismissKeyboard()
                is DeviceAction.AutoConfirm -> service.click(action.x.toFloat(), action.y.toFloat())
            }

            delay(200)
            val durationMs = SystemClock.elapsedRealtime() - t0
            ExecutionResult.Success(action, durationMs)
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Action execution failed: $action", e)
            val durationMs = SystemClock.elapsedRealtime() - t0
            ExecutionResult.Failed(action, e.message ?: "Unknown error", durationMs)
        }
    }

    /**
     * Execute a Type action with IME-based input for reliable text entry.
     *
     * For non-ASCII text (Chinese, Japanese, etc.), switches to PhoneFarmIME,
     * commits the text, and switches back to the previous IME.
     */
    private suspend fun executeType(text: String) {
        val service = PhoneFarmAccessibilityService.instance

        // For ASCII-only text, use AccessibilityService directly
        val isAsciiOnly = text.all { it.code < 128 }
        if (isAsciiOnly) {
            if (service != null) {
                service.inputText(text)
            }
            return
        }

        // For non-ASCII text: use PhoneFarmIME
        val imeInstance = PhoneFarmInputMethodService.instance
        if (imeInstance == null) {
            // Fallback to A11y if IME is not running
            service?.inputText(text)
            return
        }

        try {
            val deferred = CompletableDeferred<Boolean>()

            // Set the pending text for the IME
            imeInstance.setPendingText(text, -1, deferred)

            // Switch to PhoneFarmIME
            switchToPhoneFarmIME()

            // Wait for text commit
            val ok = withTimeoutOrNull(IME_SWITCH_TIMEOUT_MS) {
                deferred.await()
            } ?: false

            if (!ok) {
                android.util.Log.w(TAG, "IME text commit timed out, falling back to A11y")
                service?.inputText(text)
            }

            // Switch back to previous IME
            switchToPreviousIME()
        } catch (e: Exception) {
            android.util.Log.w(TAG, "IME switching failed: ${e.message}")
            service?.inputText(text)
        }
    }

    private fun switchToPhoneFarmIME() {
        try {
            val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            val phoneFarmIMEId = "${context.packageName}/.service.PhoneFarmInputMethodService"
            // Use Settings.Secure to set the default IME (requires WRITE_SECURE_SETTINGS or DeviceOwner)
            Settings.Secure.putString(
                context.contentResolver,
                Settings.Secure.DEFAULT_INPUT_METHOD,
                phoneFarmIMEId
            )
        } catch (e: SecurityException) {
            android.util.Log.w(TAG, "Cannot switch IME without WRITE_SECURE_SETTINGS: ${e.message}")
        }
    }

    private fun switchToPreviousIME() {
        try {
            val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showInputMethodPicker()
        } catch (e: Exception) {
            android.util.Log.w(TAG, "IME restore failed: ${e.message}")
        }
    }

    private fun launchApp(packageName: String) {
        try {
            val cmd = "am start -n $packageName/.MainActivity"
            Runtime.getRuntime().exec(cmd)
        } catch (e: Exception) {
            try {
                Runtime.getRuntime().exec(
                    "monkey -p $packageName -c android.intent.category.LAUNCHER 1"
                )
            } catch (_: Exception) {
                android.util.Log.e(TAG, "Failed to launch $packageName")
            }
        }
    }
}

/**
 * 动作执行结果。
 */
sealed class ExecutionResult {
    /** 动作执行成功 */
    data class Success(
        val action: DeviceAction,
        val durationMs: Long,
    ) : ExecutionResult()

    /** 动作执行失败（异常或权限不足） */
    data class Failed(
        val action: DeviceAction,
        val reason: String,
        val durationMs: Long,
    ) : ExecutionResult()

    /** AccessibilityService 未连接 */
    data object ServiceUnavailable : ExecutionResult()

    /** 便捷：是否成功 */
    val isSuccess: Boolean get() = this is Success
}
