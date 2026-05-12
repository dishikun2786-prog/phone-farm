package com.phonefarm.client.vlm

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Convert between normalized coordinate systems and device pixel coordinates.
 *
 * Supported coordinate systems:
 *   - "norm1000"     : x, y in range [0, 1000] — AutoGLM / UI-TARS standard
 *   - "norm1"        : x, y in range [0.0, 1.0] — Qwen-VL float
 *   - "pixel"        : raw screen pixels (no conversion needed)
 *   - "percentage"   : x, y as percentages (0–100)
 *   - "smart_resize" : UI-TARS smart-resize — image resized to fit target box
 *                      with longest edge = maxDim; coordinates reverse-scaled.
 *
 * The standard used throughout PhoneFarm is [0, 1000] normalized
 * (AutoGLM convention), since pixel coordinates vary across devices.
 */
@Singleton
class CoordinateNormalizer @Inject constructor() {

    /**
     * Convert normalized coordinates to device pixel coordinates.
     *
     * @param x            Normalized X coordinate.
     * @param y            Normalized Y coordinate.
     * @param screenWidth  Device screen width in pixels.
     * @param screenHeight Device screen height in pixels.
     * @param coordSystem  The coordinate system used by the VLM model.
     * @return Pair of (pixelX, pixelY).
     */
    fun normalizeToPixel(
        x: Int,
        y: Int,
        screenWidth: Int,
        screenHeight: Int,
        coordSystem: String,
    ): Pair<Int, Int> {
        val (rawX, rawY) = when (coordSystem.lowercase()) {
            "norm1000" -> Pair(
                (x.toFloat() / 1000f * screenWidth).toInt(),
                (y.toFloat() / 1000f * screenHeight).toInt(),
            )
            "norm1" -> {
                // Qwen-VL uses float [0.0, 1.0]; caller may scale to int so treat as /1000
                val fx = x.toFloat() / if (x > 1) 1000f else 1f
                val fy = y.toFloat() / if (y > 1) 1000f else 1f
                Pair(
                    (fx * screenWidth).toInt(),
                    (fy * screenHeight).toInt(),
                )
            }
            "smart_resize" -> {
                // UI-TARS smart resize: image is resized so longest edge = smartDim (default 1000)
                // with padding on the shorter edge. Reverse the scaling to get pixel coords.
                val smartDim = 1000
                val scale: Float
                val padX: Int
                val padY: Int
                if (screenWidth > screenHeight) {
                    // Landscape: width is longest edge
                    scale = screenWidth.toFloat() / smartDim
                    // padded height in model space
                    val modelHeight = (screenHeight.toFloat() / scale).toInt()
                    padY = (smartDim - modelHeight) / 2
                    padX = 0
                } else {
                    // Portrait: height is longest edge
                    scale = screenHeight.toFloat() / smartDim
                    val modelWidth = (screenWidth.toFloat() / scale).toInt()
                    padX = (smartDim - modelWidth) / 2
                    padY = 0
                }
                // Reverse: subtract padding, then multiply by scale
                val rx = ((x - padX).coerceAtLeast(0) * scale).toInt()
                val ry = ((y - padY).coerceAtLeast(0) * scale).toInt()
                Pair(rx, ry)
            }
            "pixel" -> Pair(x, y)
            "percentage" -> Pair(
                (x.toFloat() / 100f * screenWidth).toInt(),
                (y.toFloat() / 100f * screenHeight).toInt(),
            )
            else -> Pair(x, y) // default: treat as pixel
        }
        // Clamp to valid screen bounds
        val px = rawX.coerceIn(0, screenWidth - 1)
        val py = rawY.coerceIn(0, screenHeight - 1)
        return Pair(px, py)
    }

    /**
     * Convert pixel coordinates to normalized [0, 1000] (for recording).
     */
    fun pixelToNormalized(
        pixelX: Int,
        pixelY: Int,
        screenWidth: Int,
        screenHeight: Int,
    ): Pair<Int, Int> {
        if (screenWidth <= 0 || screenHeight <= 0) return Pair(0, 0)
        val nx = (pixelX.toFloat() * 1000f / screenWidth).toInt().coerceIn(0, 1000)
        val ny = (pixelY.toFloat() * 1000f / screenHeight).toInt().coerceIn(0, 1000)
        return Pair(nx, ny)
    }
}
