package com.phonefarm.client.remote

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.DisplayMetrics
import android.view.Display
import android.view.WindowManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

/**
 * Standalone screenshot capture via MediaProjection + ImageReader.
 *
 * Provides a fallback screenshot mechanism when the accessibility service's
 * [takeScreenshot] is unavailable (pre-API-34) or when the accessibility
 * service is not connected.
 *
 * Requires the user to have granted screen capture consent via
 * [MediaProjectionManager.createScreenCaptureIntent], which returns
 * a result code + data that must be passed to [initialize].
 *
 * Architecture:
 *  1. [initialize] — create MediaProjection from consent intent result
 *  2. [capture] — create a temporary VirtualDisplay + ImageReader → grab frame → Bitmap
 *  3. [release] — tear down MediaProjection
 */
@Singleton
class RemoteScreenshotCapture @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private var mediaProjection: MediaProjection? = null

    private val displayWidth: Int
    private val displayHeight: Int
    private val displayDpi: Int

    init {
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = wm.currentWindowMetrics.bounds
            DisplayMetrics().also { dm ->
                dm.widthPixels = bounds.width()
                dm.heightPixels = bounds.height()
                dm.densityDpi = context.resources.configuration.densityDpi
            }
        } else {
            DisplayMetrics().also { dm ->
                @Suppress("DEPRECATION")
                wm.defaultDisplay.getRealMetrics(dm)
            }
        }
        displayWidth = metrics.widthPixels
        displayHeight = metrics.heightPixels
        displayDpi = metrics.densityDpi
    }

    /**
     * Create the screen capture consent Intent.
     *
     * The caller must launch this for result and pass the result code + data
     * to [initialize].
     *
     * @return Intent to launch via startActivityForResult.
     */
    fun createConsentIntent(): Intent {
        val mpManager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE)
                as MediaProjectionManager
        return mpManager.createScreenCaptureIntent()
    }

    /**
     * Initialize MediaProjection from the consent result.
     *
     * @param resultCode   The result code from onActivityResult.
     * @param data         The intent data from onActivityResult.
     * @return true if initialization succeeded.
     */
    fun initialize(resultCode: Int, data: Intent): Boolean {
        return try {
            val mpManager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE)
                    as MediaProjectionManager
            mediaProjection = mpManager.getMediaProjection(resultCode, data)
            mediaProjection != null
        } catch (e: Exception) {
            android.util.Log.e("RemoteScreenshot", "MediaProjection init failed", e)
            false
        }
    }

    /**
     * Capture a single screenshot frame.
     *
     * Creates a temporary VirtualDisplay backed by an ImageReader, acquires
     * one frame, converts it to a JPEG Bitmap, and tears down the VirtualDisplay.
     *
     * @param quality  JPEG quality 0-100.
     * @param scale    Scale factor applied to dimensions (0.25 = quarter resolution).
     * @return [RemoteCommandResult.Success] with JPEG bytes, or [RemoteCommandResult.Error].
     */
    suspend fun capture(
        quality: Int = 80,
        scale: Float = 0.5f,
    ): RemoteCommandResult {
        val mp = mediaProjection
            ?: return RemoteCommandResult.Error("MediaProjection not initialized. Call initialize() first.")

        val width = (displayWidth * scale).toInt().coerceAtLeast(1)
        val height = (displayHeight * scale).toInt().coerceAtLeast(1)

        val imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 1)
        val virtualDisplay = mp.createVirtualDisplay(
            "PhoneFarm-Screenshot",
            width, height, displayDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.surface,
            null, null,
        )

        return try {
            val image: Image = suspendCoroutine { cont ->
                imageReader.setOnImageAvailableListener({ reader ->
                    val img = reader.acquireLatestImage()
                    if (img != null) {
                        cont.resume(img)
                    }
                }, Handler(Looper.getMainLooper()))
            }

            val bitmap = imageToBitmap(image)
            image.close()

            val bos = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, bos)
            bitmap.recycle()

            RemoteCommandResult.Success(
                output = "Screenshot captured: ${width}x${height}",
                data = bos.toByteArray(),
            )
        } catch (e: Exception) {
            RemoteCommandResult.Error("Screenshot capture failed: ${e.message}")
        } finally {
            virtualDisplay?.release()
            imageReader.close()
        }
    }

    /**
     * Convert an ImageReader Image (RGBA_8888) to a Bitmap.
     */
    private fun imageToBitmap(image: Image): Bitmap {
        val planes = image.planes
        val buffer: ByteBuffer = planes[0].buffer
        val pixelStride = planes[0].pixelStride
        val rowStride = planes[0].rowStride
        val rowPadding = rowStride - pixelStride * image.width

        val bitmap = Bitmap.createBitmap(
            image.width + rowPadding / pixelStride,
            image.height,
            Bitmap.Config.ARGB_8888,
        )
        bitmap.copyPixelsFromBuffer(buffer)

        // Crop padding bytes.
        return if (rowPadding > 0) {
            Bitmap.createBitmap(bitmap, 0, 0, image.width, image.height)
        } else {
            bitmap
        }
    }

    /**
     * Release the MediaProjection. Must be called when done.
     */
    fun release() {
        mediaProjection?.stop()
        mediaProjection = null
    }
}
