package com.phonefarm.client.bridge

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import dagger.hilt.android.qualifiers.ApplicationContext
import org.mozilla.javascript.Context as RhinoContext
import org.mozilla.javascript.FunctionObject
import org.mozilla.javascript.ScriptableObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Central registry that binds all AutoX v7 global functions and objects into the Rhino scope.
 * Called once per Rhino [org.mozilla.javascript.Context] initialization to make standard
 * automation APIs (click, swipe, selector, device, app, etc.) available to JS scripts.
 */
@Singleton
class JsBridge @Inject constructor(
    private val automation: JsAutomation,
    private val jsDevice: JsDevice,
    private val jsApp: JsApp,
    private val jsAuto: JsAuto,
    private val jsEvents: JsEvents,
    private val jsImages: JsImages,
    private val jsFiles: JsFiles,
    private val jsEngines: JsEngines,
    private val jsStorages: JsStorages,
    private val jsWeb: JsWeb,
    private val jsHttp: JsHttp,
    private val jsTask: JsTask,
    @ApplicationContext private val context: Context,
) {

    companion object {
        const val SCOPE_TOP_LEVEL = "topLevel"

        // Static holder references set before registerAll() and cleared after unregisterAll().
        // Companion object methods access these to delegate to the current singleton instance.
        private var sInstance: JsBridge? = null
        private var sAppContext: Context? = null

        /** The active Rhino context, set during registerAll(). Used by JsEngines for sub-script execution. */
        @JvmStatic
        var currentRhinoContext: org.mozilla.javascript.Context? = null
            private set

        /** The active Rhino top-level scope, set during registerAll(). Used by JsEngines for child-scope creation. */
        @JvmStatic
        var currentScope: ScriptableObject? = null
            private set

        // -------------------------------------------------------------------------
        // Global function implementations (static, invoked via FunctionObject by Rhino)
        // Each maps directly to an AutoX v7 global function that JS scripts can call.
        // -------------------------------------------------------------------------

        /** sleep(ms) — pause script execution for [ms] milliseconds. */
        @JvmStatic
        fun _sleep(ms: Double) {
            Thread.sleep(ms.toLong())
        }

        /** click(x, y) — tap at screen coordinates. */
        @JvmStatic
        fun _click(x: Double, y: Double) {
            sInstance?.automation?.click(x.toFloat(), y.toFloat())
        }

        /** swipe(x1, y1, x2, y2, duration) — swipe gesture. */
        @JvmStatic
        fun _swipe(x1: Double, y1: Double, x2: Double, y2: Double, duration: Double) {
            sInstance?.automation?.swipe(
                x1.toFloat(), y1.toFloat(),
                x2.toFloat(), y2.toFloat(),
                duration.toLong(),
            )
        }

        /** press(x, y, duration) — long-press at coordinates. */
        @JvmStatic
        fun _press(x: Double, y: Double, duration: Double) {
            sInstance?.automation?.press(x.toFloat(), y.toFloat(), duration.toLong())
        }

        /** back() — press the system back button. Returns true on success. */
        @JvmStatic
        fun _back(): Boolean = sInstance?.automation?.back() ?: false

        /** home() — press the system home button. Returns true on success. */
        @JvmStatic
        fun _home(): Boolean = sInstance?.automation?.home() ?: false

        /** toast(msg) — show a short Android toast on the UI thread. */
        @JvmStatic
        fun _toast(msg: String) {
            sAppContext?.let { ctx ->
                Handler(Looper.getMainLooper()).post {
                    Toast.makeText(ctx, msg, Toast.LENGTH_SHORT).show()
                }
            }
        }

        /** log(msg) — write a debug-level log line under the "PhoneFarm" tag. */
        @JvmStatic
        fun _log(msg: Any?) {
            android.util.Log.d("PhoneFarm", msg?.toString() ?: "null")
        }

        /** inputText(text) — type text into the currently focused field. */
        @JvmStatic
        fun _inputText(text: String) {
            sInstance?.automation?.inputText(text)
        }

        /** currentPackage() — return the package name of the foreground app. */
        @JvmStatic
        fun _currentPackage(): String =
            sInstance?.automation?.currentPackage() ?: ""

        /**
         * selector() — return a NEW [JsAutomation.UiSelector] chain builder.
         * Each call produces a fresh selector so multiple concurrent queries do not
         * interfere with one another.
         */
        @JvmStatic
        fun _selector(): Any? =
            sInstance?.automation?.createSelector()
    }

    /**
     * Register every AutoX global function and object into [scope].
     *
     * Global functions (11) — registered via [FunctionObject] wrapping a static Java method:
     *   sleep(ms), click(x,y), swipe(x1,y1,x2,y2,duration), press(x,y,duration),
     *   back(), home(), toast(msg), log(msg), inputText(text),
     *   currentPackage(), selector()
     *
     * Global objects (11) — registered as scope properties via [ScriptableObject.putProperty]:
     *   device  → JsDevice      | app    → JsApp         | auto   → JsAuto
     *   events  → JsEvents      | images → JsImages      | files  → JsFiles
     *   engines → JsEngines     | storages → JsStorages  | web    → JsWeb
     *   http    → JsHttp        | task    → JsTask
     */
    fun registerAll(scope: ScriptableObject) {
        val cx = RhinoContext.getCurrentContext() // ensure we're inside a Rhino context
        sInstance = this
        sAppContext = context
        currentRhinoContext = cx
        currentScope = scope

        // ---- helper: register a static companion method as a FunctionObject ----
        fun register(name: String, methodName: String, vararg paramTypes: Class<*>) {
            try {
                val method = JsBridge::class.java.getDeclaredMethod(methodName, *paramTypes)
                val fnObj = FunctionObject(name, method, scope)
                ScriptableObject.putProperty(scope, name, fnObj)
            } catch (e: Exception) {
                android.util.Log.e("JsBridge", "Failed to register $name", e)
            }
        }

        // 11 global free functions
        register("sleep",          "_sleep",          java.lang.Double.TYPE)
        register("click",          "_click",          java.lang.Double.TYPE, java.lang.Double.TYPE)
        register("swipe",          "_swipe",          java.lang.Double.TYPE, java.lang.Double.TYPE, java.lang.Double.TYPE, java.lang.Double.TYPE, java.lang.Double.TYPE)
        register("press",          "_press",          java.lang.Double.TYPE, java.lang.Double.TYPE, java.lang.Double.TYPE)
        register("back",           "_back")
        register("home",           "_home")
        register("toast",          "_toast",          java.lang.String::class.java)
        register("log",            "_log",            java.lang.Object::class.java)
        register("inputText",      "_inputText",      java.lang.String::class.java)
        register("currentPackage", "_currentPackage")
        register("selector",       "_selector")

        // 11 global bridge objects
        ScriptableObject.putProperty(scope, "device",   RhinoContext.javaToJS(jsDevice, scope))
        ScriptableObject.putProperty(scope, "app",      RhinoContext.javaToJS(jsApp, scope))
        ScriptableObject.putProperty(scope, "auto",     RhinoContext.javaToJS(jsAuto, scope))
        ScriptableObject.putProperty(scope, "events",   RhinoContext.javaToJS(jsEvents, scope))
        ScriptableObject.putProperty(scope, "images",   RhinoContext.javaToJS(jsImages, scope))
        ScriptableObject.putProperty(scope, "files",    RhinoContext.javaToJS(jsFiles, scope))
        ScriptableObject.putProperty(scope, "engines",  RhinoContext.javaToJS(jsEngines, scope))
        ScriptableObject.putProperty(scope, "storages", RhinoContext.javaToJS(jsStorages, scope))
        ScriptableObject.putProperty(scope, "web",      RhinoContext.javaToJS(jsWeb, scope))
        ScriptableObject.putProperty(scope, "http",     RhinoContext.javaToJS(jsHttp, scope))
        ScriptableObject.putProperty(scope, "task",     RhinoContext.javaToJS(jsTask, scope))
    }

    /**
     * De-register all global functions and objects from scope after script execution
     * completes. Prevents leaking references between script invocations.
     */
    fun unregisterAll(scope: ScriptableObject) {
        val keys = listOf(
            // global functions
            "sleep", "click", "swipe", "press", "back", "home",
            "toast", "log", "inputText", "currentPackage", "selector",
            // global objects
            "device", "app", "auto", "events", "images", "files",
            "engines", "storages", "web", "http", "task",
        )
        keys.forEach { scope.delete(it) }
        currentRhinoContext = null
        currentScope = null
        sInstance = null
        sAppContext = null
    }
}
