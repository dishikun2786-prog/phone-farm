package com.phonefarm.client.webrtc

import android.content.Context
import android.util.Log
import com.phonefarm.client.network.ConnectionState
import com.phonefarm.client.network.WebSocketClient
import com.phonefarm.client.network.WebSocketMessage
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SessionDescription
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages a pool of P2P WebRTC connections to other devices.
 *
 * Each connection includes a DataChannel for binary device control using
 * [DataChannelProtocol]. Connections are established via server-relayed signaling
 * through the existing [WebSocketClient].
 *
 * Connection lifecycle:
 *   1. send webrtc_connect_request to target via server
 *   2. wait for webrtc_connect_accept (timeout: 30s)
 *   3. create PeerConnection, DataChannel, local SDP offer
 *   4. exchange SDP and ICE candidates through server relay
 *   5. DataChannel opens → connection established
 *   6. heartbeat monitoring begins
 */
@Singleton
class P2pConnectionManager @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val webSocketClient: WebSocketClient,
) {

    companion object {
        private const val TAG = "P2pConnMgr"
        private const val CONNECTION_TIMEOUT_MS = 30_000L
        private const val HEARTBEAT_INTERVAL_MS = 5_000L
        private const val HEARTBEAT_TIMEOUT_MS = 20_000L
        private const val ICE_SERVER_URL = "stun:stun.l.google.com:19302"

        // DataChannel labels
        const val DC_LABEL_CONTROL = "phonefarm-control"
        const val DC_LABEL_STREAM = "phonefarm-stream"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob() + CoroutineName("P2pConnMgr"))
    private val connections = ConcurrentHashMap<String, P2pConnection>()
    private val pendingConnections = ConcurrentHashMap<String, CompletableDeferred<P2pConnection>>()

    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var myDeviceId: String = ""

    // ── Data Classes ──

    data class P2pConnection(
        val deviceId: String,
        val peerConnection: PeerConnection,
        val dataChannel: DataChannel?,
        private val _state: MutableStateFlow<ConnectionState>,
    ) {
        val state: StateFlow<ConnectionState> = _state.asStateFlow()

        val isConnected: Boolean get() = _state.value == ConnectionState.CONNECTED
    }

    /**
     * Set the local device ID before establishing connections.
     */
    fun setLocalDeviceId(deviceId: String) {
        myDeviceId = deviceId
    }

    /**
     * Initialize the PeerConnectionFactory. Should be called once during app startup.
     */
    fun initialize() {
        if (peerConnectionFactory != null) return

        val options = PeerConnectionFactory.InitializationOptions.builder(appContext)
            .setFieldTrials("")
            .createInitializationOptions()
        PeerConnectionFactory.initialize(options)

        val encoderFactory = org.webrtc.DefaultVideoEncoderFactory(
            org.webrtc.EglBase.create().eglBaseContext, true, true
        )
        val decoderFactory = org.webrtc.DefaultVideoDecoderFactory(
            org.webrtc.EglBase.create().eglBaseContext
        )

        peerConnectionFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()

        Log.i(TAG, "PeerConnectionFactory initialized")
    }

    // ── Public API ──

    /**
     * Connect to a remote device via P2P WebRTC.
     *
     * Full flow: send request → wait for accept → create offer → ICE exchange → open.
     *
     * @param deviceId the remote device ID to connect to
     * @return [Result] containing the established [P2pConnection] or an error
     */
    suspend fun connectTo(deviceId: String): Result<P2pConnection> {
        // Return existing connection if already connected
        connections[deviceId]?.let { existing ->
            if (existing.isConnected) {
                Log.d(TAG, "Already connected to $deviceId")
                return Result.success(existing)
            }
        }

        // Short-circuit: if server WebSocket is down, we cannot signal
        if (!webSocketClient.isConnected()) {
            return Result.failure(IllegalStateException("Server WebSocket not connected — cannot signal P2P"))
        }

        ensureFactoryInitialized()

        Log.i(TAG, "Connecting to device: $deviceId")

        return try {
            withTimeout(CONNECTION_TIMEOUT_MS) {
                // Create a deferred that will be completed when the connection establishes
                val deferred = CompletableDeferred<P2pConnection>()
                pendingConnections[deviceId] = deferred

                // Send connection request to target via server relay
                webSocketClient.send(
                    WebSocketMessage.WebrtcRequestConnection(
                        from = myDeviceId,
                        to = deviceId,
                    )
                )

                Log.d(TAG, "Sent connection request to $deviceId, waiting for accept...")

                // Wait for the accept response (handled by handleIncomingAccept)
                val connection = deferred.await()

                // Now create and negotiate the actual WebRTC connection
                establishWebrtcConnection(connection)

                Log.i(TAG, "Connected to $deviceId (P2P DataChannel ready)")
                Result.success(connection)
            }
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            pendingConnections.remove(deviceId)
            Log.w(TAG, "Connection timeout to $deviceId, fallback to WebSocket relay")
            Result.failure(
                java.util.concurrent.TimeoutException("P2P connection to $deviceId timed out after ${CONNECTION_TIMEOUT_MS}ms")
            )
        } catch (e: Exception) {
            pendingConnections.remove(deviceId)
            Log.e(TAG, "Failed to connect to $deviceId", e)
            Result.failure(e)
        }
    }

    /**
     * Disconnect from a specific peer and clean up resources.
     */
    fun disconnectFrom(deviceId: String) {
        val conn = connections.remove(deviceId) ?: return
        Log.i(TAG, "Disconnecting from $deviceId")
        try {
            conn.dataChannel?.close()
            conn.peerConnection.close()
        } catch (e: Exception) {
            Log.w(TAG, "Error closing connection to $deviceId", e)
        }
        conn._state.value = ConnectionState.DISCONNECTED
    }

    /**
     * Disconnect from all peers.
     */
    fun disconnectAll() {
        Log.i(TAG, "Disconnecting all peers (${connections.size} active)")
        connections.keys.toList().forEach { disconnectFrom(it) }
        pendingConnections.clear()
    }

    /**
     * Get a connection by device ID, or null if not connected.
     */
    fun getConnection(deviceId: String): P2pConnection? = connections[deviceId]

    /**
     * Get the set of currently connected peer device IDs.
     */
    fun getConnectedPeers(): Set<String> {
        return connections.filterValues { it.isConnected }.keys.toSet()
    }

    /**
     * Send binary data to a specific peer via the DataChannel.
     *
     * @return true if the message was queued for sending
     */
    fun sendToPeer(deviceId: String, data: ByteArray): Boolean {
        val conn = connections[deviceId] ?: return false
        val dc = conn.dataChannel ?: return false
        if (dc.state() != DataChannel.State.OPEN) return false

        return try {
            val buffer = ByteBuffer.wrap(data)
            dc.send(DataChannel.Buffer(buffer, true))
            true
        } catch (e: Exception) {
            Log.w(TAG, "Failed to send to $deviceId", e)
            false
        }
    }

    /**
     * Broadcast binary data to all connected peers.
     *
     * @return count of successful sends
     */
    fun broadcastToPeers(data: ByteArray): Int {
        var successCount = 0
        connections.forEach { (deviceId, _) ->
            if (sendToPeer(deviceId, data)) successCount++
        }
        return successCount
    }

    /**
     * Handle an incoming WebRTC connection request from another device.
     * Called by [com.phonefarm.client.network.WebSocketMessageDispatcher].
     *
     * Auto-accepts if from an authenticated device; otherwise defers to auth check.
     */
    fun handleIncomingRequest(fromDeviceId: String): Boolean {
        Log.i(TAG, "Incoming connection request from $fromDeviceId")
        ensureFactoryInitialized()

        // Auto-accept: send accept message back
        webSocketClient.send(
            WebSocketMessage.WebrtcAcceptConnection(
                from = myDeviceId,
                to = fromDeviceId,
            )
        )
        return true
    }

    /**
     * Handle an incoming SDP offer from a peer.
     * Called by [com.phonefarm.client.network.WebSocketMessageDispatcher].
     */
    fun handleIncomingOffer(fromDeviceId: String, sdp: String) {
        Log.d(TAG, "Received SDP offer from $fromDeviceId")
        scope.launch {
            try {
                acceptIncomingOffer(fromDeviceId, sdp)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to handle offer from $fromDeviceId", e)
            }
        }
    }

    /**
     * Handle an incoming connection accept from a peer (response to our request).
     * Called by [com.phonefarm.client.network.WebSocketMessageDispatcher].
     */
    fun handleIncomingAccept(fromDeviceId: String) {
        Log.d(TAG, "Received connection accept from $fromDeviceId")
        val deferred = pendingConnections[fromDeviceId] ?: return

        val conn = createConnection(fromDeviceId)
        connections[fromDeviceId] = conn
        deferred.complete(conn)
    }

    /**
     * Handle an incoming connection rejection from a peer.
     */
    fun handleIncomingReject(fromDeviceId: String, reason: String) {
        Log.w(TAG, "Connection rejected by $fromDeviceId: $reason")
        val deferred = pendingConnections.remove(fromDeviceId)
        deferred?.completeExceptionally(
            RuntimeException("Connection to $fromDeviceId rejected: $reason")
        )
    }

    /**
     * Handle an incoming SDP answer from a peer.
     */
    fun handleIncomingAnswer(fromDeviceId: String, sdp: String) {
        Log.d(TAG, "Received SDP answer from $fromDeviceId")
        val conn = connections[fromDeviceId] ?: run {
            Log.w(TAG, "No connection state for $fromDeviceId")
            return
        }
        conn.peerConnection.setRemoteDescription(
            SimpleSdpObserver(TAG, "setRemoteAnswer"),
            SessionDescription(SessionDescription.Type.ANSWER, sdp)
        )
    }

    /**
     * Handle an incoming ICE candidate from a peer.
     */
    fun handleIncomingIceCandidate(fromDeviceId: String, candidate: String, sdpMid: String?, sdpMLineIndex: Int) {
        val conn = connections[fromDeviceId] ?: return
        val iceCandidate = IceCandidate(sdpMid, sdpMLineIndex, candidate)
        conn.peerConnection.addIceCandidate(iceCandidate)
    }

    /**
     * Clean up resources. Call during shutdown.
     */
    fun shutdown() {
        disconnectAll()
        scope.cancel()
        peerConnectionFactory?.dispose()
        peerConnectionFactory = null
        Log.i(TAG, "P2pConnectionManager shut down")
    }

    // ── Private: WebRTC Negotiation ──

    private fun establishWebrtcConnection(conn: P2pConnection) {
        val pc = conn.peerConnection

        // Create DataChannel (offer side)
        val init = DataChannel.Init().apply {
            ordered = true
            id = 0
        }
        val dataChannel = pc.createDataChannel(DC_LABEL_CONTROL, init)
        registerDataChannelObserver(conn, dataChannel)

        // Create and set local offer
        val constraints = MediaConstraints()
        pc.createOffer(object : SimpleSdpObserver(TAG, "createOffer") {
            override fun onCreateSuccess(sdp: SessionDescription?) {
                sdp ?: return
                pc.setLocalDescription(SimpleSdpObserver(TAG, "setLocalOffer"), sdp)

                // Send offer to peer via server relay
                webSocketClient.send(
                    WebSocketMessage.WebrtcOffer(
                        from = myDeviceId,
                        to = conn.deviceId,
                        sdp = sdp.description,
                    )
                )
                Log.d(TAG, "Sent WebRTC offer to ${conn.deviceId}")
            }
        }, constraints)
    }

    private suspend fun acceptIncomingOffer(fromDeviceId: String, sdp: String) {
        val conn = createConnection(fromDeviceId)
        connections[fromDeviceId] = conn

        val pc = conn.peerConnection
        pc.setRemoteDescription(
            SimpleSdpObserver(TAG, "setRemoteOffer"),
            SessionDescription(SessionDescription.Type.OFFER, sdp)
        )

        val constraints = MediaConstraints()
        pc.createAnswer(object : SimpleSdpObserver(TAG, "createAnswer") {
            override fun onCreateSuccess(sdp: SessionDescription?) {
                sdp ?: return
                pc.setLocalDescription(SimpleSdpObserver(TAG, "setLocalAnswer"), sdp)

                webSocketClient.send(
                    WebSocketMessage.WebrtcAnswer(
                        from = myDeviceId,
                        to = fromDeviceId,
                        sdp = sdp.description,
                    )
                )
                Log.d(TAG, "Sent WebRTC answer to $fromDeviceId")
            }
        }, constraints)
    }

    private fun createConnection(deviceId: String): P2pConnection {
        val factory = peerConnectionFactory
            ?: throw IllegalStateException("PeerConnectionFactory not initialized")

        val iceServers = listOf(
            PeerConnection.IceServer.builder(ICE_SERVER_URL).createIceServer()
        )

        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            // Data-only: disable unused transports to save resources
            disableIpv6 = false
            continualGatheringPolicy =
                PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }

        val observer = P2pPeerObserver(deviceId)
        val pc = factory.createPeerConnection(rtcConfig, observer)!!

        val state = MutableStateFlow(ConnectionState.CONNECTING)
        val conn = P2pConnection(
            deviceId = deviceId,
            peerConnection = pc,
            dataChannel = null, // set when DataChannel opens
            _state = state,
        )

        return conn
    }

    private fun registerDataChannelObserver(conn: P2pConnection, channel: DataChannel) {
        channel.registerObserver(object : DataChannel.Observer {
            override fun onStateChange() {
                Log.d(TAG, "DataChannel state for ${conn.deviceId}: ${channel.state()}")
                when (channel.state()) {
                    DataChannel.State.OPEN -> {
                        // Update the connection reference
                        val updated = conn.copy(
                            dataChannel = channel,
                            _state = conn._state.apply { value = ConnectionState.CONNECTED }
                        )
                        connections[conn.deviceId] = updated
                        Log.i(TAG, "DataChannel OPEN for ${conn.deviceId}")
                        startHeartbeat(updated)
                    }
                    DataChannel.State.CLOSED, DataChannel.State.CLOSING -> {
                        conn._state.value = ConnectionState.DISCONNECTED
                        Log.w(TAG, "DataChannel CLOSED for ${conn.deviceId}")
                        // Clean up after a short delay to allow reconnection attempts
                        scope.launch {
                            delay(5_000)
                            connections.remove(conn.deviceId)
                        }
                    }
                    else -> {}
                }
            }

            override fun onMessage(buffer: DataChannel.Buffer) {
                val bytes = ByteArray(buffer.data.remaining())
                buffer.data.get(bytes)
                val message = DataChannelProtocol.decode(bytes)
                if (message != null) {
                    Log.d(TAG, "DataChannel message from ${conn.deviceId}: ${message::class.simpleName}")
                    // Heartbeat ACK handling
                    if (message is DataChannelProtocol.ProtocolMessage.Heartbeat) {
                        val ack = DataChannelProtocol.encodeAck(
                            seq = message.seq,
                            originalType = DataChannelProtocol.TYPE_HEARTBEAT,
                        )
                        sendToPeer(conn.deviceId, ack)
                    }
                }
            }

            override fun onBufferedAmountChange(previousAmount: Long) {}
        })
    }

    // ── Heartbeat ──

    private fun startHeartbeat(conn: P2pConnection) {
        var lastPong = System.currentTimeMillis()
        var seq = 0

        val job = scope.launch {
            while (isActive && conn.isConnected) {
                delay(HEARTBEAT_INTERVAL_MS)
                seq++

                val heartbeat = DataChannelProtocol.encodeHeartbeat(seq)
                val sent = sendToPeer(conn.deviceId, heartbeat)

                if (!sent) {
                    Log.w(TAG, "Heartbeat send failed for ${conn.deviceId}")
                    break
                }

                // Check for timeout
                if (System.currentTimeMillis() - lastPong > HEARTBEAT_TIMEOUT_MS) {
                    Log.w(TAG, "Heartbeat timeout for ${conn.deviceId}")
                    conn._state.value = ConnectionState.DISCONNECTED
                    disconnectFrom(conn.deviceId)
                    break
                }
            }
        }
    }

    private fun ensureFactoryInitialized() {
        if (peerConnectionFactory == null) {
            initialize()
        }
    }

    // ── PeerConnection Observer ──

    private inner class P2pPeerObserver(
        private val peerDeviceId: String,
    ) : PeerConnection.Observer {
        override fun onIceCandidate(candidate: IceCandidate?) {
            candidate ?: return
            webSocketClient.send(
                WebSocketMessage.WebrtcIceCandidate(
                    from = myDeviceId,
                    to = peerDeviceId,
                    candidate = candidate.sdp,
                    sdpMid = candidate.sdpMid,
                    sdpMLineIndex = candidate.sdpMLineIndex,
                )
            )
        }

        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}
        override fun onSignalingChange(state: PeerConnection.SignalingState?) {
            Log.d(TAG, "Signaling state for $peerDeviceId: $state")
        }
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
            Log.d(TAG, "ICE connection state for $peerDeviceId: $state")
            when (state) {
                PeerConnection.IceConnectionState.DISCONNECTED,
                PeerConnection.IceConnectionState.FAILED,
                PeerConnection.IceConnectionState.CLOSED -> {
                    connections[peerDeviceId]?._state?.value = ConnectionState.DISCONNECTED
                }
                PeerConnection.IceConnectionState.CONNECTED -> {
                    connections[peerDeviceId]?._state?.value = ConnectionState.CONNECTED
                }
                else -> {}
            }
        }
        override fun onIceConnectionReceivingChange(receiving: Boolean) {}
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {}
        override fun onAddStream(stream: org.webrtc.MediaStream?) {}
        override fun onRemoveStream(stream: org.webrtc.MediaStream?) {}
        override fun onDataChannel(channel: DataChannel?) {
            channel ?: return
            val conn = connections[peerDeviceId] ?: return
            if (channel.label() == DC_LABEL_CONTROL) {
                registerDataChannelObserver(conn, channel)
            }
        }
        override fun onRenegotiationNeeded() {}
        override fun onAddTrack(
            receiver: org.webrtc.RtpReceiver?,
            streams: Array<out org.webrtc.MediaStream>?,
        ) {}
    }
}

/**
 * Minimal [org.webrtc.SdpObserver] that logs lifecycle events.
 */
internal open class SimpleSdpObserver(
    private val tag: String,
    private val operation: String,
) : org.webrtc.SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription?) {
        if (sdp != null) Log.d(tag, "$operation success: type=${sdp.type}")
    }
    override fun onSetSuccess() {
        Log.d(tag, "$operation set success")
    }
    override fun onCreateFailure(reason: String?) {
        Log.e(tag, "$operation create failed: $reason")
    }
    override fun onSetFailure(reason: String?) {
        Log.e(tag, "$operation set failed: $reason")
    }
}
