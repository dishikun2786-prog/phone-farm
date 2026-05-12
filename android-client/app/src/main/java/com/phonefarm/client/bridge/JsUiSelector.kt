package com.phonefarm.client.bridge

import android.view.accessibility.AccessibilityNodeInfo
import com.phonefarm.client.service.PhoneFarmAccessibilityService
import javax.inject.Inject
import javax.inject.Singleton

/**
 * JavaScript-bridge implementation of the AutoX UiSelector class constructor.
 *
 * This is the class behind `new UiSelector()` in JS scripts.
 * The preferred entry point is via `selector()` (JsAutomation.createSelector()),
 * but scripts that construct UiSelector directly should also work.
 *
 * Usage in JS:
 *   var sel = new UiSelector();
 *   var btn = sel.text("Submit").findOnce();
 *   if (btn) { btn.click(); }
 */
@Singleton
class JsUiSelector @Inject constructor(
    private val automation: JsAutomation,
) {

    /**
     * Create a new UiSelector builder instance.
     * Delegates to the injected [JsAutomation] singleton which owns the selector implementation.
     */
    fun create(): JsAutomation.UiSelector {
        return automation.createSelector()
    }

    // ---- Static utility ----

    companion object {

        /**
         * TODO: Convenience: check if any node with the given text exists.
         */
        fun hasText(text: String): Boolean {
            val service = PhoneFarmAccessibilityService.instance ?: return false
            return service.findNodesByText(text).isNotEmpty()
        }

        /**
         * TODO: Convenience: find the first node with the given text and return it,
         * or null if not found.
         */
        fun findByText(text: String): JsAutomation.UiObject? {
            val service = PhoneFarmAccessibilityService.instance ?: return null
            val nodes = service.findNodesByText(text)
            return nodes.firstOrNull()?.let { JsAutomation.UiObject(it) }
        }

        /**
         * TODO: Convenience: find the first node with the given content description.
         */
        fun findByDesc(desc: String): JsAutomation.UiObject? {
            val service = PhoneFarmAccessibilityService.instance ?: return null
            val nodes = service.findNodesByDesc(desc)
            return nodes.firstOrNull()?.let { JsAutomation.UiObject(it) }
        }
    }
}
