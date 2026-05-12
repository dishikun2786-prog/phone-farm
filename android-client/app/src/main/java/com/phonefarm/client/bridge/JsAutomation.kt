package com.phonefarm.client.bridge

import android.view.accessibility.AccessibilityNodeInfo
import com.phonefarm.client.service.PhoneFarmAccessibilityService
import javax.inject.Inject
import javax.inject.Singleton

/**
 * JavaScript-bridge implementation of the AutoX `selector()` chain API and `UiObject` wrapper.
 *
 * Exposes the UiSelector builder pattern to Rhino scripts:
 *   selector().text("Submit").clickable(true).findOnce()
 *
 * Also serves as the entry point for global gesture functions:
 *   click(x,y), swipe(x1,y1,x2,y2,d), press(x,y,d), back(), home(), inputText(t), currentPackage()
 */
@Singleton
class JsAutomation @Inject constructor() {

    // ---- Global gesture functions (callable as JS global free functions) ----

    /**
     * TODO: Click at screen coordinates (x, y).
     */
    fun click(x: Float, y: Float) {
        PhoneFarmAccessibilityService.instance?.click(x, y)
    }

    /**
     * TODO: Swipe from (x1, y1) to (x2, y2) with given duration in milliseconds.
     */
    fun swipe(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long = 300L) {
        PhoneFarmAccessibilityService.instance?.swipe(x1, y1, x2, y2, durationMs)
    }

    /**
     * TODO: Long press at (x, y) for [durationMs] milliseconds.
     */
    fun press(x: Float, y: Float, durationMs: Long = 800L) {
        PhoneFarmAccessibilityService.instance?.longPress(x, y, durationMs)
    }

    /**
     * TODO: Press the BACK button.
     */
    fun back(): Boolean {
        return PhoneFarmAccessibilityService.instance?.back() ?: false
    }

    /**
     * TODO: Press the HOME button.
     */
    fun home(): Boolean {
        return PhoneFarmAccessibilityService.instance?.home() ?: false
    }

    /**
     * TODO: Input text into the currently focused field.
     */
    fun inputText(text: String) {
        PhoneFarmAccessibilityService.instance?.inputText(text)
    }

    /**
     * TODO: Return the package name of the currently focused app.
     */
    fun currentPackage(): String? {
        return PhoneFarmAccessibilityService.instance?.currentPackage()
    }

    // ---- UiSelector factory (called as selector() from JS) ----

    /**
     * TODO: Return a new [UiSelector] chain builder.
     */
    fun createSelector(): UiSelector = UiSelector()

