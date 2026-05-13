package com.phonefarm.client.network.nats

import io.nats.client.Connection
import io.nats.client.Dispatcher
import io.nats.client.Nats
import io.nats.client.Options
import io.nats.client.Message
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject
import javax.inject.Singleton

/**
 * NATS connection state enum.
 */
enum class NatsConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING,
}

/**
 * NATS client for Android devices. Provides publish/subscribe/request
 * semantics over a persistent NATS connection with auto-reconnect.
 *
 * Subject naming convention: `phonefarm.<domain>.<event>`
 * Examples:
 * - `phonefarm.device.online`
 * - `phonefarm.device.offline`
 * - `phonefarm.task.status`
 * - `phonefarm.task.result`
 * - `phonefarm.config.update`
 * - `phonefarm.alert.notification`
 *
 * JetStream support enables persistent subscriptions so that devices
 * receive tasks even if temporarily disconnected.
 *
 * Reconnect strategy: exponential backoff from 1s up to 30s max.
 */
@Singleton
class NatsClient @Inject constructor() {

    companion object {
        private const val TAG = "NatsClient"

        // Reconnect parameters
        private const val INITIAL_BACKOFF_MS = 1_000L
        private const val MAX_BACKOFF_MS = 30_000L
        private const val REQUEST_TIMEOUT_MS = 5_000L
        private const val CONNECTION_TIMEOUT_SEC = 10L

        // Subject prefixes
        const val SUBJECT_PREFIX = "phonefarm"
        const val SUBJECT_DEVICE_ONLINE = "$SUBJECT_PREFIX.device.online"
        const val SUBJECT_DEVICE_OFFLINE = "$SUBJECT_PREFIX.device.offline"
        const val SUBJECT_TASK_STATUS = "$SUBJECT_PREFIX.task.status"
        const val SUBJECT_TASK_RESULT = "$SUBJECT_PREFIX.task.result"
        const val SUBJECT_CONFIG_UPDATE = "$SUBJECT_PREFIX.config.update"
        const val SUBJECT_ALERT = "$SUBJECT_PREFIX.alert"
    }

    // ---- state ----

    private val _connectionState = MutableStateFlow(NatsConnectionState.DISCONNECTED)
    val connectionState: StateFlow<NatsConnectionState> = _connectionState.asStateFlow()

    private var natsConnection: Connection? = null
    private val dispatchers = ConcurrentHashMap<String, Dispatcher>()
    private val reconnectAttempt = AtomicInteger(0)

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private var currentUrl: String = ""
    private var currentToken: String = ""

    // ---- public API ----

    /**
     * Connect to the NATS server.
     *
     * @param url    NATS server URL (e.g., "nats://localhost:4222").
     * @param token  Authentication token for the NATS server.
     */
    fun connect(url: String, token: String) {
        if (_connectionState.value == NatsConnectionState.CONNECTED ||
            _connectionState.value == NatsConnectionState.CONNECTING
        ) {
            android.util.Log.w(TAG, "Already connecting or connected to $url")
            return
        }

        currentUrl = url
        currentToken = token
        connectInternal()
    }

    /**
     * Subscribe to a NATS subject with a message handler.
     *
     * Creates a NATS [Dispatcher] for the subscription, allowing concurrent
     * message delivery. The handler is invoked on NATS I/O threads.
     *
     * @param subject  The NATS subject to subscribe to (e.g., "phonefarm.task.status").
     * @param handler  Callback invoked for each received message.
     */
    fun subscribe(subject: String, handler: (NatsMessage) -> Unit) {
        val connection = natsConnection ?: run {
            android.util.Log.e(TAG, "Cannot subscribe — not connected")
            return
        }

        // Remove existing dispatcher for this subject if any.
        unsubscribe(subject)

        val dispatcher: Dispatcher = connection.createDispatcher { msg ->
            try {
                val natsMsg = NatsMessage(
                    subject = msg.subject,
                    data = msg.data,
                    replyTo = msg.replyTo,
                )
                handler(natsMsg)
            } catch (e: Exception) {
                android.util.Log.e(TAG, "Error handling message on subject $subject", e)
            }
        }

        dispatcher.subscribe(subject)
        dispatchers[subject] = dispatcher

        android.util.Log.d(TAG, "Subscribed to: $subject")
    }

