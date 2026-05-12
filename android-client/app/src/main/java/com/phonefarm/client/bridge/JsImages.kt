package com.phonefarm.client.bridge

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import com.phonefarm.client.service.PhoneFarmAccessibilityService
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import javax.inject.Singleton
import android.util.Base64

/**
 * JavaScript-bridge implementation of the AutoX `images` global object.
 *
 * Provides image capture and manipulation methods to Rhino scripts:
 *   images.captureScreen(), images.scale(img, w, h), images.toBase64(img, format),
 *   images.read(path), images.write(img, path, format, quality)
 */
@Singleton
class JsImages @Inject constructor() {

    private val screenshotHistory = mutableListOf<Bitmap>()

    /**
     * TODO: Capture the current screen as a Bitmap.
     * Wraps PhoneFarmAccessibilityService.captureScreen().
     * Returns null if the service is not available or capture fails.
     */
    fun captureScreen(scale: Float = 0.5f, quality: Int = 80): Bitmap? {
        val bitmap = PhoneFarmAccessibilityService.instance?.captureScreen(scale, quality)
        if (bitmap != null) {
            synchronized(screenshotHistory) {
                screenshotHistory.add(bitmap)
                if (screenshotHistory.size > 20) {
                    val oldest = screenshotHistory.removeAt(0)
                    if (!oldest.isRecycled) oldest.recycle()
                }
            }
        }
        return bitmap
    }

    /**
     * TODO: Scale [bitmap] to [width] x [height] using bilinear filtering.
     * Returns a new Bitmap; the caller is responsible for recycling.
     */
    fun scale(bitmap: Bitmap, width: Int, height: Int): Bitmap {
        return Bitmap.createScaledBitmap(bitmap, width, height, true)
    }

    /**
     * TODO: Encode [bitmap] as a base64 string in the given format.
     * Supported formats: "png", "jpg"/"jpeg", "webp".
     */
    fun toBase64(bitmap: Bitmap, format: String = "jpeg", quality: Int = 80): String {
        val compressFormat = when (format.lowercase()) {
            "png" -> Bitmap.CompressFormat.PNG
            "webp" -> Bitmap.CompressFormat.WEBP_LOSSLESS.takeIf { quality >= 100 }
                ?: Bitmap.CompressFormat.WEBP_LOSSY
            else -> Bitmap.CompressFormat.JPEG
        }
        val stream = ByteArrayOutputStream()
        bitmap.compress(compressFormat, quality.coerceIn(0, 100), stream)
        return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }

    /**
     * TODO: Write [bitmap] to a local file path as PNG/JPEG/WEBP.
     */
    fun write(bitmap: Bitmap, path: String, format: String = "jpeg", quality: Int = 80): Boolean {
        return try {
            val file = java.io.File(path)
            file.parentFile?.mkdirs()
            val compressFormat = when (format.lowercase()) {
                "png" -> Bitmap.CompressFormat.PNG
                "webp" -> Bitmap.CompressFormat.WEBP_LOSSLESS.takeIf { quality >= 100 }
                    ?: Bitmap.CompressFormat.WEBP_LOSSY
                else -> Bitmap.CompressFormat.JPEG
            }
            file.outputStream().use { stream ->
                bitmap.compress(compressFormat, quality.coerceIn(0, 100), stream)
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * TODO: Read a Bitmap from a local file path.
     */
    fun read(path: String): Bitmap? {
        return try {
            android.graphics.BitmapFactory.decodeFile(path)
        } catch (_: Exception) {
            null
        }
    }

    /**
     * TODO: Get the color of a pixel at (x, y) as an ARGB int.
     */
    fun pixel(bitmap: Bitmap, x: Int, y: Int): Int {
        return bitmap.getPixel(x, y)
    }

    /**
     * Find a template image within a source bitmap using basic sliding-window
     * pixel comparison. Returns the (x, y) top-left coordinates of the best match,
     * or null if no match exceeds the similarity threshold.
     *
     * The algorithm compares pixels at every possible position and counts matches.
     * For performance, pixels are compared with a tolerance (default 16 out of 255).
     * A match is accepted when the match ratio exceeds [threshold] (default 0.9).
     *
     * @param source The larger image to search within.
     * @param template The smaller image to find.
     * @param threshold Minimum match ratio (0.0–1.0) required for a positive result. Default 0.9.
     * @param tolerance Per-channel colour tolerance (0–255). Default 16.
     * @return The (x, y) coordinates of the best match, or null.
     */
    fun findImage(
        source: Bitmap,
        template: Bitmap,
        threshold: Double = 0.9,
        tolerance: Int = 16,
    ): Pair<Int, Int>? {
        val sw = source.width
        val sh = source.height
        val tw = template.width
        val th = template.height

        if (tw > sw || th > sh) return null

        val srcPixels = IntArray(sw * sh)
        val tplPixels = IntArray(tw * th)
        source.getPixels(srcPixels, 0, sw, 0, 0, sw, sh)
        template.getPixels(tplPixels, 0, tw, 0, 0, tw, th)

        val thresholdCount = (tw * th * threshold).toInt()
        var bestX = -1
        var bestY = -1
        var bestCount = 0

        for (y in 0..(sh - th)) {
            for (x in 0..(sw - tw)) {
                var matchCount = 0
                earlyExit@ for (ty in 0 until th) {
                    val rowOffset = (y + ty) * sw + x
                    for (tx in 0 until tw) {
                        val srcPixel = srcPixels[rowOffset + tx]
                        val tplPixel = tplPixels[ty * tw + tx]
                        if (pixelsMatch(srcPixel, tplPixel, tolerance)) {
                            matchCount++
                        }
                        // Early exit if this position cannot beat the current best
                        val remaining = (th - ty) * tw - tx
                        if (matchCount + remaining < bestCount) break@earlyExit
                        if (matchCount + remaining < thresholdCount) break@earlyExit
                    }
                }
                if (matchCount > bestCount) {
                    bestCount = matchCount
                    bestX = x
                    bestY = y
                }
            }
        }

        return if (bestCount >= thresholdCount) Pair(bestX, bestY) else null
    }

    /**
     * Compare two ARGB pixels and return true if all colour channels are within
     * [tolerance] of each other. Alpha is ignored.
     */
    private fun pixelsMatch(pixel1: Int, pixel2: Int, tolerance: Int): Boolean {
        val dr = kotlin.math.abs(((pixel1 shr 16) and 0xFF) - ((pixel2 shr 16) and 0xFF))
        val dg = kotlin.math.abs(((pixel1 shr 8) and 0xFF) - ((pixel2 shr 8) and 0xFF))
        val db = kotlin.math.abs((pixel1 and 0xFF) - (pixel2 and 0xFF))
        return dr <= tolerance && dg <= tolerance && db <= tolerance
    }

    /**
     * TODO: Rotate [bitmap] by [degrees] clockwise.
     */
    fun rotate(bitmap: Bitmap, degrees: Float): Bitmap {
        val matrix = Matrix().apply { postRotate(degrees) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }
}
