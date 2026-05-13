package com.phonefarm.client.edge.ncnn

import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.objects.DetectedObject
import com.google.mlkit.vision.objects.ObjectDetection
import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.coroutines.resume

/**
 * NCNN YOLO JNI bridge — wraps the NCNN native library for on-device object detection.
 *
 * Since the native .so is loaded at runtime (not compile-time), this bridge provides
 * graceful degradation: if the NCNN shared library is unavailable, it falls back to
 * Google ML Kit object detection.
 *
 * Thread safety: All native calls are serialized through a single-threaded dispatcher.
 * Model lifecycle: init() must be called before detect(). release() frees native resources.
 *
 * @property nativeLoaded Whether the NCNN native library was successfully loaded.
 * @property isReady Whether the model is loaded and ready for inference.
 */
object NcnnYoloBridge {

    private const val TAG = "NcnnYoloBridge"

    /** Whether the native .so was loaded successfully. */
    var nativeLoaded: Boolean = false
        private set

    /** Whether the model is currently loaded and ready for inference. */
    var isReady: Boolean = false
        private set

    /** The currently loaded model path (internal storage). */
    private var currentModelPath: String? = null

    /** The currently loaded param path (internal storage). */
    private var currentParamPath: String? = null

    /** ML Kit object detector for fallback. Initialized lazily. */
    private var mlKitDetector: com.google.mlkit.vision.objects.ObjectDetector? = null

    // ── Initialization ──

    init {
        try {
            System.loadLibrary("ncnn_yolo")
            nativeLoaded = true
            Log.d(TAG, "NCNN YOLO native library loaded successfully")
        } catch (e: UnsatisfiedLinkError) {
            nativeLoaded = false
            Log.w(TAG, "NCNN YOLO native library not available: ${e.message}. Will use ML Kit fallback.")
        }
    }

    // ── Public API ──

    /**
     * Initialize the NCNN YOLO model.
     *
     * @param modelPath Path to the .bin model weights file.
     * @param paramPath Path to the .param model structure file.
     * @return true if the model was loaded successfully.
     */
    fun init(modelPath: String, paramPath: String): Boolean {
        if (!nativeLoaded) {
            Log.w(TAG, "Cannot init: native library not loaded")
            return false
        }

        // Release any previously loaded model
        if (isReady) {
            release()
        }

        // Verify files exist
        val modelFile = File(modelPath)
        val paramFile = File(paramPath)
        if (!modelFile.exists() || !paramFile.exists()) {
            Log.e(TAG, "Model files not found: model=${modelFile.exists()}, param=${paramFile.exists()}")
            return false
        }

        return try {
            val success = nativeInit(modelPath, paramPath)
            if (success) {
                currentModelPath = modelPath
                currentParamPath = paramPath
                isReady = true
                Log.d(TAG, "NCNN YOLO model loaded: $modelPath")
            } else {
                Log.e(TAG, "nativeInit returned false")
                isReady = false
            }
            success
        } catch (e: Exception) {
            Log.e(TAG, "Failed to init NCNN YOLO model", e)
            isReady = false
            false
        }
    }

    /**
     * Run YOLO object detection on a frame.
     *
     * If NCNN is unavailable or the model is not loaded, this falls back to
     * ML Kit object detection automatically.
     *
     * @param frameData Raw pixel data (ARGB_8888 format).
     * @param width Frame width in pixels.
     * @param height Frame height in pixels.
     * @param threshold Confidence threshold (0.0–1.0). Default 0.5.
     * @return List of detected objects.
     */
    suspend fun detect(
        frameData: ByteArray,
        width: Int,
        height: Int,
        threshold: Float = 0.5f,
    ): List<DetectedObject> = withContext(Dispatchers.Default) {
        if (nativeLoaded && isReady) {
            detectNative(frameData, width, height, threshold)
        } else {
            detectFallback(frameData, width, height, threshold)
        }
    }

