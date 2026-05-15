package com.phonefarm.client.engine

import com.phonefarm.client.bridge.JsBridge
import com.phonefarm.client.bridge.TaskCancelledException
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import org.mozilla.javascript.Context
import org.mozilla.javascript.ContextFactory
import org.mozilla.javascript.ScriptableObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Mozilla Rhino JavaScript engine wrapper for PhoneFarm.
 *
 * Manages the Rhino runtime lifecycle: initialization, script execution,
 * JS-to-Kotlin API bridging, interruption, and scope reloading.
 *
 * Each script runs in a dedicated coroutine via [execute]. Progress and
 * step-level results are exposed as [Flow]s.
 *
 * Usage:
 *   val engine = ScriptEngine(jsBridge, scriptManager)
 *   engine.init()
 *   engine.execute("task_dy_toker.js", mapOf("duration" to 300))
 *       .collect { step -> handleStep(step) }
 */
@Singleton
class ScriptEngine @Inject constructor(
    private val jsBridge: JsBridge,
    private val scriptManager: ScriptManager,
) {

    // ---- state ----

    private val _currentScript = MutableStateFlow<RunningScript?>(null)

    /** Currently executing script, or null when idle. */
    val currentScript: StateFlow<RunningScript?> = _currentScript.asStateFlow()

    private val _stepFlow = MutableSharedFlow<ScriptStep>(replay = 0, extraBufferCapacity = 128)

    /** Stream of progress/steps emitted during script execution. */
    val stepFlow: Flow<ScriptStep> = _stepFlow.asSharedFlow()

    private var executionJob: Job? = null
    private var executing = false

    @Volatile
    private var stopRequested = false

    @Volatile
    private var rhinoContext: Context? = null

    private var initialized = false

    // ---- init ----

    /**
     * TODO: Initialize the Rhino runtime.
     * - Configure ContextFactory with optimization level -1 (interpretive, best compat).
     * - Set maximum interpreter stack depth.
     * - Set language version to ES6 (Context.VERSION_ES6).
     * - Create root scope and register all JS APIs via JsBridge.registerAll().
     */
    fun init() {
        if (initialized) return

        // TODO: Configure Rhino context factory with safe defaults.
        ContextFactory.initGlobal(object : ContextFactory() {
            override fun makeContext(): Context {
                val cx = super.makeContext()
                cx.optimizationLevel = -1   // interpretive mode for AutoX compat
                cx.languageVersion = Context.VERSION_ES6
                cx.maximumInterpreterStackDepth = 2048
                return cx
            }
        })

        initialized = true
    }

    /**
     * TODO: Execute a named script with the given config.
     *
     * 1. Look up script content via ScriptManager.getScriptContent(name).
     * 2. Create a fresh Rhino scope.
     * 3. Set up `config` and `arguments` globals from the config map.
     * 4. Execute the script in a coroutine with a Rhino Context.
     * 5. Emit each progress step and the final result via ScriptStep.
     * 6. Automatically clean up scope and resources on completion/cancellation.
     *
     * @param scriptName Name of the script to execute (e.g., "task_dy_toker.js").
     * @param config Map of configuration values made available to the script.
     * @return A Flow of [ScriptStep] events (start, progress, complete, error).
     */
    fun execute(scriptName: String, config: Map<String, Any> = emptyMap()): Flow<ScriptStep> = flow {
        // Guard against concurrent execute() calls
        if (executing) {
            emit(ScriptStep.Error(scriptName, "Another script is already running", null))
            return@flow
        }
        executing = true
        stopRequested = false

        // Capture the coroutine Job so stop() can cancel execution.
        executionJob = currentCoroutineContext()[Job]

        check(initialized) { "ScriptEngine not initialized. Call init() first." }

        val content = scriptManager.getScriptContent(scriptName)
            ?: throw IllegalArgumentException("Script not found: $scriptName")

        val runningScript = RunningScript(
            name = scriptName,
            config = config,
            startedAt = System.currentTimeMillis(),
        )
        _currentScript.value = runningScript

        emit(ScriptStep.Started(scriptName, System.currentTimeMillis()))

        try {
            withContext(Dispatchers.Default) {
                val cx = Context.enter()
                rhinoContext = cx
                // Enable interruptible mode so stop() can terminate long-running scripts
                cx.isInterruptible = true
                var scope: org.mozilla.javascript.ScriptableObject? = null
                try {
                    val newScope = cx.initStandardObjects()
                    scope = newScope
                    jsBridge.registerAll(newScope)

                    // Inject config/arguments into scope.
                    val configObj = cx.newObject(newScope)
                    config.forEach { (k, v) ->
                        ScriptableObject.putProperty(configObj, k, Context.javaToJS(v, newScope))
                    }
                    ScriptableObject.putProperty(newScope, "config", configObj)

                    cx.evaluateString(newScope, content, scriptName, 1, null)

                    emit(ScriptStep.Completed(scriptName, System.currentTimeMillis()))
                } catch (e: TaskCancelledException) {
                    emit(ScriptStep.Cancelled(scriptName, e.message ?: "Task cancelled"))
                } catch (e: Exception) {
                    emit(ScriptStep.Error(scriptName, e.message ?: "Unknown error", e.stackTraceToString()))
                } finally {
                    scope?.let { jsBridge.unregisterAll(it) }
                    Context.exit()
                    rhinoContext = null
                }
            }
        } finally {
            _currentScript.value = null
            executing = false
            executionJob = null
        }
    }.flowOn(Dispatchers.Default)

    /**
     * Stop the currently executing script.
     * Cancels the execution coroutine and interrupts the Rhino context.
     */
    fun stop() {
        stopRequested = true
        // Interrupt Rhino's current evaluation — causes evaluateString() to throw
        rhinoContext?.let { cx ->
            try { cx.interrupt() } catch (_: Exception) { android.util.Log.w("ScriptEngine", "Failed to interrupt Rhino context") }
            rhinoContext = null
        }
        executionJob?.cancel(CancellationException("Script stopped by user"))
        executionJob = null
    }

    /**
     * TODO: Reload the Rhino scope (used after OTA script updates).
     * Does not interrupt the currently running script.
     * The new scope will be used for the next execute() call.
     */
    fun reload() {
        // TODO: No persistent scope to reload since each execute() creates a fresh one.
        //       Future: if we cache compiled scripts, invalidate the cache here.
    }

    /**
     * TODO: Return the Rhino engine version string.
     */
    fun engineVersion(): String {
        return "Rhino 1.7.15 / PhoneFarm ScriptEngine"
    }
}

// ---- data classes ----

/**
 * Represents a currently running script.
 */
data class RunningScript(
    val name: String,
    val config: Map<String, Any>,
    val startedAt: Long,
)

/**
 * Sealed hierarchy for script execution lifecycle events emitted via Flow.
 */
sealed class ScriptStep {
    abstract val scriptName: String
    abstract val timestamp: Long

    data class Started(
        override val scriptName: String,
        override val timestamp: Long,
    ) : ScriptStep()

    data class Progress(
        override val scriptName: String,
        override val timestamp: Long,
        val message: String,
        val percent: Int,
    ) : ScriptStep()

    data class Completed(
        override val scriptName: String,
        override val timestamp: Long,
    ) : ScriptStep()

    data class Cancelled(
        override val scriptName: String,
        val reason: String,
    ) : ScriptStep() {
        override val timestamp: Long = System.currentTimeMillis()
    }

    data class Error(
        override val scriptName: String,
        val message: String,
        val stackTrace: String,
    ) : ScriptStep() {
        override val timestamp: Long = System.currentTimeMillis()
    }
}
