package com.phonefarm.client.bridge

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * JavaScript-bridge implementation of the AutoX `task` global object.
 *
 * Provides progress reporting and result handling APIs to Rhino scripts:
 *   task.reportProgress("Collecting data", 50);  // 50% done
 *   task.reportResult({processed: 100, skipped: 5});
 *   task.sleep(1000);  // cancellable sleep
 *   task.isCancelled();
 *
 * Progress and result events are emitted via shared flows consumed by the
 * ScriptEngine and relayed to the control server via WebSocket.
 */
@Singleton
class JsTask @Inject constructor() {

    /** Emitted whenever a script calls reportProgress(). */
    private val _progressEvents = MutableSharedFlow<ProgressEvent>(replay = 0, extraBufferCapacity = 64)

    /** Emitted when a script calls reportResult(). */
    private val _resultEvents = MutableSharedFlow<ResultEvent>(replay = 0, extraBufferCapacity = 16)

    /** Observable stream of progress events. */
    val progressEvents: Flow<ProgressEvent> = _progressEvents

    /** Observable stream of result events. */
    val resultEvents: Flow<ResultEvent> = _resultEvents

    @Volatile
    var isCancelled: Boolean = false
        private set

    /**
     * TODO: Report a progress update with a human-readable [message] and [percent] complete (0-100).
     * Emits a ProgressEvent that is relayed to the control server.
     */
    fun reportProgress(message: String, percent: Int) {
        val event = ProgressEvent(
            message = message,
            percent = percent.coerceIn(0, 100),
            timestamp = System.currentTimeMillis(),
        )
        _progressEvents.tryEmit(event)
    }

    /**
     * TODO: Report the final result of the task execution.
     * [result] is a JSON-serializable object (Map, List, or primitive).
     * After calling reportResult, the ScriptEngine should consider the task complete.
     */
    fun reportResult(result: Any?) {
        val event = ResultEvent(
            result = result,
            timestamp = System.currentTimeMillis(),
        )
        _resultEvents.tryEmit(event)
    }

    /**
     * TODO: Cancellable sleep. If the task is cancelled while sleeping, throw an exception
     * to unwind the Rhino execution stack.
     */
    fun sleep(millis: Long) {
        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < millis) {
            if (isCancelled) {
                throw TaskCancelledException("Task was cancelled during sleep")
            }
            try {
                Thread.sleep(100)
            } catch (_: InterruptedException) {
                throw TaskCancelledException("Task was interrupted during sleep")
            }
        }
    }

    /**
     * TODO: Mark the task as cancelled. The Rhino context will check this flag
     * at cooperative yield points (sleep, findOne, etc.).
     */
    fun cancel() {
        isCancelled = true
    }

    /**
     * TODO: Reset the cancelled flag for a new task execution.
     */
    fun reset() {
        isCancelled = false
    }

    /**
     * TODO: Report a warning message that does not indicate failure.
     */
    fun reportWarning(message: String) {
        _progressEvents.tryEmit(
            ProgressEvent(
                message = "[WARN] $message",
                percent = -1,
                timestamp = System.currentTimeMillis(),
            )
        )
    }

    /**
     * TODO: Report an error without terminating the script (non-fatal).
     */
    fun reportError(message: String) {
        _progressEvents.tryEmit(
            ProgressEvent(
                message = "[ERROR] $message",
                percent = -1,
                timestamp = System.currentTimeMillis(),
            )
        )
    }

    // ---- event classes ----

    data class ProgressEvent(
        val message: String,
        val percent: Int,
        val timestamp: Long,
    )

    data class ResultEvent(
        val result: Any?,
        val timestamp: Long,
    )
}

/**
 * Exception thrown to unwind the Rhino execution stack when a task is cancelled.
 */
class TaskCancelledException(message: String) : RuntimeException(message)