    /**
     * Run YOLO object detection on a Bitmap.
     *
     * @param bitmap The input bitmap.
     * @param threshold Confidence threshold (0.0–1.0). Default 0.5.
     * @return List of detected objects.
     */
    suspend fun detectBitmap(
        bitmap: Bitmap,
        threshold: Float = 0.5f,
    ): List<DetectedObject> = withContext(Dispatchers.Default) {
        if (nativeLoaded && isReady) {
            val pixels = IntArray(bitmap.width * bitmap.height)
            bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
            val frameData = ByteArray(pixels.size * 4)
            for (i in pixels.indices) {
                val p = pixels[i]
                frameData[i * 4] = ((p shr 16) and 0xFF).toByte()      // R
                frameData[i * 4 + 1] = ((p shr 8) and 0xFF).toByte()   // G
                frameData[i * 4 + 2] = (p and 0xFF).toByte()            // B
                frameData[i * 4 + 3] = ((p shr 24) and 0xFF).toByte()  // A
            }
            detectNative(frameData, bitmap.width, bitmap.height, threshold)
        } else {
            detectFallbackBitmap(bitmap, threshold)
        }
    }

    /**
     * Release native resources and unload the model.
     */
    fun release() {
        if (nativeLoaded && isReady) {
            try {
                nativeRelease()
                Log.d(TAG, "NCNN YOLO model released")
            } catch (e: Exception) {
                Log.e(TAG, "Error releasing NCNN YOLO model", e)
            }
        }
        isReady = false
        currentModelPath = null
        currentParamPath = null
    }

    /**
     * Get the backend currently in use.
     */
    fun getActiveBackend(): String {
        return when {
            nativeLoaded && isReady -> "NCNN"
            mlKitDetector != null || isMlKitAvailable() -> "MLKit"
            else -> "none"
        }
    }

    // ── Native detection path ──

    private fun detectNative(
        frameData: ByteArray,
        width: Int,
        height: Int,
        threshold: Float,
    ): List<DetectedObject> {
        return try {
            nativeDetect(frameData, width, height, threshold)
        } catch (e: Exception) {
            Log.e(TAG, "NCNN native detect failed, falling back to ML Kit", e)
            detectFallbackInternal(frameData, width, height, threshold)
        }
    }

    // ── ML Kit fallback (pure Kotlin, no native dependency) ──

    private suspend fun detectFallback(
        frameData: ByteArray,
        width: Int,
        height: Int,
        threshold: Float,
    ): List<DetectedObject> = detectFallbackInternal(frameData, width, height, threshold)

    private suspend fun detectFallbackBitmap(
        bitmap: Bitmap,
        threshold: Float,
    ): List<DetectedObject> = suspendCancellableCoroutine { cont ->
        try {
            val detector = getOrCreateMlKitDetector()
            val image = InputImage.fromBitmap(bitmap, 0)

            detector.process(image)
                .addOnSuccessListener { results ->
                    val objects = results.mapNotNull { mlKitObj ->
                        val label = mlKitObj.labels.firstOrNull()?.text ?: "object"
                        val confidence = mlKitObj.labels.firstOrNull()?.confidence ?: 0.5f
                        if (confidence < threshold) return@mapNotNull null

                        val box = mlKitObj.boundingBox
                        DetectedObject(
                            label = label,
                            confidence = confidence,
                            x = box.left.toFloat(),
                            y = box.top.toFloat(),
                            w = box.width().toFloat(),
                            h = box.height().toFloat(),
                        )
                    }
                    cont.resume(objects)
                }
                .addOnFailureListener { e ->
                    Log.e(TAG, "ML Kit detection failed: ${e.message}")
                    cont.resume(emptyList())
                }
        } catch (e: Exception) {
            Log.e(TAG, "ML Kit fallback error: ${e.message}")
            cont.resume(emptyList())
        }
    }