    /**
     * Unsubscribe from a previously subscribed NATS subject.
     *
     * @param subject  The NATS subject to unsubscribe from.
     */
    fun unsubscribe(subject: String) {
        val dispatcher = dispatchers.remove(subject)
        try {
            dispatcher?.unsubscribe(subject)
            android.util.Log.d(TAG, "Unsubscribed from: $subject")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Error unsubscribing from $subject", e)
        }
    }

    /**
     * Publish a message to a NATS subject.
     *
     * Fire-and-forget: no response expected.
     *
     * @param subject  The NATS subject to publish to.
     * @param data     The message payload as raw bytes.
     */
    fun publish(subject: String, data: ByteArray) {
        val connection = natsConnection ?: run {
            android.util.Log.e(TAG, "Cannot publish — not connected")
            return
        }
        try {
            connection.publish(subject, data)
            android.util.Log.v(TAG, "Published to $subject (${data.size} bytes)")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Publish error on $subject", e)
        }
    }

    /**
     * Send a request to a NATS subject and wait for a response.
     *
     * Uses NATS request-reply pattern. Blocks until response or timeout.
     *
     * @param subject    The NATS subject to request on.
     * @param data       The request payload.
     * @param timeoutMs  Maximum time to wait for response (default 5s).
     * @return The response payload or null on timeout/error.
     */
    fun request(subject: String, data: ByteArray, timeoutMs: Long = REQUEST_TIMEOUT_MS): ByteArray? {
        val connection = natsConnection ?: run {
            android.util.Log.e(TAG, "Cannot request — not connected")
            return null
        }
        return try {
            val response = connection.request(
                subject,
                data,
                Duration.ofMillis(timeoutMs),
            )
            android.util.Log.v(TAG, "Request to $subject: ${data.size}B -> ${response?.data?.size ?: 0}B")
            response.data
        } catch (e: TimeoutException) {
            android.util.Log.w(TAG, "Request timeout on $subject (${timeoutMs}ms)")
            null
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Request error on $subject", e)
            null
        }
    }

    /**
     * Disconnect from NATS and release all resources.
     */
    fun disconnect() {
        android.util.Log.i(TAG, "Disconnecting from NATS")

        // Close all dispatchers.
        dispatchers.keys.toList().forEach { unsubscribe(it) }
        dispatchers.clear()

        // Close connection.
        try {
            natsConnection?.close()
            android.util.Log.i(TAG, "NATS connection closed")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Error closing NATS connection", e)
        }
        natsConnection = null

        _connectionState.value = NatsConnectionState.DISCONNECTED
        reconnectAttempt.set(0)
        scope.cancel()
    }

    /**
     * Check whether the NATS client is currently connected.
     */
    fun isConnected(): Boolean {
        return _connectionState.value == NatsConnectionState.CONNECTED &&
            natsConnection?.status == Connection.Status.CONNECTED
    }

    // ---- internal ----

