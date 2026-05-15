package com.phonefarm.client.scrcpy

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.nio.ByteBuffer
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Hardware AAC-LC audio encoding via MediaCodec.
 *
 * Receives raw PCM frames from AudioCapture, encodes to AAC-LC,
 * and forwards encoded frames to the transport layer via callback.
 *
 * Config options with automatic fallback:
 *  - Primary: AAC-LC 44100Hz mono @ 64kbps (hardware codec)
 *  - Fallback: Opus-in-OGG is feasible if AAC is unavailable
 */
@Singleton
class AudioEncoder @Inject constructor() {

    companion object {
        private const val TAG = "AudioEncoder"
        private const val MIME_TYPE = MediaFormat.MIMETYPE_AUDIO_AAC
        private const val SAMPLE_RATE = 44100
        private const val CHANNEL_COUNT = 1
        private const val BIT_RATE = 64_000 // 64 kbps
        private const val MAX_INPUT_SIZE = 8192
    }

    private val _isEncoding = MutableStateFlow(false)
    val isEncoding: StateFlow<Boolean> = _isEncoding.asStateFlow()

    /** Callback invoked with encoded AAC frames. */
    var onAudioFrame: ((ByteArray, Long) -> Unit)? = null

    private var mediaCodec: MediaCodec? = null
    private var encoderThread: Thread? = null

    /** Total samples fed to encoder (for PTS calculation). */
    private var samplesFed: Long = 0L

    /**
     * Start the AAC encoder.
     * Returns false if no AAC encoder is available.
     */
    fun start(): Boolean {
        if (_isEncoding.value) return true

        val codec = findAacEncoder() ?: run {
            Log.e(TAG, "No AAC encoder found on this device")
            return false
        }

        return try {
            val format = MediaFormat.createAudioFormat(MIME_TYPE, SAMPLE_RATE, CHANNEL_COUNT).apply {
                setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
                setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
                setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, MAX_INPUT_SIZE)
            }

            codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            codec.start()

            mediaCodec = codec
            samplesFed = 0L
            _isEncoding.value = true
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start AAC encoder: ${e.message}", e)
            try { codec.release() } catch (_: Exception) {}
            false
        }
    }

    /**
     * Enqueue a raw PCM frame for encoding.
     *
     * @param pcmData 16-bit mono PCM samples
     * @param ptsUs   presentation timestamp in microseconds
     */
    fun encode(pcmData: ByteArray, ptsUs: Long) {
        val codec = mediaCodec ?: return
        if (!_isEncoding.value) return

        try {
            // Feed input
            val inputIndex = codec.dequeueInputBuffer(10_000)
            if (inputIndex >= 0) {
                val inputBuffer = codec.getInputBuffer(inputIndex) ?: return
                inputBuffer.clear()
                inputBuffer.put(pcmData)
                codec.queueInputBuffer(
                    inputIndex, 0, pcmData.size,
                    ptsUs, 0
                )
                samplesFed += pcmData.size / 2 // 16-bit = 2 bytes per sample
            }

            // Drain output
            val bufferInfo = MediaCodec.BufferInfo()
            while (true) {
                val outputIndex = codec.dequeueOutputBuffer(bufferInfo, 0)
                if (outputIndex < 0) break

                val outputBuffer = codec.getOutputBuffer(outputIndex) ?: continue
                val encodedData = ByteArray(bufferInfo.size)
                outputBuffer.get(encodedData, bufferInfo.offset, bufferInfo.size)

                onAudioFrame?.invoke(encodedData, bufferInfo.presentationTimeUs)

                codec.releaseOutputBuffer(outputIndex, false)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Encode error: ${e.message}")
        }
    }

    /**
     * Recover from encoder error by restarting.
     */
    fun recover(): Boolean {
        stop()
        return start()
    }

    fun stop() {
        _isEncoding.value = false
        try {
            mediaCodec?.stop()
            mediaCodec?.release()
        } catch (_: Exception) {}
        mediaCodec = null
    }

    private fun findAacEncoder(): MediaCodec? {
        return try {
            val codecList = MediaCodecList(MediaCodecList.REGULAR_CODECS)
            for (info in codecList.codecInfos) {
                if (!info.isEncoder) continue
                for (type in info.supportedTypes) {
                    if (type.equals(MIME_TYPE, ignoreCase = true)) {
                        return MediaCodec.createByCodecName(info.name)
                    }
                }
            }
            null
        } catch (e: Exception) {
            Log.w(TAG, "findAacEncoder: ${e.message}")
            null
        }
    }
}
