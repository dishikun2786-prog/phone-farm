package com.phonefarm.client.edge

import android.graphics.Bitmap
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import com.phonefarm.client.edge.model.*
import dagger.hilt.android.scopes.ViewModelScoped
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 边缘 CV 管线编排器。
 *
 * 三阶段执行:
 *   阶段 1: OpenCV 屏幕分析 (必须, < 15ms)
 *   阶段 2: 本地快速反应检查 (< 1ms)
 *   阶段 3: OCR + YOLO 并行 (并行, < 80ms) -> 状态编译
 *
 * 性能约束: 总延迟 p95 < 150ms (1080p 输入)
 */
@Singleton
class EdgePipeline @Inject constructor(
    private val screenAnalyzer: ScreenAnalyzer,
    private val textExtractor: TextExtractor,
    private val uiDetector: UiDetector,
    private val stateCompiler: StateCompiler,
    val localReactor: LocalReactor,
    private val stateProtobuf: StateProtobuf
) {
    private val pipelineScope = CoroutineScope(
        Dispatchers.Default + SupervisorJob() + CoroutineName("EdgePipeline")
    )

    val isModelReady: StateFlow<Boolean> = uiDetector.isReady

    /**
     * 管线总入口。
     *
     * @param screenshot 当前屏幕截图
     * @param currentApp 当前前台应用包名
     * @param appLabel 应用名称
     * @param a11yRoot A11y 服务根节点
     * @param taskContext 当前任务上下文
     * @return 管线结果
     */
    suspend fun process(
        screenshot: Bitmap,
        currentApp: String,
        appLabel: String,
        a11yRoot: AccessibilityNodeInfo?,
        taskContext: TaskContext?
    ): ProcessResult = withContext(pipelineScope.coroutineContext) {
        val t0 = SystemClock.elapsedRealtime()

        // ── Phase 1: OpenCV Screen Analysis ──
        val change = screenAnalyzer.analyze(screenshot)

        // ── Phase 2: Local Fast Reaction ──
        val localAction = localReactor.evaluate(change, currentApp, taskContext)
        if (localAction != null) {
            return@withContext ProcessResult.LocalReact(localAction, change)
        }

        // ── Phase 3: OCR + YOLO in Parallel ──
        val ocrDeferred = async { extractTextSafe(screenshot) }
        val yoloDeferred = async { detectUiSafe(screenshot) }

        val ocr = ocrDeferred.await()
        val yolo = yoloDeferred.await()

        // ── Phase 4: State Compilation ──
        val screenWidth = screenshot.width
        val screenHeight = screenshot.height

        val compiled = stateCompiler.compile(
            deviceId = "", // Set by caller
            currentApp = currentApp,
            appLabel = appLabel,
            a11yRoot = a11yRoot,
            change = change,
            ocr = ocr,
            yolo = yolo,
            screenWidth = screenWidth,
            screenHeight = screenHeight,
            taskState = taskContext?.let {
                TaskState(
                    currentTaskId = it.taskId,
                    stepNumber = it.stepNumber,
                    lastAction = it.lastAction,
                    lastOutcome = null
                )
            }
        )

        // ── Phase 5: Attach Screenshot only if needed ──
        // Screenshot included only when anomaly flags are non-empty
        val screenshotJpeg = if (compiled.anomalyFlags.isNotEmpty()) {
            compressToJpeg(screenshot, 70)
        } else {
            null
        }

        val elapsedMs = SystemClock.elapsedRealtime() - t0
        if (elapsedMs > 200) {
            android.util.Log.w("EdgePipeline", "Pipeline took ${elapsedMs}ms (target: <150ms)")
        }

        ProcessResult.UploadState(
            state = compiled,
            screenshotJpeg = screenshotJpeg
        )
    }

    /**
     * 获取序列化后的状态 JSON (用于 WebSocket 发送)。
     */
    fun serializeState(state: CompiledState): String {
        return stateProtobuf.toJson(state)
    }

    /**
     * 重置管线状态 (任务切换时调用)。
     */
    fun reset() {
        screenAnalyzer.reset()
    }

    // ── Private ──

    private suspend fun extractTextSafe(screenshot: Bitmap): OcrResult? {
        return try {
            textExtractor.extract(screenshot)
        } catch (e: Exception) {
            android.util.Log.w("EdgePipeline", "OCR failed: ${e.message}")
            null
        }
    }

    private suspend fun detectUiSafe(screenshot: Bitmap): DetectionResult? {
        return try {
            if (_isReady.value) {
                uiDetector.detect(screenshot)
            } else {
                null
            }
        } catch (e: Exception) {
            android.util.Log.w("EdgePipeline", "YOLO detection failed: ${e.message}")
            null
        }
    }

    private val _isReady: StateFlow<Boolean> get() = uiDetector.isReady

    /**
     * 将 Bitmap 压缩为 JPEG 字节数组。
     */
    private fun compressToJpeg(bitmap: Bitmap, quality: Int): ByteArray {
        val stream = java.io.ByteArrayOutputStream()
        // Scale down for bandwidth efficiency
        val scaled = if (bitmap.width > 720) {
            val ratio = 720f / bitmap.width
            Bitmap.createScaledBitmap(bitmap, 720, (bitmap.height * ratio).toInt(), true)
        } else {
            bitmap
        }
        scaled.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        if (scaled !== bitmap) scaled.recycle()
        return stream.toByteArray()
    }
}
