package com.phonefarm.client.stream

import android.os.SystemClock
import dagger.hilt.android.scopes.ViewModelScoped
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * StreamController — 按需推流控制器 (Android 端)。
 *
 * 接收服务端 start_stream/stop_stream 指令, 控制 ScreenEncoder 启停。
 * 默认 OFF, 仅在收到指令后开启。
 *
 * 自动关闭策略:
 *   - 服务端发送 stop_stream 指令
 *   - 本地超时保护: 最大 30 分钟强制关闭
 */
@Singleton
class StreamController @Inject constructor() {

    companion object {
        private const val LOCAL_MAX_DURATION_MS = 30 * 60 * 1000L // 30 min failsafe
    }

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    private val _streamingState = MutableStateFlow(StreamState.IDLE)
    val streamingState: StateFlow<StreamState> = _streamingState

    private var startTimeMs: Long = 0
    private var localTimer: Job? = null

    /** 外部注入: ScreenEncoder 控制回调 */
    var onStartStreaming: ((maxSize: Int, bitRate: Int, maxFps: Int, audio: Boolean) -> Unit)? = null
    var onStopStreaming: (() -> Unit)? = null

    /**
     * 处理服务端 start_stream 消息。
     */
    fun handleStartStream(config: StreamConfig) {
        if (_streamingState.value == StreamState.STREAMING) {
            // Already streaming — restart with new config
            onStopStreaming?.invoke()
        }

        startTimeMs = SystemClock.elapsedRealtime()
        _streamingState.value = StreamState.STREAMING

        onStartStreaming?.invoke(
            config.maxSize,
            config.bitRate,
            config.maxFps,
            config.audio
        )

        // Local failsafe timer
        localTimer?.cancel()
        localTimer = scope.launch {
            delay(LOCAL_MAX_DURATION_MS)
            if (_streamingState.value == StreamState.STREAMING) {
                handleStopStream("local_timeout")
            }
        }
    }

    /**
     * 处理服务端 stop_stream 消息。
     */
    fun handleStopStream(reason: String) {
        if (_streamingState.value != StreamState.STREAMING) return

        _streamingState.value = StreamState.IDLE
        localTimer?.cancel()
        localTimer = null

        onStopStreaming?.invoke()

        android.util.Log.i("StreamController", "Stream stopped: $reason, duration=${(SystemClock.elapsedRealtime() - startTimeMs) / 1000}s")
    }

    /**
     * 获取推流时长 (秒)。
     */
    fun getStreamDurationSec(): Long {
        if (_streamingState.value != StreamState.STREAMING) return 0
        return (SystemClock.elapsedRealtime() - startTimeMs) / 1000
    }

    fun destroy() {
        scope.cancel()
        if (_streamingState.value == StreamState.STREAMING) {
            onStopStreaming?.invoke()
        }
    }
}

enum class StreamState {
    IDLE,
    STREAMING
}

data class StreamConfig(
    val maxSize: Int = 1080,
    val bitRate: Int = 4_000_000,
    val maxFps: Int = 15,
    val audio: Boolean = false
)
