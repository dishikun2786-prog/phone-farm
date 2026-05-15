package com.phonefarm.client.scrcpy

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton

/**
 * ACK-based backpressure controller for video frame transmission.
 *
 * Limits outstanding (unacknowledged) frames to prevent buffer bloat
 * on the network path. When the limit is exceeded, non-key frames are
 * dropped until the server acknowledges enough frames to resume.
 *
 * Rules:
 * - MAX_UNACKED = 3 — at most 3 frames in flight
 * - Keyframes (IDR) are always allowed (needed for decoder sync)
 * - Non-key frames are dropped when at capacity
 * - Frames unacked for > 5000ms are considered lost and cleaned up
 */
@Singleton
class VideoFrameController @Inject constructor() {

    companion object {
        const val MAX_UNACKED = 3
        private const val ACK_TIMEOUT_MS = 5_000L
    }

    private val nextSeq = AtomicLong(0)
    private val lastAckedSeq = AtomicLong(-1)
    private val unackedFrames = LinkedHashMap<Long, Long>() // seq → sendTimeMs

    private val _pendingCount = MutableStateFlow(0)
    val pendingCount: StateFlow<Int> = _pendingCount.asStateFlow()

    private val _drops = MutableStateFlow(0L)
    val drops: StateFlow<Long> = _drops.asStateFlow()

    /** Assign the next monotonic sequence number. */
    fun nextSequence(): Long = nextSeq.getAndIncrement()

    /**
     * Decide whether a frame should be sent based on backpressure.
     * Keyframes always pass; non-key frames are dropped when at capacity.
     *
     * @return true if the frame should be sent
     */
    fun shouldSend(isKeyframe: Boolean): Boolean {
        cleanupStale()

        if (isKeyframe) {
            // Always allow keyframes — decoder needs them for sync
            return true
        }

        val pending = unackedFrames.size
        if (pending >= MAX_UNACKED) {
            _drops.incrementAndGet()
            return false
        }
        return true
    }

    /**
     * Record a frame as sent (pending acknowledgment).
     */
    fun onFrameSent(seq: Long) {
        synchronized(unackedFrames) {
            unackedFrames[seq] = System.currentTimeMillis()
        }
        _pendingCount.value = unackedFrames.size
    }

    /**
     * Process an ACK from the server. Removes the acknowledged frame
     * and all earlier frames (cumulative ACK).
     */
    fun onAckReceived(ackedSeq: Long) {
        synchronized(unackedFrames) {
            lastAckedSeq.set(ackedSeq)
            // Cumulative ACK: remove all frames with seq <= ackedSeq
            val iter = unackedFrames.iterator()
            while (iter.hasNext()) {
                val (seq, _) = iter.next()
                if (seq <= ackedSeq) {
                    iter.remove()
                }
            }
        }
        _pendingCount.value = unackedFrames.size
    }

    /** Get the last acknowledged sequence number. */
    fun lastAck(): Long = lastAckedSeq.get()

    /** Remove stale entries (sent > ACK_TIMEOUT_MS ago with no ACK). */
    private fun cleanupStale() {
        val now = System.currentTimeMillis()
        synchronized(unackedFrames) {
            val iter = unackedFrames.iterator()
            while (iter.hasNext()) {
                val (_, sendTime) = iter.next()
                if (now - sendTime > ACK_TIMEOUT_MS) {
                    iter.remove()
                }
            }
        }
    }

    fun reset() {
        synchronized(unackedFrames) {
            unackedFrames.clear()
        }
        nextSeq.set(0)
        lastAckedSeq.set(-1)
        _pendingCount.value = 0
        _drops.value = 0
    }
}
