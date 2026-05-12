package com.phonefarm.client.edge

import android.graphics.Bitmap
import android.view.accessibility.AccessibilityNodeInfo
import com.phonefarm.client.edge.model.CompiledState
import com.phonefarm.client.edge.model.DeviceAction
import com.phonefarm.client.edge.model.ProcessResult
import com.phonefarm.client.edge.model.TaskContext
import com.phonefarm.client.network.WebSocketClient
import com.phonefarm.client.network.WebSocketMessage
import com.phonefarm.client.service.PhoneFarmAccessibilityService
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 边缘管线主循环 — 感知与执行的桥梁。
 *
 * 驱动 [EdgePipeline.process()] 循环，消费 [ProcessResult]:
 *   - [ProcessResult.LocalReact] → 本地立即执行
 *   - [ProcessResult.UploadState] → 上传云端，等待异步决策
 *   - [ProcessResult.Error] → 记录日志，继续循环
 *
 * 循环间隔: 500ms (可配置)
 */
@Singleton
class EdgeLoop @Inject constructor(
    private val pipeline: EdgePipeline,
    private val actionExecutor: ActionExecutor,
    private val webSocketClient: WebSocketClient,
) {

    companion object {
        private const val TAG = "EdgeLoop"
        private const val CYCLE_INTERVAL_MS = 500L
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob() + CoroutineName("EdgeLoop"))

    private val _isRunning = MutableStateFlow(false)
    val isRunning: StateFlow<Boolean> = _isRunning.asStateFlow()

    private var taskContext: TaskContext? = null
    private var deviceId: String = ""

    /** 最近一次编译的状态快照 (用于 handleCloudDecision 时回传) */
    @Volatile
    private var lastCompiledState: CompiledState? = null

    /** 启动边缘循环 */
    fun start(context: TaskContext, id: String) {
        if (_isRunning.value) return
        taskContext = context
        deviceId = id
        _isRunning.value = true
        android.util.Log.i(TAG, "EdgeLoop started: taskId=${context.taskId} platform=${context.platform}")

        scope.launch {
            while (_isRunning.value) {
                try {
                    tick()
                } catch (e: Exception) {
                    android.util.Log.e(TAG, "EdgeLoop tick error", e)
                    delay(CYCLE_INTERVAL_MS)
                }
            }
            android.util.Log.i(TAG, "EdgeLoop stopped: taskId=${context.taskId}")
        }
    }

    /** 停止边缘循环 */
    fun stop() {
        _isRunning.value = false
        pipeline.reset()
        taskContext = null
        lastCompiledState = null
    }

    /**
     * 消费云端下发的决策并执行。
     * 由 [com.phonefarm.client.network.WebSocketMessageDispatcher] 在收到
     * [WebSocketMessage.ExecuteDecision] 时调用。
     */
    suspend fun handleCloudDecision(action: DeviceAction, finished: Boolean = false) {
        android.util.Log.d(TAG, "Executing cloud decision: $action")
        val result = actionExecutor.execute(action)

        // 回传执行结果到云端
        webSocketClient.send(
            WebSocketMessage.StepResult(
                deviceId = deviceId,
                outcome = if (result.isSuccess) "success" else "fail",
                durationMs = when (result) {
                    is ExecutionResult.Success -> result.durationMs
                    is ExecutionResult.Failed -> result.durationMs
                    else -> 0
                },
            )
        )

        if (finished) {
            android.util.Log.i(TAG, "Cloud decision marked finished — stopping loop")
            stop()
        }
    }

    // ── Private ──

    private suspend fun tick() {
        val service = PhoneFarmAccessibilityService.instance
        if (service == null) {
            android.util.Log.w(TAG, "AccessibilityService not connected — waiting")
            delay(1000)
            return
        }

        // 截图
        val screenshot = service.captureScreen(scale = 0.5f, quality = 80)
        if (screenshot == null) {
            delay(CYCLE_INTERVAL_MS)
            return
        }

        val currentApp = service.rootInActiveWindow?.packageName?.toString() ?: ""
        val appLabel = "" // PackageManager lookup deferred
        val a11yRoot = service.rootInActiveWindow
        val ctx = taskContext ?: return

        try {
            val result = pipeline.process(screenshot, currentApp, appLabel, a11yRoot, ctx)

            when (result) {
                is ProcessResult.LocalReact -> {
                    android.util.Log.i(TAG, "Local reaction: ${result.action} triggered by ${result.change.anomalyFlags}")
                    actionExecutor.execute(result.action)
                }

                is ProcessResult.UploadState -> {
                    lastCompiledState = result.state
                    val json = pipeline.serializeState(result.state)
                    webSocketClient.send(
                        WebSocketMessage.EdgeState(
                            deviceId = deviceId,
                            stateJson = json,
                            screenshotBase64 = result.screenshotJpeg?.let {
                                android.util.Base64.encodeToString(it, android.util.Base64.NO_WRAP)
                            },
                        )
                    )
                }

                is ProcessResult.Error -> {
                    android.util.Log.w(TAG, "Pipeline error: ${result.message}")
                }
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Pipeline process failed", e)
        } finally {
            screenshot.recycle()
            a11yRoot?.recycle()
        }

        delay(CYCLE_INTERVAL_MS)
    }
}
