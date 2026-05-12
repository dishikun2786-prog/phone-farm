package com.phonefarm.client.edge

import android.content.res.AssetManager
import android.graphics.Bitmap
import android.graphics.Rect
import androidx.annotation.Keep
import com.phonefarm.client.edge.model.Detection
import com.phonefarm.client.edge.model.DetectionResult
import dagger.hilt.android.scopes.ViewModelScoped
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.support.common.FileUtil
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import javax.inject.Inject
import javax.inject.Singleton

/**
 * YOLO-nano TFLite UI 元素检测器。
 *
 * 检测 10 类 UI 元素:
 *   button, text_input, image, icon, toggle,
 *   keyboard, nav_bar, ad_banner, video, webview
 *
 * 输入: 320x320 RGB
 * 输出: N 个检测框 (class_id, cx, cy, w, h, confidence)
 *
 * 性能: < 50ms (TFLite GPU delegate) / < 80ms (CPU fallback)
 */
@Singleton
class UiDetector @Inject constructor() {

    companion object {
        private const val MODEL_FILE = "models/yolo_nano_ui.tflite"
        private const val LABEL_FILE = "models/yolo_ui_labels.txt"
        private const val INPUT_SIZE = 320
        private const val CONFIDENCE_THRESHOLD = 0.4f
        private const val IOU_THRESHOLD = 0.5f
        private const val MAX_DETECTIONS = 20
    }

    private var interpreter: Interpreter? = null
    private var labels: List<String> = emptyList()

    private val _isReady = MutableStateFlow(false)
    val isReady: StateFlow<Boolean> = _isReady

    /**
     * 初始化 TFLite 模型。
     */
    suspend fun initialize(assetManager: AssetManager) = withContext(Dispatchers.IO) {
        try {
            labels = try {
                assetManager.open(LABEL_FILE).bufferedReader().readLines()
                    .map { it.trim() }.filter { it.isNotEmpty() }
            } catch (_: Exception) {
                listOf("button", "text_input", "image", "icon", "toggle",
                    "keyboard", "nav_bar", "ad_banner", "video", "webview")
            }

            val fd = assetManager.openFd(MODEL_FILE)
            val modelBuffer = FileInputStream(fd.fileDescriptor).channel.map(
                FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength
            )
            val options = Interpreter.Options().apply {
                setNumThreads(4)
            }
            interpreter = Interpreter(modelBuffer, options)
            _isReady.value = true
        } catch (e: Exception) {
            _isReady.value = false
        }
    }

    /**
     * 检测 UI 元素。
     *
     * @param bitmap 输入帧 (任意分辨率, 自动缩放)
     * @return 检测结果
     */
    suspend fun detect(bitmap: Bitmap): DetectionResult = withContext(Dispatchers.Default) {
        if (!_isReady.value || interpreter == null) {
            return@withContext DetectionResult(
                detections = emptyList(),
                inferenceMs = 0,
                inputWidth = INPUT_SIZE,
                inputHeight = INPUT_SIZE
            )
        }

        val interp = interpreter ?: return@withContext DetectionResult(
            detections = emptyList(),
            inferenceMs = 0,
            inputWidth = INPUT_SIZE,
            inputHeight = INPUT_SIZE
        )

        val t0 = System.currentTimeMillis()

        // Preprocess: resize + normalize
        val inputBuffer = preprocess(bitmap)

        // Output: [1, MAX_DETECTIONS, 6]
        val outputArray = Array(1) { Array(MAX_DETECTIONS) { FloatArray(6) } }
        interp.run(inputBuffer, outputArray)

        val inferenceMs = System.currentTimeMillis() - t0

        // Postprocess: NMS + scale to original resolution
        val rawDetections = outputArray[0]
            .filter { it[5] >= CONFIDENCE_THRESHOLD }
            .map { output ->
                val classId = output[0].toInt()
                val cx = output[1]
                val cy = output[2]
                val w = output[3]
                val h = output[4]
                val confidence = output[5]

                val xScale = bitmap.width.toFloat() / INPUT_SIZE
                val yScale = bitmap.height.toFloat() / INPUT_SIZE

                val left = ((cx - w / 2) * xScale).toInt().coerceAtLeast(0)
                val top = ((cy - h / 2) * yScale).toInt().coerceAtLeast(0)
                val right = ((cx + w / 2) * xScale).toInt().coerceAtMost(bitmap.width)
                val bottom = ((cy + h / 2) * yScale).toInt().coerceAtMost(bitmap.height)

                RawDetection(
                    classId = classId,
                    bbox = Rect(left, top, right, bottom),
                    confidence = confidence
                )
            }

        val nmsFiltered = nonMaxSuppression(rawDetections)

        val detections = nmsFiltered.map { raw ->
            Detection(
                uiClass = labels.getOrElse(raw.classId) { "unknown_${raw.classId}" },
                label = labels.getOrElse(raw.classId) { "unknown" },
                bbox = raw.bbox,
                confidence = raw.confidence
            )
        }

        DetectionResult(
            detections = detections,
            inferenceMs = inferenceMs,
            inputWidth = INPUT_SIZE,
            inputHeight = INPUT_SIZE
        )
    }

    fun close() {
        interpreter?.close()
        interpreter = null
        _isReady.value = false
    }

    // ── Private ──

    private fun preprocess(bitmap: Bitmap): ByteBuffer {
        val scaled = Bitmap.createScaledBitmap(bitmap, INPUT_SIZE, INPUT_SIZE, true)

        val buffer = ByteBuffer.allocateDirect(4 * INPUT_SIZE * INPUT_SIZE * 3)
        buffer.order(ByteOrder.nativeOrder())

        val pixels = IntArray(INPUT_SIZE * INPUT_SIZE)
        scaled.getPixels(pixels, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)
        scaled.recycle()

        for (pixel in pixels) {
            val r = ((pixel shr 16) and 0xFF) / 255.0f
            val g = ((pixel shr 8) and 0xFF) / 255.0f
            val b = (pixel and 0xFF) / 255.0f
            buffer.putFloat(r)
            buffer.putFloat(g)
            buffer.putFloat(b)
        }

        return buffer
    }

    /**
     * Non-Maximum Suppression (IoU 0.5).
     */
    private fun nonMaxSuppression(detections: List<RawDetection>): List<RawDetection> {
        if (detections.size <= 1) return detections

        val sorted = detections.sortedByDescending { it.confidence }.toMutableList()
        val kept = mutableListOf<RawDetection>()

        while (sorted.isNotEmpty()) {
            val best = sorted.removeAt(0)
            kept.add(best)

            val iter = sorted.iterator()
            while (iter.hasNext()) {
                val next = iter.next()
                if (computeIoU(best.bbox, next.bbox) > IOU_THRESHOLD) {
                    iter.remove()
                }
            }
        }

        return kept
    }

    private fun computeIoU(a: Rect, b: Rect): Float {
        val intersectLeft = maxOf(a.left, b.left)
        val intersectTop = maxOf(a.top, b.top)
        val intersectRight = minOf(a.right, b.right)
        val intersectBottom = minOf(a.bottom, b.bottom)

        if (intersectRight <= intersectLeft || intersectBottom <= intersectTop) return 0f

        val intersectArea = (intersectRight - intersectLeft).toFloat() * (intersectBottom - intersectTop).toFloat()
        val areaA = a.width().toFloat() * a.height().toFloat()
        val areaB = b.width().toFloat() * b.height().toFloat()

        return intersectArea / (areaA + areaB - intersectArea)
    }

    private data class RawDetection(
        val classId: Int,
        val bbox: Rect,
        val confidence: Float
    )
}
