package com.phonefarm.client.engine

import kotlinx.coroutines.*
import javax.inject.Inject
import javax.inject.Singleton
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Timeout protection for automation tasks using a combination of
 * coroutine [withTimeout] and [CountDownLatch] for blocking APIs.
 *
 * Each task is assigned a timeout duration. If the task does not
 * complete within the timeout:
 *  - The coroutine is cancelled (structured concurrency)
 *  - The task is marked as TIMED_OUT
 *  - Cleanup actions (if registered) are executed
 *
 * This guards against DeekeScript tasks that get stuck on unexpected
 * UI states or infinite loops in platform apps.
 */
@Singleton
class TaskTimeoutGuard @Inject constructor() {

    companion object {
        /** Default task timeout: 30 minutes. */
        const val DEFAULT_TIMEOUT_MS = 30L * 60 * 1000
        /** Absolute maximum timeout: 2 hours. */
        const val MAX_TIMEOUT_MS = 2L * 60 * 60 * 1000
    }

    data class TimeoutResult(
        val completed: Boolean,
        val timedOut: Boolean,
        val elapsedMs: Long,
        val timeoutMs: Long,
    )

    /**
     * Execute [block] with a coroutine timeout.
     *
     * @param timeoutMs  Maximum duration in milliseconds.
     * @param onTimeout  Callback invoked if the timeout fires (for cleanup).
     * @param block      The task body to execute.
     * @return [TimeoutResult] indicating completion status.
     */
    suspend fun executeWithTimeout(
        timeoutMs: Long = DEFAULT_TIMEOUT_MS,
        onTimeout: (() -> Unit)? = null,
        block: suspend () -> Unit,
    ): TimeoutResult {
        val effectiveTimeout = timeoutMs.coerceAtMost(MAX_TIMEOUT_MS)
        val startTime = System.currentTimeMillis()

        return try {
            withTimeout(effectiveTimeout) {
                block()
            }
            val elapsed = System.currentTimeMillis() - startTime
            TimeoutResult(
                completed = true,
                timedOut = false,
                elapsedMs = elapsed,
                timeoutMs = effectiveTimeout,
            )
        } catch (e: TimeoutCancellationException) {
            onTimeout?.invoke()
            val elapsed = System.currentTimeMillis() - startTime
            TimeoutResult(
                completed = false,
                timedOut = true,
                elapsedMs = elapsed,
                timeoutMs = effectiveTimeout,
            )
        } catch (e: CancellationException) {
            onTimeout?.invoke()
            val elapsed = System.currentTimeMillis() - startTime
            TimeoutResult(
                completed = false,
                timedOut = false,
                elapsedMs = elapsed,
                timeoutMs = effectiveTimeout,
            )
        }
    }

    /**
     * Create a [CountDownLatch]-based timeout for blocking (non-coroutine) code.
     *
     * @param timeoutMs  Maximum wait duration in milliseconds.
     * @return CountDownLatch pre-configured with count 1.
     */
    fun createLatch(timeoutMs: Long = DEFAULT_TIMEOUT_MS): CountDownLatch {
        return CountDownLatch(1)
    }

    /**
     * Wait on a latch with a timeout.
     *
     * @param latch      The latch to wait on.
     * @param timeoutMs  Maximum wait time in milliseconds.
     * @return true if the latch counted down before timeout.
     */
    fun awaitLatch(latch: CountDownLatch, timeoutMs: Long): Boolean {
        return try {
            latch.await(timeoutMs, TimeUnit.MILLISECONDS)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            false
        }
    }
}
