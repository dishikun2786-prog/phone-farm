package com.phonefarm.client.network.reconnect

import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlin.math.min
import kotlin.math.pow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages WebSocket reconnection with differentiated strategies for 8 failure scenarios.
 *
 * Implements an exponential backoff state machine:
 *   DISCONNECTED → CONNECTING → (success) → CONNECTED
 *   CONNECTING  → (fail)     → BACKOFF_WAIT → CONNECTING → ...
 *
 * Base delay: 1s; Max delay: 60s; Multiplier: 2x per retry.
 * Jitter: ±25% of computed delay to avoid thundering herd.
 *
 * Failure scenarios and their backoff profiles:
 *   AUTH_FAILED       → no reconnect (fatal).
 *   NETWORK_ERROR     → standard exponential backoff, capped at 60s.
 *   SERVER_CLOSE      → backoff starting at 5s.
 *   TIMEOUT           → backoff starting at 2s.
 *   HEARTBEAT_TIMEOUT → backoff starting at 1s (most aggressive).
 *   SSL_ERROR         → backoff starting at 10s (possible cert rotation).
 *   DNS_RESOLVE_FAIL  → backoff starting at 30s (DNS propagation delay).
 *   UNKNOWN           → standard exponential backoff.
 */
@Singleton
class ReconnectManager @Inject constructor() {

    // ---- state ----

    private val _reconnectState = MutableStateFlow<ReconnectState>(ReconnectState.DISCONNECTED)
    val reconnectState: StateFlow<ReconnectState> = _reconnectState.asStateFlow()

    private val _shouldReconnect = MutableSharedFlow<Unit>(replay = 0, extraBufferCapacity = 1)
    val shouldReconnect: Flow<Unit> = _shouldReconnect.asSharedFlow()

    private var retryCount: Int = 0
    private val baseDelayMs: Long = 1_000L
    private val maxDelayMs: Long = 60_000L
    private val defaultStartDelayMs: Long = 1_000L
    private val jitterFactor: Double = 0.25

    private var currentReason: DisconnectReason = DisconnectReason.UNKNOWN

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /** Handle to the currently scheduled reconnect delay coroutine. */
    private var scheduledReconnectJob: Job? = null

    // ---- public API ----

    /**
     * Called when the WebSocket disconnects.
     * Determines the appropriate backoff strategy based on [reason],
     * computes the next delay with jitter, and schedules [shouldReconnect].
     *
     * If reason is AUTH_FAILED, no reconnection is attempted.
     */
    fun onDisconnected(reason: DisconnectReason) {
        // Cancel any already-pending reconnect schedule.
        scheduledReconnectJob?.cancel()

        currentReason = reason
        retryCount++

        if (reason == DisconnectReason.AUTH_FAILED) {
            _reconnectState.value = ReconnectState.FATAL
            Log.w("ReconnectManager", "AUTH_FAILED — reconnection disabled permanently")
            return
        }

        val startDelay = when (reason) {
            DisconnectReason.AUTH_FAILED -> return // handled above
            DisconnectReason.NETWORK_ERROR -> defaultStartDelayMs
            DisconnectReason.SERVER_CLOSE -> 5_000L
            DisconnectReason.TIMEOUT -> 2_000L
            DisconnectReason.HEARTBEAT_TIMEOUT -> defaultStartDelayMs
            DisconnectReason.SSL_ERROR -> 10_000L
            DisconnectReason.DNS_RESOLVE_FAIL -> 30_000L
            DisconnectReason.UNKNOWN -> defaultStartDelayMs
        }

        val computedDelay = computeBackoff(startDelayMs = startDelay)
        _reconnectState.value = ReconnectState.BACKOFF_WAIT(computedDelay)

        Log.d(
            "ReconnectManager",
            "Scheduling reconnect in ${computedDelay}ms (reason=$reason, retry=$retryCount)",
        )

        // Schedule a reconnect attempt after the computed backoff delay.
        scheduledReconnectJob = scope.launch {
            delay(computedDelay)
            _reconnectState.value = ReconnectState.CONNECTING
            _shouldReconnect.emit(Unit)
        }
    }

    /**
     * Called when network connectivity is restored.
     * Cancels any pending backoff wait and immediately triggers a reconnection.
     */
    fun onNetworkRestored() {
        scheduledReconnectJob?.cancel()
        retryCount = 0
        _reconnectState.value = ReconnectState.CONNECTING
        _shouldReconnect.tryEmit(Unit)
    }

    /**
     * Called on successful connection/authentication.
     * Cancels any pending reconnect schedule and resets the backoff counter.
     */
    fun onConnected() {
        scheduledReconnectJob?.cancel()
        retryCount = 0
        _reconnectState.value = ReconnectState.CONNECTED
    }

    /**
     * Reset all state (called on manual disconnect, not automatic reconnect).
     * Cancels any pending reconnect schedule.
     */
    fun reset() {
        scheduledReconnectJob?.cancel()
        retryCount = 0
        currentReason = DisconnectReason.UNKNOWN
        _reconnectState.value = ReconnectState.DISCONNECTED
    }

    // ---- backoff computation ----

    /**
     * Compute exponential backoff delay with jitter.
     *
     *   delay = min(maxDelay, startDelay * 2^(retryCount-1))
     *   jitter = delay * rand(-jitterFactor, +jitterFactor)
     *   final = (delay + jitter).coerceIn(0, maxDelay)
     */
    private fun computeBackoff(startDelayMs: Long): Long {
        val exponential = (startDelayMs * 2.0.pow((retryCount - 1).toDouble())).toLong()
        val capped = min(exponential, maxDelayMs)
        val jitterAmount = (capped * jitterFactor * (Math.random() * 2 - 1)).toLong()
        return (capped + jitterAmount).coerceIn(0, maxDelayMs)
    }

    /** Cancel all pending work and release resources. */
    fun destroy() {
        scheduledReconnectJob?.cancel()
        scheduledReconnectJob = null
        scope.cancel()
        _reconnectState.value = ReconnectState.FATAL
    }
}

/**
 * Reason codes for WebSocket disconnection, each mapped to a specific backoff strategy.
 */
enum class DisconnectReason {
    AUTH_FAILED,
    NETWORK_ERROR,
    SERVER_CLOSE,
    TIMEOUT,
    HEARTBEAT_TIMEOUT,
    SSL_ERROR,
    DNS_RESOLVE_FAIL,
    UNKNOWN,
}

/**
 * Reconnection state machine states.
 */
sealed class ReconnectState {
    data object DISCONNECTED : ReconnectState()
    data object CONNECTING : ReconnectState()
    data object CONNECTED : ReconnectState()
    data class BACKOFF_WAIT(val delayMs: Long) : ReconnectState()
    data object FATAL : ReconnectState()
}
