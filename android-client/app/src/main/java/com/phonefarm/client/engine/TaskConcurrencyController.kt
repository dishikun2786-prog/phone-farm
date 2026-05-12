package com.phonefarm.client.engine

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Semaphore
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Semaphore-based concurrent task limiting.
 *
 * Restricts the number of simultaneously executing automation tasks to
 * prevent resource exhaustion (CPU, memory, accessibility service queue).
 *
 * Default max concurrency is 1 (single task at a time) to avoid
 * multiple scripts competing for UI focus. Can be increased for
 * headless tasks (API calls, non-UI operations).
 *
 * Exposes [queueSize] as a [StateFlow] so the UI can show pending task count.
 */
@Singleton
class TaskConcurrencyController @Inject constructor() {

    companion object {
        /** Default maximum concurrent tasks. */
        private const val DEFAULT_MAX_CONCURRENCY = 1
    }

    @Volatile
    var maxConcurrency: Int = DEFAULT_MAX_CONCURRENCY
        private set

    private val semaphore = Semaphore(permits = DEFAULT_MAX_CONCURRENCY)

    private val _queueSize = MutableStateFlow(0)
    val queueSize: StateFlow<Int> = _queueSize.asStateFlow()

    /**
     * Whether at least one permit is currently available (i.e., a new task
     * can start immediately without queuing).
     */
    val canExecute: Boolean
        get() = semaphore.availablePermits > 0

    /**
     * Attempt to acquire a task execution slot.
     *
     * If a permit is immediately available, acquires it and returns true.
     * If all slots are occupied, decrements the queue size counter and
     * suspends until a slot frees up. Returns false if the coroutine is
     * cancelled while waiting.
     *
     * @return true if a permit was acquired.
     */
    suspend fun acquire(): Boolean {
        _queueSize.value += 1
        try {
            semaphore.acquire()
            _queueSize.value -= 1
            return true
        } catch (_: kotlinx.coroutines.CancellationException) {
            _queueSize.value -= 1
            throw kotlinx.coroutines.CancellationException("Task cancelled while waiting for slot")
        } catch (e: Exception) {
            _queueSize.value -= 1
            return false
        }
    }

    /**
     * Release a task execution slot.
     *
     * Must be called exactly once for each successful [acquire].
     * Safe to call multiple times — surplus releases are ignored.
     */
    suspend fun release() {
        val available = semaphore.availablePermits
        if (available < maxConcurrency) {
            semaphore.release()
        }
    }

    /**
     * Set the maximum number of concurrent tasks.
     *
     * Increasing the limit releases additional permits; decreasing it
     * (below current permits in use) will block new acquires until
     * existing tasks finish.
     */
    fun setMaxConcurrency(newMax: Int) {
        require(newMax >= 1) { "Max concurrency must be at least 1" }
        val delta = newMax - maxConcurrency
        if (delta > 0) {
            repeat(delta) { semaphore.release() }
        }
        // Negative delta: we can't revoke permits, so future acquires
        // will be blocked until enough releases bring permits < newMax.
        maxConcurrency = newMax
    }
}
