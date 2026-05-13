package com.phonefarm.client.webrtc

import com.phonefarm.client.network.WebSocketClient
import com.phonefarm.client.network.WebSocketMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import javax.inject.Inject
import javax.inject.Singleton

/**
 * WebRTC signaling protocol sender over the existing PhoneFarm WebSocket channel.
 *
 * Encapsulates all signaling message transmission: offers, answers, ICE candidates,
 * and connection lifecycle requests. Uses the existing [WebSocketClient] which
 * provides authenticated, auto-reconnecting transport.
 *
 * Every method fire-and-forget sends via the WebSocket; the server-side
 * [signaling-relay.ts] routes messages to the correct target device.
 */
@Singleton
class SignalingSender @Inject constructor(
    private val webSocketClient: WebSocketClient,
) {

    companion object {
        private const val TAG = "SignalingSender"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /**
     * Send a WebRTC SDP offer from this device to a target peer.
     *
     * @param deviceId  This device's own ID (the "from" field).
     * @param targetId  The remote device receiving the offer.
     * @param sdp       The SDP offer string.
     */
    fun sendOffer(deviceId: String, targetId: String, sdp: String) {
        try {
            val msg = WebSocketMessage.WebrtcOffer(
                from = deviceId,
                to = targetId,
                sdp = sdp,
            )
            webSocketClient.send(msg)
            android.util.Log.d(TAG, "Offer sent: $deviceId -> $targetId")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to send offer to $targetId", e)
        }
    }

    /**
     * Send a WebRTC SDP answer from this device to a target peer.
     *
     * @param deviceId  This device's own ID (the "from" field).
     * @param targetId  The remote device that sent the offer.
     * @param sdp       The SDP answer string.
     */
    fun sendAnswer(deviceId: String, targetId: String, sdp: String) {
        try {
            val msg = WebSocketMessage.WebrtcAnswer(
                from = deviceId,
                to = targetId,
                sdp = sdp,
            )
            webSocketClient.send(msg)
            android.util.Log.d(TAG, "Answer sent: $deviceId -> $targetId")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to send answer to $targetId", e)
        }
    }

    /**
     * Send a single ICE candidate to a target peer.
     *
     * @param deviceId       This device's own ID.
     * @param targetId       The remote peer device ID.
     * @param candidate      The ICE candidate string (candidate line).
     * @param sdpMid         The media stream identification (null if not applicable).
     * @param sdpMLineIndex  The media line index (0 if not applicable).
     */
    fun sendIceCandidate(
        deviceId: String,
        targetId: String,
        candidate: String,
        sdpMid: String?,
        sdpMLineIndex: Int,
    ) {
        try {
            val msg = WebSocketMessage.WebrtcIceCandidate(
                from = deviceId,
                to = targetId,
                candidate = candidate,
                sdpMid = sdpMid,
                sdpMLineIndex = sdpMLineIndex,
            )
            webSocketClient.send(msg)
            android.util.Log.d(
                TAG,
                "ICE candidate sent: $deviceId -> $targetId (mid=$sdpMid, mLine=$sdpMLineIndex)",
            )
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to send ICE candidate to $targetId", e)
        }
    }

    /**
     * Initiate a P2P WebRTC connection request to another device.
     *
     * The server relays this to [targetId]. The remote device then decides
     * whether to accept or reject the connection.
     *
     * @param deviceId  This device's own ID (the caller).
     * @param targetId  The device to connect to.
     */
    fun requestConnection(deviceId: String, targetId: String) {
        try {
            val msg = WebSocketMessage.WebrtcRequestConnection(
                from = deviceId,
                to = targetId,
            )
            webSocketClient.send(msg)
            android.util.Log.d(TAG, "Connection request: $deviceId -> $targetId")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to send connection request to $targetId", e)
        }
    }

    /**
     * Accept an incoming WebRTC connection request.
     *
     * After accepting, the accepting peer should create and send an answer
     * via [sendAnswer].
     *
     * @param deviceId  This device's own ID (the accepter).
     * @param fromId    The device that sent the connection request.
     */
    fun acceptConnection(deviceId: String, fromId: String) {
        try {
            val msg = WebSocketMessage.WebrtcAcceptConnection(
                from = deviceId,
                to = fromId,
            )
            webSocketClient.send(msg)
            android.util.Log.d(TAG, "Connection accepted: $deviceId <- $fromId")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to send accept to $fromId", e)
        }
    }

    /**
     * Reject an incoming WebRTC connection request.
     *
     * @param deviceId  This device's own ID (the rejecter).
     * @param fromId    The device that sent the connection request.
     * @param reason    Optional human-readable reason for rejection.
     */
    fun rejectConnection(deviceId: String, fromId: String, reason: String = "") {
        try {
            val msg = WebSocketMessage.WebrtcRejectConnection(
                from = deviceId,
                to = fromId,
                reason = reason,
            )
            webSocketClient.send(msg)
            android.util.Log.d(TAG, "Connection rejected: $deviceId <- $fromId (reason=$reason)")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to send reject to $fromId", e)
        }
    }
}
