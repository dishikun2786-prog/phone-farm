package com.phonefarm.client.bridge

import android.view.accessibility.AccessibilityNodeInfo
import com.phonefarm.client.service.PhoneFarmAccessibilityService
import javax.inject.Inject
import javax.inject.Singleton

/**
 * JavaScript-bridge implementation of the AutoX `auto` global object.
 *
 * Provides low-level accessibility tree access to Rhino scripts.
 * The `auto` object is the root for manual tree traversal, useful when
 * UiSelector does not suffice.
 *
 * Key property:
 *   auto.rootInActiveWindow → AccessibilityNodeInfo (or null)
 */
@Singleton
class JsAuto @Inject constructor() {

    /**
     * TODO: Return the root AccessibilityNodeInfo of the currently active window.
     * The caller must recycle the node after use.
     */
    val rootInActiveWindow: AccessibilityNodeInfo?
        get() = PhoneFarmAccessibilityService.instance?.rootInActiveWindow

    /**
     * TODO: Return the list of all windows visible on screen (API 21+).
     */
    fun windows(): List<AccessibilityWindowInfo> {
        val service = PhoneFarmAccessibilityService.instance ?: return emptyList()
        return service.windows.map { w ->
            AccessibilityWindowInfo(
                id = w.id,
                type = w.type,
                layer = w.layer,
                title = w.title?.toString(),
                rootNode = w.root,
            )
        }
    }

    /**
     * TODO: Check if the accessibility service is currently running and enabled.
     */
    fun isServiceRunning(): Boolean {
        return PhoneFarmAccessibilityService.instance != null
    }

    /**
     * TODO: Wait for a window containing [packageName] to become active, with [timeoutMs].
     */
    fun waitForPackage(packageName: String, timeoutMs: Long = 10000L): Boolean {
        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < timeoutMs) {
            val root = rootInActiveWindow
            if (root?.packageName?.toString() == packageName) {
                root.recycle()
                return true
            }
            root?.recycle()
            Thread.sleep(500)
        }
        return false
    }

    /**
     * TODO: Return the root node and automatically recycle it after [block] completes.
     * This is the safe usage pattern:
     *   auto.withRoot { root -> ... }
     */
    fun <T> withRoot(block: (AccessibilityNodeInfo) -> T): T? {
        val root = rootInActiveWindow ?: return null
        return try {
            block(root)
        } finally {
            root.recycle()
        }
    }
}

/**
 * Lightweight wrapper for [android.view.accessibility.AccessibilityWindowInfo] details.
 */
data class AccessibilityWindowInfo(
    val id: Int,
    val type: Int,
    val layer: Int,
    val title: String?,
    val rootNode: AccessibilityNodeInfo?,
)
