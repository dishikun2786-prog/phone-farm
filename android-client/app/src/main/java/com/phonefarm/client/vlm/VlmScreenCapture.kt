package com.phonefarm.client.vlm

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import android.media.MediaCodec
import android.media.MediaFormat
import android.os.Build
import android.util.Log
import com.phonefarm.client.scrcpy.ScreenEncoder
import com.phonefarm.client.service.PhoneFarmAccessibilityService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Captures screenshots for VLM inference from the video encoder's I-frames.
 *
 * Strategy:
 * 1. Primary (API 29+): Request a keyframe from ScreenEncoder, decode the
 *    H.264 I-frame into a Bitmap. Zero-cost screenshot — no additional
 *    capture needed.
 * 2. Fallback (API < 29 or I-frame timeout): Use AccessibilityService's
 *    takeScreenshot() (API 34+) or screencap shell command.
 *
 * The advantage of I-frame extraction: VLM sees exactly what Dashboard
 * sees — no visual discrepancy between the operator's view and the AI's view.
 */
@Singleton
class VlmScreenCapture @Inject constructor(
    private val screenEncoder: ScreenEncoder?,
) {

    companion object {
        private const val TAG = "VlmScreenCapture"
        private const val I_FRAME_TIMEOUT_MS = 2000L
    }

    private val _lastBitmap = MutableStateFlow<Bitmap?>(null)
    val lastBitmap: StateFlow<Bitmap?> = _lastBitmap.asStateFlow()

    /** H.264 decoder used for I-frame → Bitmap conversion. */
    private var h264Decoder: MediaCodec? = null

    /**
     * Capture a screenshot for VLM inference.
     *
     * Prefers I-frame extraction when ScreenEncoder is active (API 29+).
     * Falls back to AccessibilityService screenshot otherwise.
     *
     * @return Bitmap or null on failure
     */
    suspend fun capture(): Bitmap? = withContext(Dispatchers.IO) {
        // Try I-frame extraction first
        if (screenEncoder != null && screenEncoder.isEncoding.value && Build.VERSION.SDK_INT >= 29) {
            val bitmap = captureFromIFrame()
            if (bitmap != null) {
                _lastBitmap.value = bitmap
                return@withContext bitmap
            }
            Log.w(TAG, "I-frame capture failed, falling back to A11y screenshot")
        }

        // Fallback: AccessibilityService screenshot
        captureFromAccessibility()
    }

    /**
     * Request an I-frame from the encoder, decode it, and return a Bitmap.
     */
    private suspend fun captureFromIFrame(): Bitmap? = withTimeoutOrNull(I_FRAME_TIMEOUT_MS) {
        val encoder = screenEncoder ?: return@withTimeoutOrNull null

        // Capture the next keyframe via callback
        var bitmap: Bitmap? = null
        val latch = CountDownLatch(1)

        val originalCallback = encoder.onKeyFrame
        encoder.onKeyFrame = { frameData ->
            try {
                bitmap = decodeH264ToBitmap(frameData)
            } catch (e: Exception) {
                Log.w(TAG, "I-frame decode failed: ${e.message}")
            }
            latch.countDown()
        }

        // Trigger keyframe request
        encoder.requestKeyFrame()

        try {
            val gotFrame = latch.await(I_FRAME_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            if (!gotFrame) {
                Log.w(TAG, "I-frame timeout after ${I_FRAME_TIMEOUT_MS}ms")
            }
            // Restore original callback
            encoder.onKeyFrame = originalCallback
        } catch (e: InterruptedException) {
            encoder.onKeyFrame = originalCallback
            Thread.currentThread().interrupt()
        }

        bitmap
    }

    /**
     * Decode an H.264 NAL unit (Annex B format) into a Bitmap.
     * Uses a persistent MediaCodec decoder instance.
     */
    private fun decodeH264ToBitmap(nalData: ByteArray): Bitmap? {
        try {
            val decoder = getOrCreateDecoder()
            if (decoder == null) return null

            // Feed the NAL unit
            val inputIndex = decoder.dequeueInputBuffer(10_000)
            if (inputIndex < 0) return null

            val inputBuffer = decoder.getInputBuffer(inputIndex) ?: return null
            inputBuffer.clear()
            inputBuffer.put(nalData)
            decoder.queueInputBuffer(inputIndex, 0, nalData.size, 0, 0)

            // Drain output
            val bufferInfo = MediaCodec.BufferInfo()
            val outputIndex = decoder.dequeueOutputBuffer(bufferInfo, 10_000)
            if (outputIndex < 0) return null

            val image: Image? = try {
                decoder.getOutputImage(outputIndex)
            } catch (_: Exception) { null }

            val bitmap = if (image != null) {
                imageToBitmap(image)
            } else {
                // Buffer mode — convert YUV buffer
                val outputBuffer = decoder.getOutputBuffer(outputIndex) ?: return null
                outputBuffer.position(bufferInfo.offset)
                outputBuffer.limit(bufferInfo.offset + bufferInfo.size)
                yuvBufferToBitmap(outputBuffer, bufferInfo.size)
            }

            decoder.releaseOutputBuffer(outputIndex, true)
            return bitmap
        } catch (e: Exception) {
            Log.w(TAG, "H.264 decode error: ${e.message}")
            return null
        }
    }

    /**
     * Fallback: capture via AccessibilityService (API 34+ takeScreenshot).
     */
    private fun captureFromAccessibility(): Bitmap? {
        val service = PhoneFarmAccessibilityService.instance ?: return null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return service.captureScreen()
        }
        // API < 34: use screencap shell command
        return captureViaScreencap()
    }

    private fun captureViaScreencap(): Bitmap? {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("screencap", "-p"))
            val bos = ByteArrayOutputStream()
            process.inputStream.copyTo(bos)
            process.waitFor()
            val bytes = bos.toByteArray()
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } catch (e: Exception) {
            Log.e(TAG, "screencap failed: ${e.message}")
            null
        }
    }

    private fun getOrCreateDecoder(): MediaCodec? {
        if (h264Decoder != null) return h264Decoder
        return try {
            val format = MediaFormat.createVideoFormat(
                MediaFormat.MIMETYPE_VIDEO_AVC,
                screenEncoder?.getEncodedDimensions()?.first ?: 1080,
                screenEncoder?.getEncodedDimensions()?.second ?: 1920,
            )
            val decoder = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
            decoder.configure(format, null, null, 0)
            decoder.start()
            h264Decoder = decoder
            decoder
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create H.264 decoder: ${e.message}")
            null
        }
    }

    private fun imageToBitmap(image: Image): Bitmap? {
        return try {
            val yuvImage = YuvImage(
                image.planes[0].buffer.array(),
                ImageFormat.NV21,
                image.width, image.height, null
            )
            val out = ByteArrayOutputStream()
            yuvImage.compressToJpeg(Rect(0, 0, image.width, image.height), 85, out)
            val jpegBytes = out.toByteArray()
            BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size)
        } catch (e: Exception) {
            Log.w(TAG, "Image→Bitmap: ${e.message}")
            null
        }
    }

    private fun yuvBufferToBitmap(buffer: ByteBuffer, size: Int): Bitmap? {
        return try {
            val bytes = ByteArray(size)
            buffer.get(bytes)
            val yuvImage = YuvImage(
                bytes,
                ImageFormat.NV21,
                screenEncoder?.getEncodedDimensions()?.first ?: 1080,
                screenEncoder?.getEncodedDimensions()?.second ?: 1920,
                null
            )
            val out = ByteArrayOutputStream()
            yuvImage.compressToJpeg(Rect(0, 0, yuvImage.width, yuvImage.height), 85, out)
            BitmapFactory.decodeByteArray(out.toByteArray(), 0, out.size())
        } catch (e: Exception) {
            Log.w(TAG, "YUV→Bitmap: ${e.message}")
            null
        }
    }

    fun release() {
        try {
            h264Decoder?.stop()
            h264Decoder?.release()
        } catch (_: Exception) {}
        h264Decoder = null
    }
}