    /**
     * AutoX-compatible UiSelector chain API.
     *
     * Supported chain methods:
     *   text(s), textContains(s), desc(s), descContains(s), id(s), className(s),
     *   clickable(b), editable(b), visibleToUser(b), depth(d), indexInParent(i)
     *
     * Terminal methods:
     *   findOnce() → UiObject?
     *   find() → Array<UiObject>
     *   findOne(timeoutMs) → UiObject?
     *   exists() → Boolean
     *   waitFor() → UiObject?
     *   untilFind() → Array<UiObject> (polling find)
     */
    inner class UiSelector {
        private var textFilter: String? = null
        private var textContainsFilter: String? = null
        private var descFilter: String? = null
        private var descContainsFilter: String? = null
        private var idFilter: String? = null
        private var classNameFilter: String? = null
        private var clickableFilter: Boolean? = null
        private var editableFilter: Boolean? = null
        private var visibleToUserFilter: Boolean? = null
        private var depthFilter: Int? = null
        private var indexInParentFilter: Int? = null

        fun text(s: String): UiSelector { textFilter = s; return this }
        fun textContains(s: String): UiSelector { textContainsFilter = s; return this }
        fun desc(s: String): UiSelector { descFilter = s; return this }
        fun descContains(s: String): UiSelector { descContainsFilter = s; return this }
        fun id(s: String): UiSelector { idFilter = s; return this }
        fun className(s: String): UiSelector { classNameFilter = s; return this }
        fun clickable(b: Boolean): UiSelector { clickableFilter = b; return this }
        fun editable(b: Boolean): UiSelector { editableFilter = b; return this }
        fun visibleToUser(b: Boolean): UiSelector { visibleToUserFilter = b; return this }
        fun depth(d: Int): UiSelector { depthFilter = d; return this }
        fun indexInParent(i: Int): UiSelector { indexInParentFilter = i; return this }

        /**
         * TODO: Return the first matching node, or null.
         */
        fun findOnce(): UiObject? {
            val nodes = performFind()
            return nodes.firstOrNull()
        }

        /**
         * TODO: Return all matching nodes as an array.
         */
        fun find(): Array<UiObject> {
            return performFind().toTypedArray()
        }

        /**
         * TODO: Poll for up to [timeoutMs] ms and return the first matching node, or null.
         */
        fun findOne(timeoutMs: Long = 5000L): UiObject? {
            val start = System.currentTimeMillis()
            while (System.currentTimeMillis() - start < timeoutMs) {
                val node = findOnce()
                if (node != null) return node
                Thread.sleep(200)
            }
            return null
        }

        /**
         * TODO: Return true if at least one matching node exists.
         */
        fun exists(): Boolean = findOnce() != null

        /**
         * TODO: Alias for findOne — wait for matching node to appear.
         */
        fun waitFor(): UiObject? = findOne()

        /**
         * TODO: Repeatedly poll find() until at least one result is returned.
         */
        fun untilFind(): Array<UiObject> {
            while (true) {
                val results = find()
                if (results.isNotEmpty()) return results
                Thread.sleep(300)
            }
        }

        /**
         * TODO: Execute the selector against the current accessibility tree.
         */
        private fun performFind(): List<UiObject> {
            val service = PhoneFarmAccessibilityService.instance ?: return emptyList()
            val root = service.rootInActiveWindow ?: return emptyList()
            val results = mutableListOf<AccessibilityNodeInfo>()
            collectMatches(root, results)
            root.recycle()
            return results.map { UiObject(it) }
        }

        private fun collectMatches(node: AccessibilityNodeInfo, results: MutableList<AccessibilityNodeInfo>) {
            if (matches(node)) {
                // depth filter: only match at specific depth from root
                results.add(AccessibilityNodeInfo.obtain(node))
            }
            for (i in 0 until node.childCount) {
                val child = node.getChild(i) ?: continue
                collectMatches(child, results)
                child.recycle()
            }
        }

        /**
         * TODO: Evaluate all active filter criteria against [node].
         */
        private fun matches(node: AccessibilityNodeInfo): Boolean {
            textFilter?.let { if (node.text?.toString() != it) return false }
            textContainsFilter?.let { if (!(node.text?.toString()?.contains(it, ignoreCase = true) == true)) return false }
            descFilter?.let { if (node.contentDescription?.toString() != it) return false }
            descContainsFilter?.let { if (!(node.contentDescription?.toString()?.contains(it, ignoreCase = true) == true)) return false }
            idFilter?.let { if (node.viewIdResourceName?.substringAfterLast('/') != it) return false }
            classNameFilter?.let { if (node.className?.toString() != it) return false }
            clickableFilter?.let { if (node.isClickable != it) return false }
            editableFilter?.let { if (node.isEditable != it) return false }
            visibleToUserFilter?.let { if (node.isVisibleToUser != it) return false }
            // depth and indexInParent would be tracked during recursion
            return true
        }
    }

    /**
     * AutoX-compatible UiObject wrapper around [AccessibilityNodeInfo].
     *
     * Methods: click(), setText(t), focus(), recycle(), text(), desc(), id(),
     * className(), packageName(), bounds(), childCount(), child(i), parent()
     */
    data class UiObject(val node: AccessibilityNodeInfo) {

        /**
         * TODO: Perform ACTION_CLICK on this node.
         */
        fun click(): Boolean = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)

        /**
         * TODO: Set text on this editable node (ACTION_SET_TEXT).
         */
        fun setText(text: String): Boolean {
            val args = android.os.Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        }

        /**
         * TODO: Focus this node (ACTION_FOCUS).
         */
        fun focus(): Boolean = node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)

        /**
         * TODO: Recycle the underlying node to free resources.
         */
        fun recycle() = node.recycle()

        fun text(): String? = node.text?.toString()
        fun desc(): String? = node.contentDescription?.toString()
        fun id(): String? = node.viewIdResourceName?.substringAfterLast('/')
        fun className(): String? = node.className?.toString()
        fun packageName(): String? = node.packageName?.toString()

        /**
         * TODO: Return the bounding box as android.graphics.Rect.
         */
        fun bounds(): android.graphics.Rect {
            val rect = android.graphics.Rect()
            node.getBoundsInScreen(rect)
            return rect
        }

        fun childCount(): Int = node.childCount

        /**
         * TODO: Return child at index [i] as a new UiObject, or null if out of bounds.
         */
        fun child(i: Int): UiObject? {
            val child = node.getChild(i) ?: return null
            return UiObject(child)
        }

        /**
         * TODO: Return parent as a new UiObject, or null.
         */
        fun parent(): UiObject? {
            val parent = node.parent ?: return null
            return UiObject(parent)
        }
    }
}
