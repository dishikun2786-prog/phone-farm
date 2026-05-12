package com.phonefarm.client.network.transport

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.OkHttpClient
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 检测设备所在网络的 NAT 类型，为传输策略提供决策依据。
 *
 * 探测方法：向服务端 UDP 端口发送探测包 → 服务端回显公网 IP:Port →
 * 从不同本地端口发包 → 对比服务端看到的映射是否变化。
 */
@Singleton
class NatDetector @Inject constructor(
    private val okHttpClient: OkHttpClient,
) {
    enum class NatType {
        /** 公网 IP，无 NAT */
        OPEN,
        /** 任何外部主机可发往映射地址 */
        FULL_CONE,
        /** 仅已联系过的 IP 可发往映射地址 */
        RESTRICTED,
        /** 仅已联系过的 IP:Port 可发往映射地址 */
        PORT_RESTRICTED,
        /** 每个目标 IP:Port 有独立映射，打洞困难 */
        SYMMETRIC,
        /** 无法确定 */
        UNKNOWN,
    }

    data class NatInfo(
        val type: NatType,
        val publicIp: String,
        val publicPort: Int,
    )

    private val probeRequest: ByteArray = byteArrayOf(
        0x01.toByte(), // NAT probe request
        0, 0, 0, 0,    // placeholder
    )

    /**
     * 发送 UDP 探测包到服务端，解析返回的公网 IP:Port。
     */
    private suspend fun sendProbe(
        socket: DatagramSocket,
        serverAddress: InetSocketAddress,
    ): NatProbeResult? = withContext(Dispatchers.IO) {
        withTimeoutOrNull(3000L) {
            try {
                val sendPacket = DatagramPacket(
                    probeRequest, probeRequest.size,
                    serverAddress
                )
                socket.send(sendPacket)

                val recvBuf = ByteArray(64)
                val recvPacket = DatagramPacket(recvBuf, recvBuf.size)
                socket.soTimeout = 3000
                socket.receive(recvPacket)

                val msg = recvPacket.data
                // Response header: 0x81
                if (msg.isNotEmpty() && msg[0] == 0x81.toByte()) {
                    val publicIp = "${msg[2].toUByte()}.${msg[3].toUByte()}.${msg[4].toUByte()}.${msg[5].toUByte()}"
                    val publicPort = ((msg[6].toInt() and 0xFF) shl 8) or (msg[7].toInt() and 0xFF)
                    NatProbeResult(publicIp, publicPort)
                } else null
            } catch (_: Exception) {
                null
            }
        }
    }

    /**
     * 检测 NAT 类型：
     * 1. 发送 UDP 包到服务端 → 服务端回显公网 IP:Port
     * 2. 从不同源端口发送 → 对比映射是否一致
     * 3. 向服务端请求从不同源端口回包 → 检测是否受限
     */
    suspend fun detect(serverHost: String, serverPort: Int): NatInfo = withContext(Dispatchers.IO) {
        val serverAddress = InetSocketAddress(serverHost, serverPort)

        // 第 1 次探测：获取公网映射
        val sock1 = DatagramSocket()
        val probe1 = sendProbe(sock1, serverAddress)
        sock1.close()

        if (probe1 == null) {
            return@withContext NatInfo(NatType.UNKNOWN, "", 0)
        }

        // 检查是否是公网 IP（无 NAT）
        val localIp = sock1.localAddress?.hostAddress ?: ""
        if (localIp == probe1.publicIp) {
            return@withContext NatInfo(NatType.OPEN, probe1.publicIp, probe1.publicPort)
        }

        // 第 2 次探测：从不同本地端口发包，看映射是否变化
        val sock2 = DatagramSocket()
        val probe2 = sendProbe(sock2, serverAddress)
        sock2.close()

        if (probe2 == null) {
            return@withContext NatInfo(NatType.UNKNOWN, probe1.publicIp, probe1.publicPort)
        }

        // 端口变化 → SYMMETRIC（每个目标有独立映射，打洞困难）
        if (probe1.publicPort != probe2.publicPort) {
            return@withContext NatInfo(
                NatType.SYMMETRIC, probe1.publicIp, probe1.publicPort
            )
        }

        // 端口不变 → 可能是 FULL_CONE 或 RESTRICTED 或 PORT_RESTRICTED
        // 第 3 次探测：用第 3 个 socket 向服务端另一个端口发包
        // 如果能从另一个端口收到回包 → FULL_CONE
        // 否则 → RESTRICTED 或 PORT_RESTRICTED（保守判定为 PORT_RESTRICTED）
        val sock3 = DatagramSocket()
        val altServerPort = if (serverPort == 8444) 8445 else serverPort + 1
        val altAddress = InetSocketAddress(serverHost, altServerPort)

        try {
            val sendPacket3 = DatagramPacket(probeRequest, probeRequest.size, altAddress)
            sock3.send(sendPacket3)

            val recvBuf3 = ByteArray(64)
            val recvPacket3 = DatagramPacket(recvBuf3, recvBuf3.size)
            sock3.soTimeout = 2000
            sock3.receive(recvPacket3)

            // 从不同端口也能收包 → FULL_CONE
            sock3.close()
            return@withContext NatInfo(
                NatType.FULL_CONE, probe1.publicIp, probe1.publicPort
            )
        } catch (_: Exception) {
            sock3.close()
            // 从不同端口收不到 → PORT_RESTRICTED（保守）
            return@withContext NatInfo(
                NatType.PORT_RESTRICTED, probe1.publicIp, probe1.publicPort
            )
        }
    }

    private data class NatProbeResult(
        val publicIp: String,
        val publicPort: Int,
    )
}
