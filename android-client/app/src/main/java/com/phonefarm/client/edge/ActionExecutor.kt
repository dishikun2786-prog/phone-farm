package com.phonefarm.client.edge

import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import com.phonefarm.client.edge.model.DeviceAction
import com.phonefarm.client.service.PhoneFarmAccessibilityService
import kotlinx.coroutines.delay
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 统一设备动作执行器。
 *
 * 接收 [DeviceAction] 密封类，通过 [PhoneFarmAccessibilityService]
 * 执行物理手势，返回结构化结果。这是边缘-云端架构中执行层的唯一入口。
 *
 * 覆盖全部 11 种 DeviceAction 变体:
 *   Tap, LongPress, Swipe, Type, Back, Home,
 *   Launch, Wait, Terminate, DismissKeyboard, AutoConfirm
 */
@Singleton
class ActionExecutor @Inject constructor() {

    companion object {
        private const val TAG = "ActionExecutor"
    }

    /**
     * 执行单个设备动作。
     *
     * @param action 要执行的设备动作
     * @return 执行结果
     */
    suspend fun execute(action: DeviceAction): ExecutionResult {
        val service = PhoneFarmAccessibilityService.instance
        if (service == null) {
            android.util.Log.w(TAG, "AccessibilityService unavailable — cannot execute $action")
            return ExecutionResult.ServiceUnavailable
        }

        val t0 = SystemClock.elapsedRealtime()

        return try {
            when (action) {
                is DeviceAction.Tap -> {
                    service.click(action.x.toFloat(), action.y.toFloat())
                }
                is DeviceAction.LongPress -> {
                    service.longPress(
                        action.x.toFloat(), action.y.toFloat(), action.durationMs.toLong()
                    )
                }
                is DeviceAction.Swipe -> {
                    service.swipe(
                        action.x1.toFloat(), action.y1.toFloat(),
                        action.x2.toFloat(), action.y2.toFloat(),
                        action.durationMs.toLong()
                    )
                }
                is DeviceAction.Type -> {
                    service.inputText(action.text)
                }
                is DeviceAction.Back -> {
                    service.back()
                }
                is DeviceAction.Home -> {
                    service.home()
                }
                is DeviceAction.Launch -> {
                    launchApp(action.packageName)
                }
                is DeviceAction.Wait -> {
                    delay(action.durationMs.toLong())
                }
                is DeviceAction.Terminate -> {
                    // No UI action; termination handled at orchestration level
                }
                is DeviceAction.DismissKeyboard -> {
                    service.dismissKeyboard()
                }
                is DeviceAction.AutoConfirm -> {
                    // AutoConfirm = Tap at pre-determined coordinates
                    service.click(action.x.toFloat(), action.y.toFloat())
                }
            }

            // Post-action UI stabilization
            delay(200)

            val durationMs = SystemClock.elapsedRealtime() - t0
            ExecutionResult.Success(action, durationMs)
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Action execution failed: $action", e)
            val durationMs = SystemClock.elapsedRealtime() - t0
            ExecutionResult.Failed(action, e.message ?: "Unknown error", durationMs)
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
