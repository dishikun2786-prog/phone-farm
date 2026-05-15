package com.phonefarm.client.scrcpy

import android.util.Log
import com.phonefarm.client.data.repository.DeviceRepository
import com.phonefarm.client.network.codec.AudioFrame
import com.phonefarm.client.network.codec.ProtobufCodec
import com.phonefarm.client.network.transport.TransportSelector
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Audio/Video frame multiplexer — unified routing with PTS-based A/V sync.
 *
 * Receives encoded audio and video frames, wraps them in protobuf,
 * and dispatches via TransportSelector. Ensures A/V frames share a
 * common PTS timeline for decoder-side synchronization.
 *
 * Header byte prefix:
 *   0x02 = Video frame
 *   0x05 = Audio frame
 */
@Singleton
class AvMultiplexer @Inject constructor(
    private val transportSelector: TransportSelector,
    private val protobufCodec: ProtobufCodec,
    private val deviceRepository: DeviceRepository,
) {

    companion object {
        private const val TAG = "AvMultiplexer"
    }

    private val _videoSeq = AtomicLong(0)
    private val _audioSeq = AtomicLong(0)

    private val _isActive = MutableStateFlow(false)
    val isActive: StateFlow<Boolean> = _isActive.asStateFlow()

    private var deviceId: String = ""

    /** Call the host to cache device identity before starting. */
    suspend fun init() {
        deviceId = deviceRepository.collectDeviceInfo().deviceId
    }

    fun setActive(active: Boolean) {
        _isActive.value = active
        if (active) {
            _videoSeq.set(0)
            _audioSeq.set(0)
        }
    }

    /**
     * Send an encoded H.264 video frame through the transport.
     *
     * @param encoded Protobuf-encoded VideoFrame bytes (from ProtobufCodec)
     * @return true if sent successfully
     */
    fun sendVideoFrame(encoded: ByteArray): Boolean {
        if (!_isActive.value) return false
        val ok = transportSelector.sendVideoFrame(encoded)
        if (!ok) {
            Log.w(TAG, "Video frame send failed, seq=${_videoSeq.get()}")
        }
        return ok
    }

    /**
     * Encode and send an audio PCM frame via the transport.
     *
     * @param pcmData raw PCM audio bytes
     * @param ptsUs presentation timestamp in microseconds
     * @param codec audio codec name
     * @param sampleRate sample rate in Hz
     * @param channels number of channels
     * @param sampleFormat 0=s16le
     */
    fun sendAudioFrame(
        pcmData: ByteArray,
        ptsUs: Long,
        codec: String = "aac",
        sampleRate: Int = 44100,
        channels: Int = 1,
        sampleFormat: Int = 0,
    ): Boolean {
        if (!_isActive.value) return false
        val seq = _audioSeq.getAndIncrement()
        val frame = AudioFrame(
            deviceId = deviceId,
            frameSeq = seq.toInt(),
            ptsUs = ptsUs,
            codec = codec,
            audioData = pcmData,
            sampleRate = sampleRate,
            channels = channels,
            sampleFormat = sampleFormat,
        )
        return try {
            val encoded = protobufCodec.encodeAudioFrame(frame)
            transportSelector.sendAudioFrame(encoded)
        } catch (e: Exception) {
            Log.w(TAG, "Audio frame encode failed: ${e.message}")
            false
        }
    }

    fun getVideoSeq(): Long = _videoSeq.get()
    fun getAudioSeq(): Long = _audioSeq.get()
}
