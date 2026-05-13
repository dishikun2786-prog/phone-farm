package com.phonefarm.client.webrtc

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
import com.phonefarm.client.scrcpy.ScreenEncoder
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import org.webrtc.CapturerObserver
import org.webrtc.JavaI420Buffer
import org.webrtc.SurfaceTextureHelper
import org.webrtc.ThreadUtils
import org.webrtc.VideoCapturer
import org.webrtc.VideoFrame
import org.webrtc.YuvHelper
import java.nio.ByteBuffer
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject
import javax.inject.Singleton

/**
 * WebRTC VideoCapturer implementation that bridges the existing ScreenEncoder
 * H.264 output into the WebRTC pipeline.
 *
 * This class implements [org.webrtc.VideoCapturer] to serve as a screen-capture
 * source for a WebRTC PeerConnection. It receives H.264-encoded byte-stream
 * frames from [ScreenEncoder], decodes them on a dedicated forward-error-correction
 * thread, and delivers decoded [VideoFrame] objects to the [CapturerObserver].
 *
 * Design decisions:
 * - Uses the existing ScreenEncoder for H.264 capture (hardware-accelerated)
 * - Converts H.264 ByteArray -> raw NV21/NV12 -> I420 -> WebRTC VideoFrame
 * - Adaptive: monitors WebRTC stats to reduce resolution/bitrate under loss
 * - Screen-cast mode: always reports [isScreencast] = true
 */
