package com.phonefarm.client.scrcpy

import android.util.Log
import com.phonefarm.client.network.reconnect.ConnectionStateMonitor
import com.phonefarm.client.network.reconnect.NetworkType
import com.phonefarm.client.network.transport.TransportSelector
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Dynamic video quality-of-service controller.
 *
 * Monitors network conditions and ACK backpressure to dynamically adjust
 * encoder parameters (bitrate, max FPS, resolution) for smooth streaming.
 *
 * Decision matrix:
 *   WiFi + low latency    → 1080p / 4 Mbps / 15fps
 *   WiFi + high latency   → 1080p / 2 Mbps / 10fps
 *   5G                    → 1080p / 2 Mbps / 10fps
 *   4G                    → 720p  / 1.5 Mbps / 10fps
 *   3G / metered          → 480p  / 0.8 Mbps / 8fps
 *   High ACK backlog      → halve bitrate
 *   Very high ACK backlog → drop to 480p
 */
@Singleton
class VideoQoSController @Inject constructor(
    private val connectionMonitor: ConnectionStateMonitor,
    private val transportSelector: TransportSelector,
    private val frameController: VideoFrameController,
) {

    companion object {
        private const val TAG = "VideoQoSController"
        private const val EVAL_INTERVAL_MS = 3000L
    }

    data class QoSParams(
        val maxSize: Int,
        val bitRate: Int,
        val maxFps: Int,
    )

    private val _currentParams = MutableStateFlow(QoSParams(1080, 4_000_000, 15))
    val currentParams: StateFlow<QoSParams> = _currentParams.asStateFlow()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var running = false
    private var screenEncoder: ScreenEncoder? = null

    /** Attach the screen encoder for dynamic bitrate control. */
    fun attachEncoder(encoder: ScreenEncoder) {
        screenEncoder = encoder
    }

    /**
     * Start periodic QoS evaluation and adjustment.
     */
    fun start() {
        if (running) return
        running = true
        scope.launch {
            while (isActive && running) {
                delay(EVAL_INTERVAL_MS)
                evaluateAndAdjust()
            }
        }
    }

    fun stop() {
        running = false
    }

    /**
     * Evaluate current conditions and adjust encoder parameters if needed.
     */
    private fun evaluateAndAdjust() {
        try {
            val networkType = connectionMonitor.networkType.value
            val pendingCount = frameController.pendingCount.value
            val drops = frameController.drops.value

            // Base parameters from network type
            var params = baseParamsForNetwork(networkType)

            // ACK backpressure adjustments
            if (pendingCount >= 2) {
                // Moderate backlog: reduce bitrate by 30%
                params = params.copy(bitRate = (params.bitRate * 0.7).toInt())
            }
            if (pendingCount >= 3 || drops > 0) {
                // High backlog or drops: more aggressive reduction
                params = params.copy(
                    bitRate = (params.bitRate * 0.5).toInt(),
                    maxFps = maxOf(5, params.maxFps - 5),
                )
            }

            // Apply if changed
            val current = _currentParams.value
            if (params != current) {
                _currentParams.value = params
                screenEncoder?.updateBitRate(params.bitRate)
                Log.d(TAG, "QoS adjusted: ${current.bitRate / 1000}kbps→${params.bitRate / 1000}kbps " +
                    "pending=$pendingCount drops=$drops net=$networkType")
            }
        } catch (e: Exception) {
            Log.w(TAG, "QoS evaluation error: ${e.message}")
        }
    }

    private fun baseParamsForNetwork(networkType: NetworkType): QoSParams {
        return when (networkType) {
            NetworkType.WIFI -> QoSParams(1080, 4_000_000, 15)
            NetworkType.MOBILE_5G -> QoSParams(1080, 2_000_000, 10)
            NetworkType.MOBILE_4G -> QoSParams(720, 1_500_000, 10)
            NetworkType.METERED -> QoSParams(480, 800_000, 8)
            NetworkType.VPN -> QoSParams(720, 1_500_000, 10)
            NetworkType.NONE -> QoSParams(480, 500_000, 5)
        }
    }
}
