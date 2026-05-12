package com.phonefarm.client.network.transport

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

/**
 * UDP 音视频帧传输通道。
 *
 * 仅在 NAT 类型允许 UDP 直连时启用。
 * -
 * - 音视频帧 Protobuf 编码后通过 DatagramSocket 发送
 * - 接收服务端回传的 ACK
 * - 保活：每 10s 发送 keepalive 小包维持 NAT 映射
 */
@Singleton
class UdpTransport @Inject constructor() {

    @Volatile
    private var socket: DatagramSocket? = null

    @Volatile
    private var serverAddress: InetSocketAddress? = null

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val keepaliveJob = AtomicBoolean(false)

    /** 最新收到的 ACK seq，null 表示尚未收到 */
    @Volatile
    private var lastAckSeq: Long? = null

    private val ackChannel = Channel<Long>(Channel.CONFLATED)

    /**
     * 尝试建立 UDP 通道（在 WebSocket 握手后调用）。
     * @param host 服务端公网 IP/域名
     * @param port UDP relay 端口
     * @param localPort 本地端口 (0 = 自动分配)
     */
    suspend fun connect(host: String, port: Int, localPort: Int = 0): Boolean =
        withContext(Dispatchers.IO) {
            try {
                socket?.close()
                val sock = DatagramSocket(localPort)
                sock.soTimeout = 5000
                serverAddress = InetSocketAddress(host, port)
                socket = sock
                _isConnected.value = true

                // 启动 keepalive 协程
                if (keepaliveJob.compareAndSet(false, true)) {
                    startKeepalive()
                }
                true
            } catch (_: Exception) {
                _isConnected.value = false
                false
            }
        }

    /**
     * 发送 Protobuf 编码的音视频帧。
     * 消息格式: [0x02/0x05 byte] + [payload bytes]
     */
    fun sendEncodedFrame(encoded: ByteArray, isVideo: Boolean): Boolean {
        val sock = socket ?: return false
        val addr = serverAddress ?: return false
        return try {
            val header = if (isVideo) 0x02.toByte() else 0x05.toByte()
            val packetData = ByteArray(1 + encoded.size)
            packetData[0] = header
            System.arraycopy(encoded, 0, packetData, 1, encoded.size)
            val packet = DatagramPacket(packetData, packetData.size, addr)
            sock.send(packet)
            true
        } catch (_: Exception) {
            false
        }
    }

    /** 发送视频帧（便捷方法） */
    fun sendVideoFrame(encoded: ByteArray): Boolean = sendEncodedFrame(encoded, isVideo = true)

    /** 发送音频帧（便捷方法） */
    fun sendAudioFrame(encoded: ByteArray): Boolean = sendEncodedFrame(encoded, isVideo = false)

    /** 接收 ACK 消息（非阻塞），返回已确认的帧序号 */
    suspend fun receiveAck(): Long? = withContext(Dispatchers.IO) {
        val sock = socket ?: return@withContext null
        withTimeoutOrNull(1000L) {
            try {
                val buf = ByteArray(32)
                val packet = DatagramPacket(buf, buf.size)
                sock.receive(packet)
                val data = packet.data
                if (data.isNotEmpty() && data[0] == 0x03.toByte()) {
                    // ACK format: 0x03 + frameSeq(8 bytes big-endian long)
                    var seq = 0L
                    for (i in 1..8) {
                        seq = (seq shl 8) or (data[i].toLong() and 0xFF)
                    }
                    lastAckSeq = seq
                    ackChannel.trySend(seq)
                    seq
                } else null
            } catch (_: Exception) {
                null
            }
        }
    }

    /** 发送 keepalive 保持 NAT 映射不过期 */
    private suspend fun startKeepalive() {
        withContext(Dispatchers.IO) {
            while (isActive && _isConnected.value) {
                delay(10_000L) // 每 10s
                try {
                    val sock = socket ?: continue
                    val addr = serverAddress ?: continue
                    val keepalive = byteArrayOf(0x04.toByte()) // keepalive header
                    val packet = DatagramPacket(keepalive, keepalive.size, addr)
                    sock.send(packet)
                } catch (_: Exception) {
                    // keepalive 失败不改变连接状态
                }
            }
        }
    }

    fun disconnect() {
        _isConnected.value = false
        keepaliveJob.set(false)
        try {
            socket?.close()
        } catch (_: Exception) {
        }
        socket = null
        serverAddress = null
    }
}