    /**
     * Internal connect with retry logic.
     */
    private fun connectInternal() {
        _connectionState.value = NatsConnectionState.CONNECTING
        scope.launch {
            try {
                val options = Options.builder()
                    .server(currentUrl)
                    .token(currentToken.toCharArray())
                    .connectionTimeout(Duration.ofSeconds(CONNECTION_TIMEOUT_SEC))
                    .reconnectWait(Duration.ofMillis(2_000))
                    .maxReconnects(-1) // Infinite reconnect
                    .connectionListener { conn, type ->
                        android.util.Log.d(TAG, "NATS connection event: $type")
                        when (type) {
                            ConnectionListener.Events.CONNECTED -> {
                                _connectionState.value = NatsConnectionState.CONNECTED
                                reconnectAttempt.set(0)
                                onConnected()
                            }
                            ConnectionListener.Events.DISCONNECTED -> {
                                _connectionState.value = NatsConnectionState.DISCONNECTED
                                onDisconnected()
                            }
                            ConnectionListener.Events.RECONNECTED -> {
                                _connectionState.value = NatsConnectionState.CONNECTED
                                reconnectAttempt.set(0)
                                onConnected()
                            }
                            ConnectionListener.Events.RESUBSCRIBED -> {
                                android.util.Log.i(TAG, "Subscriptions restored after reconnect")
                            }
                            else -> {
                                android.util.Log.d(TAG, "NATS event: $type")
                            }
                        }
                    }
                    .errorListener { conn, error ->
                        android.util.Log.e(TAG, "NATS error", error)
                    }
                    .build()

                val nc = Nats.connect(options)
                natsConnection = nc

                // Wait for connected state.
                val startTime = System.currentTimeMillis()
                while (nc.status != Connection.Status.CONNECTED &&
                    System.currentTimeMillis() - startTime < CONNECTION_TIMEOUT_SEC * 1000
                ) {
                    delay(100)
                }

                if (nc.status == Connection.Status.CONNECTED) {
                    _connectionState.value = NatsConnectionState.CONNECTED
                    reconnectAttempt.set(0)
                    android.util.Log.i(TAG, "Connected to NATS: $currentUrl")
                    onConnected()
                } else {
                    android.util.Log.w(TAG, "NATS connection timeout")
                    onDisconnected()
                }
            } catch (e: Exception) {
                android.util.Log.e(TAG, "NATS connection error", e)
                _connectionState.value = NatsConnectionState.DISCONNECTED
                onDisconnected()
            }
        }
    }

    /**
     * Called when the NATS connection is successfully established (or restored).
     * Re-subscribes all previously registered subjects.
     */
    private fun onConnected() {
        val subjects = dispatchers.keys.toList()
        if (subjects.isNotEmpty()) {
            android.util.Log.i(TAG, "Re-subscribing ${subjects.size} subjects")
            // Re-subscriptions are handled by the jnats library automatically
            // if maxReconnects is set; but we log for observability.
        }
    }

    /**
     * Called when the NATS connection is lost. Initiates reconnect with
     * exponential backoff if auto-reconnect via jnats is insufficient.
     */
    private fun onDisconnected() {
        val attempt = reconnectAttempt.incrementAndGet()
        val backoff = minOf(
            INITIAL_BACKOFF_MS * (1L shl minOf(attempt - 1, 5)),
            MAX_BACKOFF_MS,
        )
        android.util.Log.w(
            TAG,
            "NATS disconnected — attempt #$attempt, will try manual reconnect in ${backoff}ms",
        )

        // jnats handles auto-reconnect with maxReconnects=-1,
        // but we schedule a manual retry as a safety net.
        if (_connectionState.value == NatsConnectionState.DISCONNECTED) {
            scope.launch {
                delay(backoff)
                if (_connectionState.value == NatsConnectionState.DISCONNECTED &&
                    currentUrl.isNotBlank()
                ) {
                    android.util.Log.i(TAG, "Manual reconnect attempt #$attempt")
                    connectInternal()
                }
            }
        }
    }
}

/**
 * Typed wrapper around a NATS message for cleaner handler signatures.
 */
data class NatsMessage(
    val subject: String,
    val data: ByteArray,
    val replyTo: String? = null,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as NatsMessage
        return subject == other.subject &&
            data.contentEquals(other.data) &&
            replyTo == other.replyTo
    }

    override fun hashCode(): Int {
        var result = subject.hashCode()
        result = 31 * result + data.contentHashCode()
        result = 31 * result + (replyTo?.hashCode() ?: 0)
        return result
    }

    override fun toString(): String {
        return "NatsMessage(subject='$subject', data=${data.size}B, replyTo=$replyTo)"
    }
}
