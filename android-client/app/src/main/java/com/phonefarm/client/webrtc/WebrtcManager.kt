package com.phonefarm.client.webrtc

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpParameters
import org.webrtc.RtpTransceiver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * WebRTC PeerConnection lifecycle manager for Android devices.
 *
 * Manages a pool of [PeerConnection] instances keyed by remote device ID.
 * Each connection supports video (screen sharing) and a data channel for
 * low-latency control messages.
 *
 * Architecture:
 * - [PeerConnectionFactory] is a singleton initialized once on construction
 * - ICE server config: default Google STUN + optional TURN from config
 * - Video codec preference: H.264 (hardware-accelerated)
 * - All operations use coroutine-based suspend functions for async signaling
 *
 * Usage:
 * ```
 * webrtcManager.createPeerConnection("device-456")
 * val offer = webrtcManager.createOffer("device-456")
 * // Send offer via SignalingSender ...
 * // Receive answer and set:
 * webrtcManager.setRemoteDescription("device-456", answerSdp)
 * ```
 */
@Singleton
class WebrtcManager @Inject constructor(
    private val resources: WebrtcSharedResources,
    private val signalingSender: SignalingSender,
) {

    companion object {
        private const val TAG = "WebrtcManager"

        // ICE server presets
        // Use VPS-hosted STUN/TURN for both primary and fallback
        private val DEFAULT_STUN_SERVER = PeerConnection.IceServer.builder(
            "stun:47.243.254.248:3478"
        ).createIceServer()

        // TURN server — populated from config/remote
        // VPS TURN server (47.243.254.248) — can be overridden via configureTurn()
        private var TURN_SERVER_URL: String = "turn:47.243.254.248:3478?transport=udp"
        private var TURN_SERVER_USER: String = "phonefarm"
        private var TURN_SERVER_CREDENTIAL: String = "" // Must be configured from server

        // Data channel labels
        const val DATA_CHANNEL_CONTROL = "phonefarm-control"
        const val DATA_CHANNEL_STATS = "phonefarm-stats"
    }

    // ---- PeerConnection pool ----

    private val connections = ConcurrentHashMap<String, PeerConnection>()

    // ---- State flows ----

    private val _connectionStates = MutableStateFlow<Map<String, PeerConnection.PeerConnectionState>>(emptyMap())
    val connectionStates: StateFlow<Map<String, PeerConnection.PeerConnectionState>> = _connectionStates.asStateFlow()

    private val _iceConnectionStates = MutableStateFlow<Map<String, PeerConnection.IceConnectionState>>(emptyMap())
    val iceConnectionStates: StateFlow<Map<String, PeerConnection.IceConnectionState>> = _iceConnectionStates.asStateFlow()

    // ---- Shared resources (EglBase + PeerConnectionFactory) ----

    private var myDeviceId: String = ""

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // ---- Public API ----

    /**
     * Update TURN server configuration from a remote config source.
     */
    fun configureTurn(url: String, username: String, credential: String) {
        TURN_SERVER_URL = url
        TURN_SERVER_USER = username
        TURN_SERVER_CREDENTIAL = credential
        android.util.Log.i(TAG, "TURN server configured: $url")
    }

    /** Set the local device ID — must be called before creating connections. */
    fun setLocalDeviceId(deviceId: String) {
        myDeviceId = deviceId
    }

    /**
     * Create a new [PeerConnection] for the given remote device.
     *
     * The connection is configured with:
     * - STUN (Google public) + optional TURN ICE servers
     * - Media constraints for unified plan SDP
     * - H.264 video codec preference
     * - State observers wired to [StateFlow]
     *
     * @param deviceId  The remote device this connection targets.
     * @return The newly created PeerConnection.
     */
    fun createPeerConnection(deviceId: String): PeerConnection {
        // Close existing connection for this device if any.
        closeConnection(deviceId)

        val rtcConfig = PeerConnection.RTCConfiguration(
            listOf(
                DEFAULT_STUN_SERVER,
                PeerConnection.IceServer.builder(TURN_SERVER_URL)
                    .setUsername(TURN_SERVER_USER)
                    .setPassword(TURN_SERVER_CREDENTIAL)
                    .createIceServer(),
            )
        ).apply {
            // Unified plan for modern multi-track negotiation
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            // Trickle ICE enabled for faster connection
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
            // ICE restart support
            iceTransportsType = PeerConnection.IceTransportsType.ALL
        }

        val observer = createPeerConnectionObserver(deviceId)
        val connection = resources.acquire().createPeerConnection(rtcConfig, observer) ?: run {
            throw IllegalStateException("Failed to create PeerConnection for device $deviceId")
        }

        // Set preferred video codec to H.264.
        setH264CodecPreference(connection)

        connections[deviceId] = connection
        updateStateMap(deviceId, connection.connectionState(), connection.iceConnectionState())

        android.util.Log.i(TAG, "PeerConnection created for device: $deviceId")
        return connection
    }

    /**
     * Create an SDP offer for the specified device's PeerConnection.
     *
     * Suspends until the SDP is generated (which may take a few hundred ms).
     *
     * @param deviceId  The device whose PeerConnection should create the offer.
     * @return The generated [SessionDescription] (offer).
     */
    suspend fun createOffer(deviceId: String): SessionDescription {
        val connection = connections[deviceId]
            ?: throw IllegalStateException("No PeerConnection for device $deviceId")

        return suspendCancellableCoroutine { continuation ->
            val constraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "false"))
            }

            connection.createOffer({ sdp ->
                connection.setLocalDescription(
                    object : org.webrtc.SdpObserver {
                        override fun onCreateSuccess(sdp: SessionDescription?) {}
                        override fun onSetSuccess() {
                            android.util.Log.d(TAG, "Local description set (offer) for $deviceId")
                            continuation.resume(connection.localDescription!!)
                        }
                        override fun onCreateFailure(reason: String?) {
                            continuation.resumeWithException(
                                RuntimeException("setLocalDescription failed: $reason"),
                            )
                        }
                        override fun onSetFailure(reason: String?) {
                            continuation.resumeWithException(
                                RuntimeException("setLocalDescription failed: $reason"),
                            )
                        }
                    },
                    sdp,
                )
            }, constraints)
            { reason ->
                continuation.resumeWithException(
                    RuntimeException("createOffer failed: $reason"),
                )
            }
        }
    }

    /**
     * Create an SDP answer for the specified device's PeerConnection.
     *
     * Typically called after receiving and setting a remote offer.
     *
     * @param deviceId  The device whose PeerConnection should create the answer.
     * @return The generated [SessionDescription] (answer).
     */
    suspend fun createAnswer(deviceId: String): SessionDescription {
        val connection = connections[deviceId]
            ?: throw IllegalStateException("No PeerConnection for device $deviceId")

        return suspendCancellableCoroutine { continuation ->
            val constraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "false"))
            }

            connection.createAnswer({ sdp ->
                connection.setLocalDescription(
                    object : org.webrtc.SdpObserver {
                        override fun onCreateSuccess(sdp: SessionDescription?) {}
                        override fun onSetSuccess() {
                            android.util.Log.d(TAG, "Local description set (answer) for $deviceId")
                            continuation.resume(connection.localDescription!!)
                        }
                        override fun onCreateFailure(reason: String?) {
                            continuation.resumeWithException(
                                RuntimeException("setLocalDescription failed: $reason"),
                            )
                        }
                        override fun onSetFailure(reason: String?) {
                            continuation.resumeWithException(
                                RuntimeException("setLocalDescription failed: $reason"),
                            )
                        }
                    },
                    sdp,
                )
            }, constraints)
            { reason ->
                continuation.resumeWithException(
                    RuntimeException("createAnswer failed: $reason"),
                )
            }
        }
    }

    /**
     * Set the remote SDP description on the specified device's PeerConnection.
     *
     * This is the last step in offer/answer exchange: after receiving the
     * remote peer's SDP via signaling, call this to complete negotiation.
     *
     * @param deviceId  The device whose PeerConnection receives the remote SDP.
     * @param sdp       The remote session description.
     */
    fun setRemoteDescription(deviceId: String, sdp: SessionDescription) {
        val connection = connections[deviceId]
            ?: throw IllegalStateException("No PeerConnection for device $deviceId")

        connection.setRemoteDescription(object : org.webrtc.SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription?) {}
            override fun onSetSuccess() {
                android.util.Log.d(TAG, "Remote description set for $deviceId")
            }
            override fun onCreateFailure(reason: String?) {
                android.util.Log.e(TAG, "setRemoteDescription failed for $deviceId: $reason")
            }
            override fun onSetFailure(reason: String?) {
                android.util.Log.e(TAG, "setRemoteDescription failed for $deviceId: $reason")
            }
        }, sdp)
    }

    /**
     * Add a remote ICE candidate to the specified device's PeerConnection.
     *
     * @param deviceId   The device whose PeerConnection receives the candidate.
     * @param candidate  The ICE candidate.
     */
    fun addIceCandidate(deviceId: String, candidate: IceCandidate) {
        val connection = connections[deviceId]
            ?: throw IllegalStateException("No PeerConnection for device $deviceId")

        connection.addIceCandidate(candidate)
        android.util.Log.d(
            TAG,
            "ICE candidate added for $deviceId: sdpMid=${candidate.sdpMid}, mLine=${candidate.sdpMLineIndex}",
        )
    }

    /**
     * Create a video track sourced from a [SurfaceViewRenderer].
     *
     * The SurfaceViewRenderer must already be initialized and rendering.
     * The resulting VideoTrack can be added to the PeerConnection for
     * screen-sharing to the remote peer.
     *
     * @param surfaceViewRenderer  Optional SurfaceViewRenderer. If null, returns null.
     * @return A [VideoTrack] or null if no surface renderer provided.
     */
    fun createVideoTrack(surfaceViewRenderer: SurfaceViewRenderer?): VideoTrack? {
        if (surfaceViewRenderer == null) {
            android.util.Log.w(TAG, "No SurfaceViewRenderer provided — skipping video track")
            return null
        }
        val f = resources.acquire()
        val videoSource = f.createVideoSource(false) // false = not screencast at source level
        val videoTrack = f.createVideoTrack("phonefarm-video-${System.currentTimeMillis()}", videoSource)
        android.util.Log.i(TAG, "Video track created: ${videoTrack.id()}")
        return videoTrack
    }

    /**
     * Create a [DataChannel] on the specified device's PeerConnection.
     *
     * Data channels provide low-latency, ordered or unordered message delivery
     * directly between peers (bypassing the server relay).
     *
     * @param deviceId  The device whose PeerConnection hosts the channel.
     * @param label     A unique label for this data channel (e.g., "control", "stats").
     * @return The created [DataChannel], or null if creation fails.
     */
    fun createDataChannel(deviceId: String, label: String): DataChannel? {
        val connection = connections[deviceId]
            ?: run {
                android.util.Log.e(TAG, "No PeerConnection for device $deviceId")
                return null
            }

        return try {
            val init = DataChannel.Init().apply {
                ordered = true
                // 100ms max retransmit for real-time control
                maxRetransmitTimeMs = 100
            }
            val channel = connection.createDataChannel(label, init)
            registerDataChannelObserver(label, channel)
            android.util.Log.i(TAG, "Data channel created: $label for $deviceId")
            channel
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to create data channel $label for $deviceId", e)
            null
        }
    }

    /**
     * Close the PeerConnection for a specific device and remove it from the pool.
     */
    fun closeConnection(deviceId: String) {
        val connection = connections.remove(deviceId) ?: return
        try {
            connection.close()
            android.util.Log.i(TAG, "PeerConnection closed for $deviceId")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Error closing PeerConnection for $deviceId", e)
        }
        updateStateMap(deviceId, null, null)
    }

    /**
     * Close all PeerConnections and release the factory.
     *
     * Should be called during app shutdown or when WebRTC is no longer needed.
     */
    fun closeAll() {
        android.util.Log.i(TAG, "Closing all PeerConnections (${connections.size} active)")
        connections.keys.toList().forEach { deviceId ->
            closeConnection(deviceId)
        }
        resources.release()
        scope.cancel()
    }

    /**
     * Check whether a PeerConnection exists and is in a connected state for the given device.
     */
    fun isConnected(deviceId: String): Boolean {
        val connection = connections[deviceId] ?: return false
        val state = connection.connectionState()
        return state == PeerConnection.PeerConnectionState.CONNECTED
    }

    /**
     * Get the number of active PeerConnections.
     */
    fun connectionCount(): Int = connections.size

    /**
     * Get an existing PeerConnection for a device, or null.
     */
    fun getConnection(deviceId: String): PeerConnection? = connections[deviceId]

    // ---- internal helpers ----

    /**
     * Create the PeerConnection.Observer that bridges WebRTC events into
     * our Kotlin coroutine/state-flow world.
     */
    private fun createPeerConnectionObserver(deviceId: String): PeerConnection.Observer {
        return object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate?) {
                if (candidate == null) return
                signalingSender.sendIceCandidate(
                    deviceId = myDeviceId,
                    targetId = deviceId,
                    candidate = candidate.sdp,
                    sdpMid = candidate.sdpMid,
                    sdpMLineIndex = candidate.sdpMLineIndex,
                )
                android.util.Log.d(TAG, "ICE candidate gathered for $deviceId: ${candidate.sdpMid}")
            }

            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {
                android.util.Log.d(TAG, "ICE candidates removed for $deviceId: ${candidates?.size ?: 0}")
            }

            override fun onSignalingChange(state: PeerConnection.SignalingState?) {
                android.util.Log.d(TAG, "Signaling state: $state for $deviceId")
            }

            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                android.util.Log.d(TAG, "ICE connection state: $state for $deviceId")
                if (state != null) {
                    updateIceState(deviceId, state)
                }
            }

            override fun onIceConnectionReceivingChange(receiving: Boolean) {
                android.util.Log.d(TAG, "ICE receiving: $receiving for $deviceId")
            }

            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
                android.util.Log.d(TAG, "ICE gathering state: $state for $deviceId")
            }

            override fun onConnectionChange(state: PeerConnection.PeerConnectionState?) {
                android.util.Log.d(TAG, "Connection state: $state for $deviceId")
                if (state != null) {
                    updateConnectionState(deviceId, state)
                }
            }

            override fun onAddStream(stream: MediaStream?) {
                android.util.Log.i(TAG, "Remote stream added for $deviceId")
            }

            override fun onRemoveStream(stream: MediaStream?) {
                android.util.Log.i(TAG, "Remote stream removed for $deviceId")
            }

            override fun onDataChannel(channel: DataChannel?) {
                if (channel != null) {
                    android.util.Log.i(TAG, "Remote data channel received: ${channel.label()} for $deviceId")
                    registerDataChannelObserver(channel.label(), channel)
                }
            }

            override fun onRenegotiationNeeded() {
                android.util.Log.d(TAG, "Renegotiation needed for $deviceId")
            }

            override fun onAddTrack(
                receiver: org.webrtc.RtpReceiver?,
                streams: Array<out MediaStream>?,
            ) {
                android.util.Log.i(TAG, "Remote track added for $deviceId")
            }
        }
    }

    /**
     * Set H.264 as the preferred video codec on the PeerConnection transceivers.
     */
    private fun setH264CodecPreference(connection: PeerConnection) {
        try {
            for (transceiver in connection.transceivers) {
                if (transceiver.mediaType == org.webrtc.MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO) {
                    val sender = transceiver.sender
                    val params = sender.parameters
                    if (params != null) {
                        // Reorder codecs: H.264 first
                        val reordered = params.codecs.sortedByDescending { codec ->
                            when {
                                codec.name.equals("H264", ignoreCase = true) -> 2
                                codec.name.startsWith("H264", ignoreCase = true) -> 1
                                else -> 0
                            }
                        }
                        val newParams = RtpParameters(
                            params.transactionId,
                            params.degradationPreference,
                            reordered,
                            params.encodings,
                            params.headerExtensions,
                        )
                        sender.setParameters(newParams)
                        android.util.Log.d(TAG, "H.264 codec preferred for transceiver")
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.w(TAG, "Could not set H.264 codec preference", e)
        }
    }

    /**
     * Register observer on a data channel to log messages and state changes.
     */
    private fun registerDataChannelObserver(label: String, channel: DataChannel) {
        channel.registerObserver(object : DataChannel.Observer {
            override fun onBufferedAmountChange(previousAmount: Long) {
                // Threshold-based flow control
                if (channel.bufferedAmount() > 256 * 1024) {
                    android.util.Log.w(TAG, "Data channel $label buffered > 256KB")
                }
            }

            override fun onStateChange() {
                android.util.Log.d(TAG, "Data channel $label state: ${channel.state()}")
            }

            override fun onMessage(buffer: DataChannel.Buffer) {
                val data = ByteArray(buffer.data.remaining())
                buffer.data.get(data)
                android.util.Log.d(TAG, "Data channel $label received ${data.size} bytes")
            }
        })
    }

    /**
     * Update the connection state map atomically.
     */
    private fun updateConnectionState(
        deviceId: String,
        state: PeerConnection.PeerConnectionState,
    ) {
        _connectionStates.value = _connectionStates.value.toMutableMap().apply {
            put(deviceId, state)
        }
    }

    /**
     * Update the ICE connection state map atomically.
     */
    private fun updateIceState(
        deviceId: String,
        state: PeerConnection.IceConnectionState,
    ) {
        _iceConnectionStates.value = _iceConnectionStates.value.toMutableMap().apply {
            put(deviceId, state)
        }
    }

    /**
     * Update state maps: remove entry if state is null, otherwise set.
     */
    private fun updateStateMap(
        deviceId: String,
        connState: PeerConnection.PeerConnectionState?,
        iceState: PeerConnection.IceConnectionState?,
    ) {
        if (connState != null) updateConnectionState(deviceId, connState)
        else _connectionStates.value = _connectionStates.value.toMutableMap().apply { remove(deviceId) }

        if (iceState != null) updateIceState(deviceId, iceState)
        else _iceConnectionStates.value = _iceConnectionStates.value.toMutableMap().apply { remove(deviceId) }
    }
}
