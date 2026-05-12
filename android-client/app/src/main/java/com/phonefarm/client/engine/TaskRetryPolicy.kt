package com.phonefarm.client.engine

import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.min
import kotlin.math.pow
import kotlin.random.Random

/**
 * Exponential backoff retry strategy for failed automation tasks.
 *
 * Computes the delay before the next retry attempt using:
 *   delay = min(baseDelay * 2^attempt + jitter, maxDelay)
 *
 * Default parameters:
 *  - baseDelay = 5 seconds
 *  - maxDelay  = 5 minutes
 *  - maxRetries = 3
 *
 * Returns null when retries are exhausted, signaling that the task
 * should be marked as permanently failed.
 */
@Singleton
class TaskRetryPolicy @Inject constructor() {

    companion object {
        /** Default base delay in milliseconds. */
        private const val DEFAULT_BASE_DELAY_MS = 5_000L
        /** Default maximum delay in milliseconds. */
        private const val DEFAULT_MAX_DELAY_MS = 5L * 60 * 1000 // 5 minutes
        /** Default maximum number of retries. */
        private const val DEFAULT_MAX_RETRIES = 3
    }

    private var baseDelayMs = DEFAULT_BASE_DELAY_MS
    private var maxDelayMs = DEFAULT_MAX_DELAY_MS

    /**
     * Determine whether a task should be retried and, if so, the delay
     * before the next attempt.
     *
     * @param attempt    Current attempt number (0-indexed; attempt 0 = first retry).
     * @param maxRetries Maximum number of retries allowed for this task type.
     *                   Defaults to 3.
     * @return Delay in milliseconds before the next retry, or null if
     *         retries are exhausted.
     */
    fun shouldRetry(attempt: Int, maxRetries: Int = DEFAULT_MAX_RETRIES): Long? {
        if (attempt >= maxRetries) return null

        val exponentialDelay = baseDelayMs * 2.0.pow(attempt.toDouble()).toLong()
        val clampedDelay = min(exponentialDelay, maxDelayMs)

        // Add jitter (+/- 25%) to avoid thundering herd.
        val jitter = (clampedDelay * (0.5 + Random.nextDouble() * 0.5)).toLong()

        return jitter
    }

    /**
     * Configure the base and maximum backoff delays.
     */
    fun configure(baseDelayMs: Long, maxDelayMs: Long) {
        require(baseDelayMs > 0) { "baseDelay must be > 0" }
        require(maxDelayMs >= baseDelayMs) { "maxDelay must be >= baseDelay" }
        this.baseDelayMs = baseDelayMs
        this.maxDelayMs = maxDelayMs
    }

    /**
     * Compute the total possible time span for all retries.
     * Useful for UI display ("task may take up to X minutes with retries").
     */
    fun estimateMaxTotalRetryTime(maxRetries: Int = DEFAULT_MAX_RETRIES): Long {
        var total = 0L
        for (i in 0 until maxRetries) {
            val delay = min(baseDelayMs * 2.0.pow(i.toDouble()).toLong(), maxDelayMs)
            total += delay
        }
        return total
    }
}