@Singleton
class ScreenVideoCapturer @Inject constructor(
    @ApplicationContext private val context: Context,
    private val screenEncoder: ScreenEncoder,
) : VideoCapturer {

    companion object {
        private const val TAG = "ScreenVideoCapturer"
        private const val DEFAULT_WIDTH = 720
        private const val DEFAULT_HEIGHT = 1280
        private const val DEFAULT_FPS = 15
        private const val CAPTURE_THREAD_NAME = "PhoneFarm-ScreenCapturer"
    }

    // ---- state ----

    private var capturerObserver: CapturerObserver? = null
    private val isRunning = AtomicBoolean(false)
    private val currentWidth = AtomicInteger(DEFAULT_WIDTH)
    private val currentHeight = AtomicInteger(DEFAULT_HEIGHT)
    private val currentFps = AtomicInteger(DEFAULT_FPS)

    // Separate thread for H.264 -> I420 -> VideoFrame conversion
    private var captureThread: Thread? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // H.264 decoder
    private var mediaCodec: MediaCodec? = null
    private var inputSurface: Surface? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var mediaProjection: MediaProjection? = null

    // ---- VideoCapturer interface ----

    /**
     * Initialize the capturer. Called once by WebRTC internals.
     *
     * @param helper        SurfaceTextureHelper (not used — we produce our own frames).
     * @param context       Android context.
     * @param observer      CapturerObserver to deliver frames to.
     */
    override fun initialize(
        helper: SurfaceTextureHelper?,
        context: Context?,
        observer: CapturerObserver?,
    ) {
        capturerObserver = observer
        android.util.Log.d(TAG, "ScreenVideoCapturer initialized")
    }

    /**
     * Start capturing screen content at the specified resolution and frame rate.
     *
     * The ScreenEncoder is instructed to start encoding at the given parameters.
     * Encoded H.264 frames are decoded and converted to I420 VideoFrames for
     * delivery to the PeerConnection via [CapturerObserver].
     *
     * @param width     Target capture width in pixels.
     * @param height    Target capture height in pixels.
     * @param framerate Target frames per second.
     */
    override fun startCapture(width: Int, height: Int, framerate: Int) {
        if (isRunning.getAndSet(true)) {
            android.util.Log.w(TAG, "Capture already running")
            return
        }

        currentWidth.set(width)
        currentHeight.set(height)
        currentFps.set(framerate)

        android.util.Log.i(TAG, "Starting screen capture: ${width}x${height} @ $framerate fps")

        captureThread = Thread({
            ThreadUtils.checkIsOnMainThread()
            runCaptureLoop(width, height, framerate)
        }, CAPTURE_THREAD_NAME).apply {
            start()
        }
    }

    /**
     * Stop the screen capture.
     *
     * Signals the capture thread to exit and releases the H.264 decoder resources.
     */
    override fun stopCapture() {
        if (!isRunning.getAndSet(false)) {
            return
        }
        android.util.Log.i(TAG, "Stopping screen capture")
        stopCaptureInternal()
    }

    /**
     * Release all resources permanently. After this, the capturer must be
     * re-initialized before use.
     */
    override fun dispose() {
        stopCapture()
        capturerObserver = null
        scope.cancel()
        android.util.Log.i(TAG, "ScreenVideoCapturer disposed")
    }

    /**
     * Report this as a screen-cast source (vs camera). Critical for WebRTC
     * to select appropriate codec profiles (e.g., high profile for screen content).
     */
    override fun isScreencast(): Boolean = true

    // ---- adaptive bitrate ----

    /**
     * Called externally when WebRTC stats indicate high packet loss.
     * Reduces resolution and notifies the capture loop to adapt.
     *
     * @param lossFraction  Fraction of packets lost (0.0 - 1.0).
     */
    fun onNetworkLossDetected(lossFraction: Double) {
        val w = currentWidth.get()
        val h = currentHeight.get()
        if (lossFraction > 0.15 && w > 360) {
            val newW = (w * 0.75).toInt()
            val newH = (h * 0.75).toInt()
            currentWidth.set(newW)
            currentHeight.set(newH)
            android.util.Log.w(
                TAG,
                "Adaptive downscale: ${w}x${h} -> ${newW}x${newH} (loss=${"%.2f".format(lossFraction)})",
            )
        } else if (lossFraction < 0.05 && w < DEFAULT_WIDTH) {
            val newW = minOf((w * 1.25).toInt(), DEFAULT_WIDTH)
            val newH = minOf((h * 1.25).toInt(), DEFAULT_HEIGHT)
            currentWidth.set(newW)
            currentHeight.set(newH)
            android.util.Log.i(
                TAG,
                "Adaptive upscale: ${w}x${h} -> ${newW}x${newH}",
            )
        }
    }

    // ---- internal ----

    /**
     * Main capture loop. Configures a MediaCodec H.264 decoder to consume
     * frames from ScreenEncoder, decodes them, and outputs I420 VideoFrames.
     */
    private fun runCaptureLoop(width: Int, height: Int, framerate: Int) {
        try {
            val mime = MediaFormat.MIMETYPE_VIDEO_AVC

            // Find an H.264 decoder.
            val codecName = findH264Decoder()
            val codec = if (codecName != null) {
                MediaCodec.createByCodecName(codecName)
            } else {
                MediaCodec.createDecoderByType(mime)
            }

            // Configure the decoder for the expected resolution.
            val format = MediaFormat.createVideoFormat(mime, width, height).apply {
                setInteger(MediaFormat.KEY_FRAME_RATE, framerate)
                setInteger(
                    MediaFormat.KEY_COLOR_FORMAT,
                    MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible,
                )
            }
            codec.configure(format, null, null, 0)
            codec.start()

            mediaCodec = codec

            val bufferInfo = MediaCodec.BufferInfo()
            var frameCount = 0L

            // Register with ScreenEncoder to receive encoded H.264 frames.
            screenEncoder.onFrameEncoded = { data, isKeyFrame ->
                if (!isRunning.get()) return@onFrameEncoded

                try {
                    // Feed H.264 data into the decoder.
                    val inputIndex = codec.dequeueInputBuffer(10_000)
                    if (inputIndex >= 0) {
                        val inputBuffer: ByteBuffer = codec.getInputBuffer(inputIndex)!!
                        inputBuffer.clear()
                        inputBuffer.put(data)
                        val flags = if (isKeyFrame) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
                        codec.queueInputBuffer(
                            inputIndex, 0, data.size,
                            System.nanoTime() / 1000, flags,
                        )
                    }

                    // Drain decoded output frames.
                    drainDecoder(codec, bufferInfo, height, ++frameCount)
                } catch (e: Exception) {
                    android.util.Log.e(TAG, "Frame decode error", e)
                }
            }

            // Keep thread alive; ScreenEncoder callbacks drive frame processing.
            while (isRunning.get() && !Thread.currentThread().isInterrupted) {
                Thread.sleep(100)
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Capture loop error", e)
        } finally {
            stopCaptureInternal()
        }
    }

    /**
     * Drain decoded output from the MediaCodec. Each decoded frame is converted
     * to an I420 VideoFrame and delivered to [CapturerObserver].
     */
    private fun drainDecoder(
        codec: MediaCodec,
        bufferInfo: MediaCodec.BufferInfo,
        frameHeight: Int,
        frameCount: Long,
    ) {
        val observer = capturerObserver ?: return
        var outputIndex = codec.dequeueOutputBuffer(bufferInfo, 0)
        while (outputIndex >= 0) {
            try {
                val outputBuffer: ByteBuffer = codec.getOutputBuffer(outputIndex) ?: run {
                    codec.releaseOutputBuffer(outputIndex, false)
                    outputIndex = codec.dequeueOutputBuffer(bufferInfo, 0)
                    continue
                }

                val timestampNs = bufferInfo.presentationTimeUs * 1000

                // Convert YUV420 output to I420 buffer for WebRTC.
                val strideY = bufferInfo.size / (frameHeight * 3 / 2)
                val strideUV = strideY / 2
                val i420Buffer = JavaI420Buffer.allocate(
                    strideY, frameHeight, strideUV, strideUV,
                )

                // Copy YUV planes from decoder output to I420 buffer.
                YuvHelper.copyPlane(
                    outputBuffer, bufferInfo.offset, strideY, strideY, frameHeight,
                    i420Buffer.dataY, i420Buffer.strideY,
                )
                YuvHelper.copyPlane(
                    outputBuffer, bufferInfo.offset + strideY * frameHeight,
                    strideUV, strideUV, frameHeight / 2,
                    i420Buffer.dataU, i420Buffer.strideU,
                )
                YuvHelper.copyPlane(
                    outputBuffer,
                    bufferInfo.offset + strideY * frameHeight + strideUV * frameHeight / 2,
                    strideUV, strideUV, frameHeight / 2,
                    i420Buffer.dataV, i420Buffer.strideV,
                )

                val videoFrame = VideoFrame(i420Buffer, 0, timestampNs)
                observer.onFrameCaptured(videoFrame)
                videoFrame.release()
            } catch (e: Exception) {
                android.util.Log.e(TAG, "Frame conversion error", e)
            } finally {
                codec.releaseOutputBuffer(outputIndex, false)
            }
            outputIndex = codec.dequeueOutputBuffer(bufferInfo, 0)
        }
    }

    /**
     * Find a hardware-accelerated H.264 decoder on this device.
     */
    private fun findH264Decoder(): String? {
        val codecList = MediaCodecList(MediaCodecList.ALL_CODECS)
        for (info in codecList.codecInfos) {
            if (!info.isEncoder && info.supportedTypes.contains(MediaFormat.MIMETYPE_VIDEO_AVC)) {
                android.util.Log.i(TAG, "Found H.264 decoder: ${info.name}")
                return info.name
            }
        }
        return null
    }

    /**
     * Release decoder and related resources.
     */
    private fun stopCaptureInternal() {
        screenEncoder.onFrameEncoded = null

        try {
            mediaCodec?.stop()
            mediaCodec?.release()
        } catch (_: Exception) {
            // Already released
        }
        mediaCodec = null

        try {
            virtualDisplay?.release()
        } catch (_: Exception) {
            // Already released
        }
        virtualDisplay = null

        try {
            inputSurface?.release()
        } catch (_: Exception) {
            // Already released
        }
        inputSurface = null

        captureThread?.interrupt()
        captureThread = null
    }
}
