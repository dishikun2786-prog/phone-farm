package com.phonefarm.client.bridge

import com.phonefarm.client.engine.ScriptEngine
import com.phonefarm.client.engine.ScriptManager
import kotlinx.coroutines.runBlocking
import org.mozilla.javascript.Context
import org.mozilla.javascript.ScriptableObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * JavaScript-bridge implementation of the AutoX `engines` global object.
 *
 * Provides script execution management to Rhino scripts so they can spawn sub-scripts
 * or manage the engine lifecycle:
 *   engines.execScriptFile(path, {arguments: {...}})
 *   engines.stopAll()
 *   engines.myEngine() -> current engine instance
 *
 * In PhoneFarm, each engine invocation maps to a [ScriptEngine] execution context.
 * Sub-scripts run synchronously in a child Rhino scope that inherits from the
 * current top-level scope so all global functions and objects are accessible.
 */
@Singleton
class JsEngines @Inject constructor(
    private val scriptEngine: ScriptEngine,
    private val scriptManager: ScriptManager,
) {

    /**
     * Execute another script file synchronously in a child scope of the current
     * Rhino context. The sub-script has access to all global functions/objects
     * from the parent scope while its own local variables are isolated.
     *
     * @param path Script file name relative to the scripts directory (e.g. "helper.js").
     * @param options Optional map that may contain:
     *   - "arguments": Map<String, Any> of values exposed as the `arguments` global.
     *   - "path": working directory (unused for now).
     *   - "delay": delay in ms before execution (unused for now).
     * @return A [ScriptExecution] handle reflecting the result.
     */
    fun execScriptFile(path: String, options: Map<String, Any>? = null): ScriptExecution {
        val cx = JsBridge.currentRhinoContext
            ?: throw IllegalStateException("No Rhino context active — cannot execScriptFile outside of a running script")
        val parentScope = JsBridge.currentScope
            ?: throw IllegalStateException("No Rhino scope active")

        val startTime = System.currentTimeMillis()
        val exec = ScriptExecution(path, options ?: emptyMap(), "running", startTime)

        // Load script content (blocking call to Room DB / assets)
        val content = runBlocking {
            scriptManager.getScriptContent(path)
        }

        if (content == null) {
            exec.status = "error"
            exec.errorMessage = "Script not found: $path"
            return exec
        }

        return try {
            // Create a child scope that falls back to the parent for global lookups.
            val childScope = cx.initStandardObjects()
            childScope.parentScope = parentScope

            // Inject custom arguments (available as bare `arguments` in the sub-script).
            val scriptArgs = options?.get("arguments") as? Map<*, *>
            if (scriptArgs != null) {
                val argsObj = cx.newObject(childScope)
                scriptArgs.forEach { (k, v) ->
                    ScriptableObject.putProperty(
                        argsObj, k.toString(),
                        Context.javaToJS(v, childScope),
                    )
                }
                ScriptableObject.putProperty(childScope, "arguments", argsObj)
            }

            cx.evaluateString(childScope, content, path, 1, null)
            exec.status = "completed"
            exec
        } catch (e: TaskCancelledException) {
            exec.status = "stopped"
            exec.errorMessage = e.message
            exec
        } catch (e: Exception) {
            exec.status = "error"
            exec.errorMessage = e.message
            exec
        }
    }

    /**
     * Stop all running scripts including the current one.
     * Delegates to [ScriptEngine.stop] which cancels the execution coroutine.
     * The coroutine cancellation causes [withContext] to throw, which unwinds the
     * Rhino evaluation via [Context.exit] in the finally block.
     */
    fun stopAll() {
        scriptEngine.stop()
    }

    /**
     * Return a [ScriptExecution] handle representing the currently executing script.
     * The returned handle can be used to inspect the script's status.
     */
    fun myEngine(): ScriptExecution {
        val current = scriptEngine.currentScript.value
        return if (current != null) {
            ScriptExecution(
                scriptPath = current.name,
                arguments = current.config,
                status = "running",
                startedAt = current.startedAt,
            )
        } else {
            ScriptExecution("<unknown>", emptyMap(), "idle", System.currentTimeMillis())
        }
    }

    /**
     * Set up an intent listener to trigger a script when a specific intent action
     * is received. Registers a BroadcastReceiver that executes the script with the
     * intent extras passed as arguments.
     *
     * NOTE: Full implementation requires a BroadcastReceiver registered in the
     * AndroidManifest or at runtime. Currently a placeholder for future use.
     */
    fun execArg(name: String, script: Any, config: Map<String, Any>?) {
        // TODO: Register a BroadcastReceiver for the given intent action.
        // TODO: Execute the script with the intent extras as arguments.
        android.util.Log.w(
            "JsEngines",
            "execArg is not yet implemented (action=$name). Register a BroadcastReceiver in manifest for full support.",
        )
    }

    /**
     * Represents a running or completed script execution.
     */
    class ScriptExecution(
        val scriptPath: String,
        val arguments: Map<String, Any>,
        var status: String, // "pending", "running", "completed", "stopped", "error"
        val startedAt: Long,
    ) {
        var errorMessage: String? = null
        var resultValue: Any? = null

        /**
         * Block the caller until this execution completes, then return the result.
         * For synchronous sub-script execution this returns immediately.
         */
        fun awaitResult(): Any? = resultValue

        /**
         * Request this execution to stop by marking it as stopped.
         * For synchronous executions, this sets the status; actual interruption
         * is handled by the parent ScriptEngine.
         */
        fun stop() {
            status = "stopped"
        }
    }
}
