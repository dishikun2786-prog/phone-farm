package com.phonefarm.client.scrcpy

import android.content.Context
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.os.Build
import android.view.Surface
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.nio.ByteBuffer
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Hardware-accelerated H.264 screen encoding via MediaProjection + MediaCodec.
 *
 * Captures the device screen, encodes it to H.264, and streams the encoded
 * frames to the WebSocket server. This implements the video path of the
 * scrcpy-like remote screen viewing feature.
 *
 * Supported configurations with automatic bandwidth adaptation:
 *  - WiFi:  1080p @ 15fps, 3 Mbps
 *  - 4G:    720p  @ 10fps, 1.5 Mbps
 *  - 5G:    1080p @ 10fps, 2 Mbps
 *
 * The encoder runs on a dedicated background thread. Encoded frames are
 * transmitted as binary WebSocket messages.
 */
@Singleton
class ScreenEncoder @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    companion object {
        private const val TAG = "ScreenEncoder"
        private const val MIME_TYPE = MediaFormat.MIMETYPE_VIDEO_AVC // H.264
        private const val FRAME_RATE = 15
        private const val I_FRAME_INTERVAL_SECONDS = 2
    }

    private val _isEncoding = MutableStateFlow(false)
    val isEncoding: StateFlow<Boolean> = _isEncoding.asStateFlow()

    private var mediaProjection: MediaProjection? = null
    private var mediaCodec: MediaCodec? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var encoderThread: Thread? = null

    // ---- public API ----

    /**
     * Start screen capture and encoding.
     *
     * Requires a valid [MediaProjection] obtained from the screen capture
     * consent flow. The caller must pass the MediaProjection to this method
     * (or have called [RemoteScreenshotCapture.initialize] which shares
     * the same MediaProjection instance).
     *
     * @param mediaProjection  The MediaProjection from consent flow.
     * @param maxSize          Maximum dimension (width or height) for the
     *                         encoded video. Default 1080.
     * @param bitRate          Target bitrate in bits per second. Default 4 Mbps.
     * @param maxFps           Maximum frame rate. Default 15.
     */
    suspend fun start(
        mediaProjection: MediaProjection,
        maxSize: Int = 1080,
        bitRate: Int = 4_000_000,
        maxFps: Int = 15,
    ) {
        if (_isEncoding.value) return

        this.mediaProjection = mediaProjection

        val width: Int
        val height: Int

        // Get display dimensions.
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = wm.currentWindowMetrics.bounds
            width = bounds.width()
            height = bounds.height()
        } else {
            @Suppress("DEPRECATION")
            val display = wm.defaultDisplay
            val metrics = android.util.DisplayMetrics()
            @Suppress("DEPRECATION")
            display.getRealMetrics(metrics)
            width = metrics.widthPixels
            height = metrics.heightPixels
        }

        // Scale to maxSize while preserving aspect ratio.
        val (scaledWidth, scaledHeight) = computeScaledDimensions(width, height, maxSize)

        _isEncoding.value = true

        withContext(Dispatchers.IO) {
            try {
                encodeLoop(
                    mediaProjection = mediaProjection,
                    width = scaledWidth,
                    height = scaledHeight,
                    bitRate = bitRate,
                    maxFps = maxFps,
                )
            } catch (e: Exception) {
                android.util.Log.e(TAG, "Encoding loop error", e)
            } finally {
                cleanupEncoder()
                _isEncoding.value = false
            }
        }
    }

    /**
     * Stop screen encoding and release resources.
     */
    suspend fun stop() {
        _isEncoding.value = false
        encoderThread?.interrupt()
        encoderThread = null
    }

    // ---- bandwidth auto-adaptation ----

    /**
     * Recommend encoder parameters based on current network type.
     *
     * @return Triple of (maxSize, bitRate, maxFps).
     */
    fun getRecommendedConfig(networkType: String): Triple<Int, Int, Int> {
        return when (networkType.uppercase()) {
            "WIFI", "ETHERNET" -> Triple(1080, 4_000_000, 15)
            "5G" -> Triple(1080, 2_000_000, 10)
            "4G" -> Triple(720, 1_500_000, 10)
            "3G" -> Triple(480, 800_000, 8)
            else -> Triple(720, 1_500_000, 10)
        }
    }

    // ---- internal ----

    /**
     * Main encoding loop running on a background thread.
     */
    private fun encodeLoop(
        mediaProjection: MediaProjection,
        width: Int,
        height: Int,
        bitRate: Int,
        maxFps: Int,
    ) {
        // Create and configure MediaCodec.
        val format = MediaFormat.createVideoFormat(MIME_TYPE, width, height).apply {
            setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
            setInteger(MediaFormat.KEY_FRAME_RATE, maxFps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL_SECONDS)
            setInteger(
                MediaFormat.KEY_COLOR_FORMAT,
                MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface,
            )
        }

        val codec = MediaCodec.createEncoderByType(MIME_TYPE)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)

        val inputSurface = codec.createInputSurface()
        codec.start()

        mediaCodec = codec

        // Create VirtualDisplay that feeds into the encoder surface.
        virtualDisplay = mediaProjection.createVirtualDisplay(
            "PhoneFarm-ScreenEncoder",
            width,
            height,
            context.resources.configuration.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            inputSurface,
            null,
            null,
        )

        // Encode loop.
        try {
            val bufferInfo = MediaCodec.BufferInfo()
            while (_isEncoding.value) {
                val outputIndex = codec.dequeueOutputBuffer(bufferInfo, 10_000)
                if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    // Format changed — potentially send SPS/PPS to WebSocket.
                    continue
                }
                if (outputIndex >= 0) {
                    val outputBuffer: ByteBuffer = codec.getOutputBuffer(outputIndex) ?: continue
                    val frameData = ByteArray(bufferInfo.size)
                    outputBuffer.get(frameData, bufferInfo.offset, bufferInfo.size)

                    // TODO: Send frameData to WebSocket as binary message.
                    //       Wrap in scrcpy protocol header:
                    //       - PTS (8 bytes)
                    //       - Frame size (4 bytes)
                    //       - Keyframe flag (1 byte if I-frame)
                    //       - H.264 NAL units

                    codec.releaseOutputBuffer(outputIndex, false)
                }
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Encode loop exception", e)
        }
    }

    /**
     * Release all encoder resources.
     */
    private fun cleanupEncoder() {
        try {
            mediaCodec?.stop()
            mediaCodec?.release()
        } catch (_: Exception) {
            // Already released.
        }
        mediaCodec = null

        try {
            virtualDisplay?.release()
        } catch (_: Exception) {
            // Already released.
        }
        virtualDisplay = null

        try {
            mediaProjection?.stop()
        } catch (_: Exception) {
            // Already stopped.
        }
        mediaProjection = null
    }

    /**
     * Compute scaled dimensions preserving aspect ratio with a maximum bound.
     */
    private fun computeScaledDimensions(
        width: Int,
        height: Int,
        maxSize: Int,
    ): Pair<Int, Int> {
        if (width <= maxSize && height <= maxSize) {
            return Pair(width, height)
        }
        return if (width >= height) {
            val scaledWidth = maxSize
            val scaledHeight = (height.toFloat() / width * maxSize).toInt()
            Pair(scaledWidth, scaledHeight)
        } else {
            val scaledHeight = maxSize
            val scaledWidth = (width.toFloat() / height * maxSize).toInt()
            Pair(scaledWidth, scaledHeight)
        }
    }
}
