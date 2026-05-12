package com.phonefarm.client.bridge

import javax.inject.Inject
import javax.inject.Singleton

/**
 * JavaScript-bridge implementation of the AutoX `events` global object.
 *
 * Provides a minimal event emitter to Rhino scripts so they can react to
 * lifecycle key events or volume-key long-press / toast interception hooks.
 *
 * Supported events:
 *   events.on('exit', callback) — called when the script engine requests termination.
 *   events.on('key', callback)  — called on certain key events (e.g. volume-down).
 *   events.removeAllListeners() — clear all registered callbacks.
 */
@Singleton
class JsEvents @Inject constructor() {

    private data class Listener(val event: String, val callback: Any)

    private val listeners = mutableListOf<Listener>()

    /**
     * TODO: Register a callback for the given event name.
     * Callback is a Rhino Function (org.mozilla.javascript.Function) or Java lambda.
     * Only 'exit' and 'key' events are supported.
     */
    fun on(event: String, callback: Any) {
        listeners.add(Listener(event, callback))
    }

    /**
     * TODO: Remove all listeners for the given event, or all if [event] is null.
     */
    fun removeAllListeners(event: String? = null) {
        if (event != null) {
            listeners.removeAll { it.event == event }
        } else {
            listeners.clear()
        }
    }

    /**
     * TODO: Emit an event to all registered callbacks.
     * This is called from the Kotlin side (script termination, key hooks).
     */
    fun emit(event: String, vararg args: Any) {
        val matching = listeners.filter { it.event == event }
        for (listener in matching) {
            try {
                when (val cb = listener.callback) {
                    is org.mozilla.javascript.Function -> {
                        val ctx = org.mozilla.javascript.Context.getCurrentContext()
                        val scope = cb.parentScope
                        if (ctx != null && scope != null) {
                            cb.call(ctx, scope, scope, args)
                        }
                    }
                    is Runnable -> cb.run()
                    // TODO: Support kotlin.jvm.functions.Function interfaces
                }
            } catch (_: Exception) {
                // TODO: Log emit failure without crashing the event loop.
            }
        }
    }

    /**
     * TODO: Triggered when the script engine requests a graceful shutdown.
     */
    fun requestExit() {
        emit("exit")
    }

    /**
     * TODO: Triggered on key events that scripts may want to intercept
     * (e.g., volume-down long-press to stop script).
     */
    fun onKeyEvent(keyName: String, isDown: Boolean) {
        emit("key", keyName, isDown)
    }
}
