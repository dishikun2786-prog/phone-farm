package com.phonefarm.client.vlm

import android.graphics.Bitmap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Detect VLM agent execution loops by comparing consecutive screenshots.
 *
 * A loop occurs when the VLM repeats the same action(s) without making
 * progress — typically due to hallucinated coordinates, misidentified
 * UI elements, or the target app being in an unexpected state.
 *
 * Detection strategies:
 *   1. **Pixel similarity**: compare consecutive screenshots (perceptual hash / SSIM)
 *   2. **Action repetition**: detect repeated identical actions
 *   3. **State oscillation**: detect toggling between 2+ states
 *
 * When a loop is detected, the agent can:
 *   - Inject feedback to the VLM: "You appear to be stuck, try a different approach."
 *   - Escalate to cloud VLM (if running locally)
 *   - Fall back to a heuristic recovery action (swipe, back, home)
 */
@Singleton
class LoopDetector @Inject constructor() {

    /**
     * Check whether the current screenshot indicates the agent is looping.
     *
     * @param previousScreenshots The last N screenshots captured during the episode.
     * @param currentScreenshot   The most recent screenshot.
     * @return [LoopResult] indicating whether a loop was detected and why.
     */
    /** Max consecutive identical actions before loop is declared. */
    private var consecutiveIdenticalActions = 0
    private var lastActionHash: Int = 0

    fun checkLoop(
        previousScreenshots: List<Bitmap>,
        currentScreenshot: Bitmap,
    ): LoopResult {
        if (previousScreenshots.isEmpty()) return LoopResult.NoLoop

        // 1. Perceptual hash similarity check against the most recent screenshot
        val lastScreenshot = previousScreenshots.last()
        val currentHash = computePHash(currentScreenshot)
        val lastHash = computePHash(lastScreenshot)
        val hammingDist = hammingDistance(currentHash, lastHash)

        // Threshold: 5 bits difference = virtually identical screens
        if (hammingDist <= 5) {
            return LoopResult.LoopDetected(
                reason = "Screen unchanged for multiple steps (pHash Hamming distance=$hammingDist)",
                confidence = 1.0f - (hammingDist / 64f),
            )
        }
        return LoopResult.NoLoop
    }

    /**
     * Record an action hash for repetition-based loop detection.
     * Call this each time a [VLMAction] is dispatched.
     */
    fun recordAction(action: VLMAction) {
        val actionHash = action.hashCode()
        if (actionHash == lastActionHash) {
            consecutiveIdenticalActions++
        } else {
            consecutiveIdenticalActions = 0
            lastActionHash = actionHash
        }
        if (consecutiveIdenticalActions >= 3) {
            // Loop detected via action repetition — handled by checkLoop caller
        }
    }

    fun isActionLoopDetected(): Boolean = consecutiveIdenticalActions >= 3

    /**
     * Compute a 64-bit perceptual hash (pHash) from a downscaled 8x8 grayscale image.
     */
    private fun computePHash(bitmap: Bitmap): Long {
        // Downscale to 8x8 grayscale
        val scaled = Bitmap.createScaledBitmap(bitmap, 8, 8, true)
        val pixels = IntArray(64)
        scaled.getPixels(pixels, 0, 8, 0, 0, 8, 8)
        scaled.recycle()

        // Compute average luminance
        var sum = 0L
        val lumas = IntArray(64)
        for (i in pixels.indices) {
            val pixel = pixels[i]
            // Luma from RGB: 0.299*R + 0.587*G + 0.114*B
            val r = (pixel shr 16) and 0xFF
            val g = (pixel shr 8) and 0xFF
            val b = pixel and 0xFF
            val luma = (0.299 * r + 0.587 * g + 0.114 * b).toInt()
            lumas[i] = luma
            sum += luma
        }
        val avg = (sum / 64).toInt()

        // Build hash: bit = 1 if pixel > average
        var hash = 0L
        for (i in lumas.indices) {
            if (lumas[i] > avg) {
                hash = hash or (1L shl i)
            }
        }
        return hash
    }

    /** Compute Hamming distance between two 64-bit hashes. */
    private fun hammingDistance(a: Long, b: Long): Int {
        var diff = a xor b
        var count = 0
        while (diff != 0L) {
            count++
            diff = diff and (diff - 1) // clear lowest set bit
        }
        return count
    }

    /**
     * Reset the loop detection state for a new episode.
     */
    fun reset() {
        consecutiveIdenticalActions = 0
        lastActionHash = 0
    }
}

/**
 * Result of loop detection.
 */
sealed class LoopResult {
    /** No loop detected; agent is making progress. */
    object NoLoop : LoopResult()

    /** A loop was detected with an explanation and confidence score (0.0–1.0). */
    data class LoopDetected(val reason: String, val confidence: Float) : LoopResult()
}