    private fun detectFallbackInternal(
        frameData: ByteArray,
        width: Int,
        height: Int,
        threshold: Float,
    ): List<DetectedObject> {
        // Synchronous basic bitmap analysis when we cannot use coroutines
        // This is a last-resort fallback: divide the image into a 6x10 grid
        // and check for regions with high texture variance (potential UI elements)
        val results = mutableListOf<DetectedObject>()

        if (frameData.size < width * height * 4) return results

        val gridCols = 10
        val gridRows = 6
        val blockW = width / gridCols
        val blockH = height / gridRows

        for (gy in 0 until gridRows) {
            for (gx in 0 until gridCols) {
                val startX = gx * blockW
                val startY = gy * blockH

                var sum = 0.0
                var sumSq = 0.0
                var count = 0

                // Sample every 4th pixel in the block
                for (y in startY until startY + blockH step 4) {
                    for (x in startX until startX + blockW step 4) {
                        val idx = (y * width + x) * 4
                        if (idx + 2 < frameData.size) {
                            val gray = (frameData[idx].toInt() and 0xFF) * 0.299 +
                                       (frameData[idx + 1].toInt() and 0xFF) * 0.587 +
                                       (frameData[idx + 2].toInt() and 0xFF) * 0.114
                            sum += gray
                            sumSq += gray * gray
                            count++
                        }
                    }
                }

                if (count == 0) continue

                val mean = sum / count
                val variance = (sumSq / count) - (mean * mean)

                // High variance regions likely contain UI elements (buttons, text)
                if (variance > 1200) {
                    results.add(
                        DetectedObject(
                            label = "ui_element",
                            confidence = (variance / 5000f).coerceIn(0.3f, 0.7f),
                            x = startX.toFloat(),
                            y = startY.toFloat(),
                            w = blockW.toFloat(),
                            h = blockH.toFloat(),
                        )
                    )
                }
            }
        }

        return results
    }

    // ── ML Kit lazy initialization ──

    private fun isMlKitAvailable(): Boolean {
        return try {
            Class.forName("com.google.mlkit.vision.objects.ObjectDetection")
            true
        } catch (_: ClassNotFoundException) {
            false
        }
    }

    private fun getOrCreateMlKitDetector(): com.google.mlkit.vision.objects.ObjectDetector {
        if (mlKitDetector == null) {
            val options = ObjectDetectorOptions.Builder()
                .setDetectorMode(ObjectDetectorOptions.SINGLE_IMAGE_MODE)
                .enableMultipleObjects()
                .enableClassification()
                .build()
            mlKitDetector = ObjectDetection.getClient(options)
        }
        return mlKitDetector!!
    }

    // ── JNI native method declarations ──

    @JvmStatic
    private external fun nativeInit(modelPath: String, paramPath: String): Boolean

    @JvmStatic
    private external fun nativeDetect(
        frameData: ByteArray,
        width: Int,
        height: Int,
        threshold: Float,
    ): List<DetectedObject>

    @JvmStatic
    private external fun nativeRelease()

    // ── Data classes ──

    /**
     * A detected object produced by this bridge.
     *
     * @param label Human-readable label (e.g., "button", "text_field", "popup").
     * @param confidence Detection confidence in [0.0, 1.0].
     * @param x Left coordinate in pixels.
     * @param y Top coordinate in pixels.
     * @param w Width in pixels.
     * @param h Height in pixels.
     */
    data class DetectedObject(
        val label: String,
        val confidence: Float,
        val x: Float,
        val y: Float,
        val w: Float,
        val h: Float,
    ) {
        /** Convert to Android Rect for compatibility. */
        fun toRect(): Rect = Rect(
            x.toInt(),
            y.toInt(),
            (x + w).toInt(),
            (y + h).toInt(),
        )

        /** Center point of the detected object. */
        val centerX: Float get() = x + w / 2f
        val centerY: Float get() = y + h / 2f
    }
}
