package com.phonefarm.client.network

import com.phonefarm.client.BuildConfig
import com.phonefarm.client.data.repository.DeviceRepository
import com.phonefarm.client.network.codec.ProtobufCodec
import com.phonefarm.client.network.reconnect.DisconnectReason
import com.phonefarm.client.network.reconnect.ReconnectManager
import com.phonefarm.client.network.security.TrafficObfuscator
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.WebSocket
import javax.inject.Inject
import javax.inject.Singleton

/**
 * OkHttp-based WebSocket client with auto-reconnect, heartbeat, and typed message I/O.
 *
 * Lifecycle:
 *   connect(url, token) → authenticate → heartbeats begin → messages flow
 *   disconnect() → close frame → resources released
 *
 * Heartbeat: sends ping every 5 seconds; expects pong within 15 seconds or triggers reconnect.
 *
 * Connection state is exposed as a [StateFlow] and inbound messages as a [Flow].
 */
@Singleton
class WebSocketClient @Inject constructor(
    private val okHttpClient: OkHttpClient,
    private val reconnectManager: ReconnectManager,
    private val messageCodec: ProtobufCodec,
    private val deviceRepository: DeviceRepository,
    private val trafficObfuscator: TrafficObfuscator,
) {

    // ---- state ----

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _messages = MutableSharedFlow<WebSocketMessage>(
        replay = 0,
        extraBufferCapacity = 256,
    )
    val messages: Flow<WebSocketMessage> = _messages.asSharedFlow()

    private var webSocket: WebSocket? = null
    private var heartbeatJob: Job? = null
    private var pingSeq: Int = 0

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private var currentUrl: String = ""
    private var currentToken: String = ""

    // ---- JSON codec ----

    private val json = Json {
        ignoreUnknownKeys = true
        classDiscriminator = "type"
        encodeDefaults = true
    }

    // ---- heartbeat / pong tracking ----

    private var lastPongTime: Long = 0L
    private val pongTimeoutMs: Long = 15_000L

    // ---- connect / disconnect ----

    /**
     * Connect to the WebSocket server at [url] with the given auth [token].
     * On open → authenticate → heartbeat. On failure → delegate to ReconnectManager.
     */
    fun connect(url: String, token: String) {
        currentUrl = url
        currentToken = token
        _connectionState.value = ConnectionState.CONNECTING

        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer $token")
            .build()

        webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {

            override fun onOpen(webSocket: WebSocket, response: Response) {
                scope.launch {
                    // Resolve device identity from DeviceRepository and BuildConfig.
                    val info = deviceRepository.collectDeviceInfo()
                    val authMsg = WebSocketMessage.Auth(
                        token = currentToken,
                        deviceId = info.deviceId,
                        clientVersion = BuildConfig.VERSION_NAME,
                    )
                    send(authMsg)
                    _connectionState.value = ConnectionState.AUTHENTICATED
                    reconnectManager.onConnected()
                    startHeartbeat()
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val message = json.decodeFromString(WebSocketMessage.serializer(), text)
                    // Any inbound message resets the pong timer — the connection is alive.
                    lastPongTime = System.currentTimeMillis()
                    _messages.tryEmit(message)
                } catch (e: Exception) {
                    // Malformed message — log and ignore to avoid crashing the listener.
                    android.util.Log.w("WebSocketClient", "Failed to deserialize message: ${e.message}")
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
                _connectionState.value = ConnectionState.DISCONNECTED
                stopHeartbeat()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                _connectionState.value = ConnectionState.DISCONNECTED
                stopHeartbeat()
                reconnectManager.onDisconnected(DisconnectReason.SERVER_CLOSE)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _connectionState.value = ConnectionState.DISCONNECTED
                stopHeartbeat()
                reconnectManager.onDisconnected(DisconnectReason.NETWORK_ERROR)
            }
        })
    }

    /**
     * Gracefully disconnect the WebSocket. Sends a close frame, cancels heartbeat,
     * releases resources, and resets the ReconnectManager.
     */
    fun disconnect() {
        reconnectManager.reset()
        stopHeartbeat()
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        _connectionState.value = ConnectionState.DISCONNECTED
    }

    /**
     * Send a typed WebSocketMessage as JSON text to the server.
     */
    fun send(message: WebSocketMessage) {
        val jsonText = json.encodeToString(WebSocketMessage.serializer(), message)
        webSocket?.send(jsonText)
    }

    /**
     * Send a binary message (used for screenshots, video frames, large payloads).
     * Raw ByteArrays are sent directly; VideoFrame/ControlMessage use ProtobufCodec.
     */
    fun sendBinary(data: ByteArray) {
        webSocket?.send(okio.ByteString.of(*data))
    }

    /**
     * Send a VideoFrame as a protobuf-encoded binary message.
     */
    fun sendVideoFrame(frame: com.phonefarm.client.network.codec.VideoFrame) {
        val encoded = messageCodec.encodeVideoFrame(frame)
        sendBinary(encoded)
    }

    /**
     * Send a binary message with a 1-byte type prefix for A/V frame routing.
     * @param data the protobuf-encoded frame
     * @param isVideo true for video frame (0x02 prefix), false for audio frame (0x05 prefix)
     */
    fun sendBinaryFrame(data: ByteArray, isVideo: Boolean): Boolean {
        if (!isConnected()) return false
        val header = if (isVideo) 0x02.toByte() else 0x05.toByte()
        val framed = ByteArray(1 + data.size)
        framed[0] = header
        System.arraycopy(data, 0, framed, 1, data.size)
        return try {
            sendBinary(framed)
            true
        } catch (_: Exception) {
            false
        }
    }

    // ---- heartbeat ----

    /**
     * Start the heartbeat coroutine.
     * Every ~5 seconds (jittered): send a ping with an incrementing sequence number.
     * If no message received from server within 15 seconds, trigger reconnect.
     */
    private fun startHeartbeat() {
        stopHeartbeat()
        lastPongTime = System.currentTimeMillis() // Reset pong timer on start.
        heartbeatJob = scope.launch {
            while (isActive) {
                val intervalMs = trafficObfuscator.jitterInterval(5_000L)
                delay(intervalMs)

                // Check if the connection has gone silent.
                val timeSinceLastPong = System.currentTimeMillis() - lastPongTime
                if (timeSinceLastPong > pongTimeoutMs) {
                    android.util.Log.w(
                        "WebSocketClient",
                        "Heartbeat timeout: no response for ${timeSinceLastPong}ms",
                    )
                    _connectionState.value = ConnectionState.DISCONNECTED
                    reconnectManager.onDisconnected(DisconnectReason.HEARTBEAT_TIMEOUT)
                    cancel()
                    return@launch
                }

                pingSeq++
                // Generate random padding to obscure heartbeat message size.
                val paddingBytes = trafficObfuscator.generateHeartbeatPadding()
                val heartbeat = WebSocketMessage.Heartbeat(
                    timestamp = System.currentTimeMillis(),
                    seq = pingSeq,
                )
                // Send the heartbeat JSON. The padding bytes are sent as a separate
                // binary frame to disrupt traffic analysis of message lengths.
                send(heartbeat)
                if (paddingBytes.isNotEmpty()) {
                    webSocket?.send(okio.ByteString.of(*paddingBytes))
                }
            }
        }
    }

    /**
     * Cancel the heartbeat coroutine and reset tracking state.
     */
    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
        pingSeq = 0
    }

    /**
     * Check whether the WebSocket is currently connected and authenticated.
     */
    fun isConnected(): Boolean {
        return _connectionState.value == ConnectionState.CONNECTED ||
            _connectionState.value == ConnectionState.AUTHENTICATED
    }

    /**
     * Handle an inbound message that has already been parsed into [message].
     * Used by the onMessage callback; also invokable for testing.
     */
    internal fun onMessageParsed(message: WebSocketMessage) {
        lastPongTime = System.currentTimeMillis()
        _messages.tryEmit(message)
    }
}
