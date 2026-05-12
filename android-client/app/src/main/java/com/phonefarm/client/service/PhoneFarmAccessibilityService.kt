package com.phonefarm.client.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Path
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.view.Display
import android.view.KeyEvent
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.phonefarm.client.PhoneFarmApp
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Core UI automation service using Android AccessibilityService.
 * Provides screen reading, node finding, gesture injection, and input actions
 * for DeekeScript-compatible automation scripts running in Rhino.
 */
class PhoneFarmAccessibilityService : AccessibilityService() {

    companion object {
        /** Live reference to the active service instance, set in onServiceConnected / cleared in onDestroy. */
        var instance: PhoneFarmAccessibilityService? = null
            private set
    }

    // ---- lifecycle ----

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        // TODO: Re-register global-action-requested listener for back/home/key injection hooks.
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // TODO: Forward event to registered listeners (JsEvents bridge, UI state tracker).
    }

    override fun onInterrupt() {
        // TODO: Cancel any in-progress gesture/action sequences gracefully.
    }

    override fun onDestroy() {
        // TODO: Tear down virtual displays, image readers, and event listeners.
        instance = null
        super.onDestroy()
    }

    // ---- node finding ----

    /**
     * TODO: Find all visible nodes whose text exactly matches [text].
     */
    fun findNodesByText(text: String): List<AccessibilityNodeInfo> {
        return findNodes { it.text?.toString().equals(text, ignoreCase = false) }
    }

    /**
     * TODO: Find all visible nodes whose text contains [text] (case-insensitive).
     */
    fun findNodesByTextContains(text: String): List<AccessibilityNodeInfo> {
        return findNodes { it.text?.toString()?.contains(text, ignoreCase = true) == true }
    }

    /**
     * TODO: Find all visible nodes whose contentDescription exactly matches [desc].
     */
    fun findNodesByDesc(desc: String): List<AccessibilityNodeInfo> {
        return findNodes { it.contentDescription?.toString().equals(desc, ignoreCase = false) }
    }

    /**
     * TODO: Find all visible nodes whose contentDescription contains [desc] (case-insensitive).
     */
    fun findNodesByDescContains(desc: String): List<AccessibilityNodeInfo> {
        return findNodes { it.contentDescription?.toString()?.contains(desc, ignoreCase = true) == true }
    }

    /**
     * TODO: Find all visible nodes whose viewIdResourceName (after last '/') equals [id].
     */
    fun findNodesById(id: String): List<AccessibilityNodeInfo> {
        return findNodes { it.viewIdResourceName?.substringAfterLast('/') == id }
    }

    /**
     * TODO: Find all visible nodes whose class name equals [className].
     */
    fun findNodesByClassName(className: String): List<AccessibilityNodeInfo> {
        return findNodes { it.className?.toString() == className }
    }

    /**
     * TODO: Find all visible nodes that are clickable.
     */
    fun findClickableNodes(): List<AccessibilityNodeInfo> {
        return findNodes { it.isClickable }
    }

    /**
     * TODO: Find all visible nodes that are editable (text input fields).
     */
    fun findEditableNodes(): List<AccessibilityNodeInfo> {
        return findNodes { it.isEditable }
    }

    /**
     * TODO: Recursively traverse the active window root and collect nodes matching [predicate].
     */
    private fun findNodes(predicate: (AccessibilityNodeInfo) -> Boolean): List<AccessibilityNodeInfo> {
        val results = mutableListOf<AccessibilityNodeInfo>()
        val root = rootInActiveWindow ?: return results
        collectMatchingNodes(root, predicate, results)
        return results
    }

    /**
     * TODO: Recursively traverse [node] and its children, adding matches to [results].
     * Recycle nodes that do not match to avoid memory pressure.
     */
    private fun collectMatchingNodes(
        node: AccessibilityNodeInfo,
        predicate: (AccessibilityNodeInfo) -> Boolean,
        results: MutableList<AccessibilityNodeInfo>,
    ) {
        if (predicate(node)) {
            results.add(AccessibilityNodeInfo.obtain(node))
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            collectMatchingNodes(child, predicate, results)
            child.recycle()
        }
    }

    // ---- gesture injection ----

    /**
     * TODO: Dispatch a click gesture at screen coordinates (x, y) using dispatchGesture.
     */
    fun click(x: Float, y: Float) {
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 1))
            .build()
        dispatchGesture(gesture, null, null)
    }

    /**
     * TODO: Dispatch a swipe gesture from (x1, y1) to (x2, y2) with given duration.
     */
    fun swipe(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long = 300L) {
        val path = Path().apply {
            moveTo(x1, y1)
            lineTo(x2, y2)
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()
        dispatchGesture(gesture, null, null)
    }

    /**
     * TODO: Dispatch a long-press gesture at (x, y) with given duration.
     */
    fun longPress(x: Float, y: Float, durationMs: Long = 800L) {
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()
        dispatchGesture(gesture, null, null)
    }

    // ---- global actions ----

    /**
     * TODO: Trigger BACK global action.
     */
    fun back(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_BACK)
    }

    /**
     * TODO: Trigger HOME global action.
     */
    fun home(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_HOME)
    }

    /**
     * TODO: Inject text into the currently focused editable field.
     * On API 33+, use performGlobalAction(GLOBAL_ACTION_SET_TEXT) if available.
     */
    fun inputText(text: String) {
        // Fallback: iterate focused node's ACTION_SET_TEXT
        val focusedNode = findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return
        val args = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        focusedNode.recycle()
    }

    // ---- screenshot ----

    /**
     * TODO: Take a screenshot of the current screen using either
     * takeScreenshot (API 34+) or MediaProjection + ImageReader for older APIs.
     * Returns a Bitmap, or null if the operation failed.
     */
    fun captureScreen(scale: Float = 0.5f, quality: Int = 80): Bitmap? {
        // TODO: On API 34+ use takeScreenshot() with callback; for now always null (needs Activity consent)
        return null
    }

    // ---- current package ----

    /**
     * TODO: Return the package name of the currently focused app/window.
     */
    fun currentPackage(): String? {
        val root = rootInActiveWindow ?: return null
        val pkg = root.packageName?.toString()
        root.recycle()
        return pkg
    }

    // ---- utility ----

    /**
     * TODO: Convenience: find first node matching text and click it, with optional timeout polling.
     */
    fun findAndClick(text: String, timeoutMs: Long = 5000L): Boolean {
        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < timeoutMs) {
            val node = findNodesByText(text).firstOrNull()
            if (node != null) {
                node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                node.recycle()
                return true
            }
            Thread.sleep(200)
        }
        return false
    }

    /**
     * TODO: Scroll forward in the currently focused scrollable container.
     */
    fun scrollForward(): Boolean {
        val scrollable = findNodes { it.isScrollable }.firstOrNull() ?: return false
        val result = scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
        scrollable.recycle()
        return result
    }

    /**
     * TODO: Scroll backward in the currently focused scrollable container.
     */
    fun scrollBackward(): Boolean {
        val scrollable = findNodes { it.isScrollable }.firstOrNull() ?: return false
        val result = scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
        scrollable.recycle()
        return result
    }
}
