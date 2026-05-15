package com.phonefarm.client.scrcpy

import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.os.Build
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Captures internal audio from MediaProjection via AudioPlaybackCapture (API 29+).
 *
 * Uses AudioRecord with AudioPlaybackCaptureConfiguration to capture
 * the audio output of the device. PCM samples are delivered via callback
 * and forwarded to AudioEncoder for AAC encoding.
 *
 * Config: 44100 Hz, mono, 16-bit PCM.
 */
@Singleton
class AudioCapture @Inject constructor() {

    companion object {
        private const val TAG = "AudioCapture"
        private const val SAMPLE_RATE = 44100
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    }

    private val _isCapturing = MutableStateFlow(false)
    val isCapturing: StateFlow<Boolean> = _isCapturing.asStateFlow()

    /** Callback invoked with raw PCM data and its presentation timestamp. */
    var onPcmData: ((ByteArray, Long) -> Unit)? = null

    private var audioRecord: AudioRecord? = null
    private var captureThread: Thread? = null
    private var ptsBase: Long = 0L

    /**
     * Start capturing internal audio from the given MediaProjection.
     * Requires API 29+ (Android 10).
     */
    suspend fun start(mediaProjection: MediaProjection): Boolean =
        withContext(Dispatchers.IO) {
            if (_isCapturing.value) return@withContext true
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                Log.w(TAG, "AudioPlaybackCapture requires API 29+")
                return@withContext false
            }

            try {
                val config = AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
                    .addMatchingUsage(android.media.AudioAttributes.USAGE_MEDIA)
                    .addMatchingUsage(android.media.AudioAttributes.USAGE_GAME)
                    .addMatchingUsage(android.media.AudioAttributes.USAGE_UNKNOWN)
                    .build()

                val minBufSize = AudioRecord.getMinBufferSize(
                    SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT
                )
                val bufferSize = maxOf(minBufSize * 2, 4096)

                val record = AudioRecord.Builder()
                    .setAudioPlaybackCaptureConfig(config)
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(AUDIO_FORMAT)
                            .setSampleRate(SAMPLE_RATE)
                            .setChannelMask(CHANNEL_CONFIG)
                            .build()
                    )
                    .setBufferSizeInBytes(bufferSize)
                    .build()

                if (record.state != AudioRecord.STATE_INITIALIZED) {
                    Log.e(TAG, "AudioRecord failed to initialize")
                    return@withContext false
                }

                audioRecord = record
                ptsBase = System.nanoTime() / 1000 // microseconds
                record.startRecording()
                _isCapturing.value = true

                // Start capture loop on a dedicated thread
                captureThread = Thread({
                    val buffer = ByteArray(bufferSize)
                    while (_isCapturing.value && !Thread.currentThread().isInterrupted) {
                        val bytesRead = record.read(buffer, 0, buffer.size)
                        if (bytesRead > 0) {
                            val ptsUs = (System.nanoTime() / 1000) - ptsBase
                            val pcmData = buffer.copyOf(bytesRead)
                            onPcmData?.invoke(pcmData, ptsUs)
                        } else if (bytesRead == AudioRecord.ERROR_INVALID_OPERATION) {
                            Log.w(TAG, "AudioRecord invalid operation — stopping")
                            break
                        }
                    }
                }, "AudioCapture-Thread").apply {
                    priority = Thread.MAX_PRIORITY
                    start()
                }
                true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start audio capture: ${e.message}")
                _isCapturing.value = false
                false
            }
        }

    fun stop() {
        _isCapturing.value = false
        captureThread?.interrupt()
        captureThread = null
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (_: Exception) {}
        audioRecord = null
    }
}
