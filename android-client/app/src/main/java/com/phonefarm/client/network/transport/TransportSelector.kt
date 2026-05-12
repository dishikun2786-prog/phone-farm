package com.phonefarm.client.network.transport

import com.phonefarm.client.network.reconnect.ConnectionStateMonitor
import com.phonefarm.client.network.WebSocketClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 根据 NAT 类型和网络状态自动选择最佳传输通道。
 *
 * 决策逻辑：
 *   UDP 可通 (OPEN / FULL_CONE) → 音视频走 UDP, 控制走 WS
 *   UDP 受限 (RESTRICTED / PORT_RESTRICTED) → 尝试 UDP，回退 WS
 *   UDP 不通 (SYMMETRIC / UNKNOWN) → 全部走 WS
 *   网络类型切换 → 重新评估
 */
@Singleton
class TransportSelector @Inject constructor(
    private val natDetector: NatDetector,
    private val udpTransport: UdpTransport,
    private val webSocketClient: WebSocketClient,
    private val connectionMonitor: ConnectionStateMonitor,
) {
    enum class VideoTransport {
        /** UDP 直连（低延迟） */
        UDP,
        /** WebSocket TCP 中继（可靠，回退方案） */
        WEBSOCKET,
    }

    private val _videoTransport = MutableStateFlow(VideoTransport.WEBSOCKET)
    val videoTransport: StateFlow<VideoTransport> = _videoTransport.asStateFlow()

    /** 当前 NAT 类型 */
    private val _natType = MutableStateFlow(NatDetector.NatType.UNKNOWN)
    val natType: StateFlow<NatDetector.NatType> = _natType.asStateFlow()

    /** 是否已探测过 */
    @Volatile
    private var evaluated = false

    /**
     * 在 WebSocket 连接建立后调用，自动检测并选择最佳传输。
     * 会阻塞直到 NAT 探测完成。
     */
    suspend fun evaluate(serverHost: String) {
        val nat = natDetector.detect(serverHost, 8444)
        _natType.value = nat.type

        when (nat.type) {
            NatDetector.NatType.OPEN,
            NatDetector.NatType.FULL_CONE -> {
                val ok = udpTransport.connect(serverHost, 8444)
                _videoTransport.value = if (ok) VideoTransport.UDP else VideoTransport.WEBSOCKET
            }
            NatDetector.NatType.RESTRICTED,
            NatDetector.NatType.PORT_RESTRICTED -> {
                val ok = udpTransport.connect(serverHost, 8444)
                // 受限 NAT 也尝试 UDP，但不期望高成功率
                _videoTransport.value = if (ok) VideoTransport.UDP else VideoTransport.WEBSOCKET
            }
            else -> {
                _videoTransport.value = VideoTransport.WEBSOCKET
            }
        }

        evaluated = true
    }

    /** 网络类型变化时重新评估 */
    suspend fun reevaluate(serverHost: String) {
        udpTransport.disconnect()
        evaluated = false
        _videoTransport.value = VideoTransport.WEBSOCKET
        evaluate(serverHost)
    }

    /** 发送视频帧 — 自动选择传输方式 */
    fun sendVideoFrame(encoded: ByteArray): Boolean {
        return when (_videoTransport.value) {
            VideoTransport.UDP -> udpTransport.sendVideoFrame(encoded)
            VideoTransport.WEBSOCKET -> webSocketClient.sendBinaryFrame(encoded, isVideo = true)
        }
    }

    /** 发送音频帧 — 自动选择传输方式 */
    fun sendAudioFrame(encoded: ByteArray): Boolean {
        return when (_videoTransport.value) {
            VideoTransport.UDP -> udpTransport.sendAudioFrame(encoded)
            VideoTransport.WEBSOCKET -> webSocketClient.sendBinaryFrame(encoded, isVideo = false)
        }
    }

    /** 接收 ACK (仅 UDP 模式有效) */
    suspend fun receiveAck(): Long? {
        return if (_videoTransport.value == VideoTransport.UDP) {
            udpTransport.receiveAck()
        } else null
    }

    fun disconnect() {
        udpTransport.disconnect()
        evaluated = false
        _videoTransport.value = VideoTransport.WEBSOCKET
    }
}
