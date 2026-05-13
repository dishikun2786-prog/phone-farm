package com.phonefarm.client.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Path
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import android.view.KeyEvent
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.phonefarm.client.PhoneFarmApp
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Core UI automation service using Android AccessibilityService.
 * Provides screen reading, node finding, gesture injection, and input actions
 * for DeekeScript-compatible automation scripts running in Rhino.
 */
class PhoneFarmAccessibilityService : AccessibilityService() {

    companion object {
        const val TAG = "PhoneFarmA11y"
        /** Live reference to the active service instance, set in onServiceConnected / cleared in onDestroy. */
        var instance: PhoneFarmAccessibilityService? = null
            private set
    }

    // ---- lifecycle ----

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Forward to registered listeners (JsEvents bridge, UI state tracker)
    }

    override fun onInterrupt() {
        // Cancel in-progress gesture/action sequences gracefully
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    // ---- node finding ----

    fun findNodesByText(text: String): List<AccessibilityNodeInfo> {
        return findNodes { it.text?.toString().equals(text, ignoreCase = false) }
    }

    fun findNodesByTextContains(text: String): List<AccessibilityNodeInfo> {
        return findNodes { it.text?.toString()?.contains(text, ignoreCase = true) == true }
    }

    fun findNodesByDesc(desc: String): List<AccessibilityNodeInfo> {
        return findNodes { it.contentDescription?.toString().equals(desc, ignoreCase = false) }
    }

    fun findNodesByDescContains(desc: String): List<AccessibilityNodeInfo> {
        return findNodes { it.contentDescription?.toString()?.contains(desc, ignoreCase = true) == true }
    }

    fun findNodesById(id: String): List<AccessibilityNodeInfo> {
        return findNodes { it.viewIdResourceName?.substringAfterLast('/') == id }
    }

    fun findNodesByClassName(className: String): List<AccessibilityNodeInfo> {
        return findNodes { it.className?.toString() == className }
    }

    fun findClickableNodes(): List<AccessibilityNodeInfo> {
        return findNodes { it.isClickable }
    }

    fun findEditableNodes(): List<AccessibilityNodeInfo> {
        return findNodes { it.isEditable }
    }

    private fun findNodes(predicate: (AccessibilityNodeInfo) -> Boolean): List<AccessibilityNodeInfo> {
        val results = mutableListOf<AccessibilityNodeInfo>()
        val root = rootInActiveWindow ?: return results
        collectMatchingNodes(root, predicate, results)
        return results
    }

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

    fun click(x: Float, y: Float) {
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 1))
            .build()
        dispatchGesture(gesture, null, null)
    }

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

    fun longPress(x: Float, y: Float, durationMs: Long = 800L) {
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()
        dispatchGesture(gesture, null, null)
    }

    // ---- global actions ----

    fun back(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_BACK)
    }

    fun dismissKeyboard(): Boolean {
        return try {
            performGlobalAction(/* GLOBAL_ACTION_DISMISS_KEYBOARD */ 11)
        } catch (_: Exception) {
            false
        }
    }

    fun home(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_HOME)
    }

    fun inputText(text: String) {
        val focusedNode = findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return
        val args = android.os.Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        focusedNode.recycle()
    }

    // ---- screenshot (REAL implementation — no longer a stub) ----

    /**
     * Take a screenshot of the current screen.
     *
     * API 34+: Uses AccessibilityService.takeScreenshot() with CountDownLatch
     *          to convert the callback-based API to a synchronous return.
     * API < 34: Falls back to screencap shell command (requires Shizuku/root).
     * Returns a Bitmap scaled to [scale], or null if all methods fail.
     */
    fun captureScreen(scale: Float = 0.5f, quality: Int = 80): Bitmap? {
        if (Build.VERSION.SDK_INT >= 34) {
            return captureViaTakeScreenshot(scale)
        }
        return captureViaScreencap(scale)
    }

    /** API 34+ screenshot using AccessibilityService.takeScreenshot(). */
    private fun captureViaTakeScreenshot(scale: Float): Bitmap? {
        val latch = CountDownLatch(1)
        var resultBitmap: Bitmap? = null
        val executor = java.util.concurrent.Executors.newSingleThreadExecutor()

        try {
            takeScreenshot(executor) { screenshot ->
                try {
                    val hwBuffer = screenshot.hardwareBuffer
                    if (hwBuffer != null) {
                        val bitmap = Bitmap.createBitmap(hwBuffer.width, hwBuffer.height, Bitmap.Config.ARGB_8888)
                        val ret = bitmap.copyPixelsFromHardwareBuffer(
                            hwBuffer, android.graphics.HardwareBuffer.RGBA_8888,
                            0, 0, null, 0, 0, hwBuffer.width, hwBuffer.height
                        )
                        if (ret == 0) {
                            resultBitmap = if (scale < 1.0f) {
                                Bitmap.createScaledBitmap(bitmap,
                                    (hwBuffer.width * scale).toInt(),
                                    (hwBuffer.height * scale).toInt(), true)
                            } else bitmap
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "takeScreenshot processing failed: ${e.message}")
                } finally {
                    screenshot.hardwareBuffer?.close()
                    latch.countDown()
                }
            }

            latch.await(3, TimeUnit.SECONDS)
        } catch (e: Exception) {
            Log.e(TAG, "takeScreenshot exception: ${e.message}")
        } finally {
            executor.shutdownNow()
        }

        return resultBitmap ?: captureViaScreencap(scale)
    }

    /** Fallback: screencap shell command (requires Shizuku/root/shell permissions). */
    private fun captureViaScreencap(scale: Float): Bitmap? {
        return try {
            val cacheDir = filesDir ?: cacheDir ?: return null
            val tmpFile = File(cacheDir, "screenshot_tmp.png")
            val process = Runtime.getRuntime().exec(
                arrayOf("screencap", "-p", tmpFile.absolutePath)
            )
            process.waitFor()

            if (tmpFile.exists() && tmpFile.length() > 0) {
                val opts = BitmapFactory.Options().apply {
                    if (scale < 1.0f) {
                        inSampleSize = (1.0f / scale).toInt().coerceAtLeast(1).coerceAtMost(4)
                    }
                }
                val bitmap = BitmapFactory.decodeFile(tmpFile.absolutePath, opts)
                tmpFile.delete()
                bitmap
            } else {
                Log.w(TAG, "screencap produced empty file — device may lack privileges")
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "screencap fallback failed: ${e.message}")
            null
        }
    }

    /**
     * Shared screenshot holder — so VlmAgent and EdgePipeline can share
     * the same capture without redundant MediaProjection acquisition.
     */
    @Volatile
    var lastScreenshot: Bitmap? = null
        private set

    @Volatile
    var lastScreenshotTime: Long = 0
        private set

    /** Capture and cache screenshot, returning the cached copy. */
    fun captureAndCache(scale: Float = 0.5f, quality: Int = 80): Bitmap? {
        // Reuse if captured within the last 300ms
        if (lastScreenshot != null && System.currentTimeMillis() - lastScreenshotTime < 300) {
            return lastScreenshot
        }
        val bitmap = captureScreen(scale, quality)
        if (bitmap != null) {
            lastScreenshot?.recycle()
            lastScreenshot = bitmap
            lastScreenshotTime = System.currentTimeMillis()
        }
        return bitmap
    }

    // ---- current package ----

    fun currentPackage(): String? {
        val root = rootInActiveWindow ?: return null
        val pkg = root.packageName?.toString()
        root.recycle()
        return pkg
    }

    // ---- utility ----

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

    fun scrollForward(): Boolean {
        val scrollable = findNodes { it.isScrollable }.firstOrNull() ?: return false
        val result = scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
        scrollable.recycle()
        return result
    }

    fun scrollBackward(): Boolean {
        val scrollable = findNodes { it.isScrollable }.firstOrNull() ?: return false
        val result = scrollable.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
        scrollable.recycle()
        return result
    }
}
