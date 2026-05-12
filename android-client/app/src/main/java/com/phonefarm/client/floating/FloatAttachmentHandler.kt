package com.phonefarm.client.floating

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.ByteArrayOutputStream
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Handles image attachments in the float chat window.
 *
 * Users can attach screenshots or photos to their VLM task to provide
 * visual context (e.g., "automate this workflow" with a screenshot of
 * the target app).
 *
 * Supported attachment types:
 *   - Screenshot from notification / share intent
 *   - Photo from gallery picker
 *   - Pasted image from clipboard
 *
 * Attachments are resized for VLM input (max 2048px wide, JPEG 80% quality)
 * to stay within model input limits and reduce API costs.
 */
@Singleton
class FloatAttachmentHandler @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    companion object {
        private const val MAX_DIMENSION = 2048
        private const val JPEG_QUALITY = 80
        private const val THUMBNAIL_MAX = 320
    }

    private val _attachments = mutableListOf<FloatAttachment>()
    val attachments: List<FloatAttachment> get() = _attachments.toList()

    /**
     * Add an image attachment from a content URI (gallery, file picker, etc.).
     *
     * @param uri The content URI of the image.
     * @return Result containing the [FloatAttachment] on success, or an exception on failure.
     */
    suspend fun addAttachment(uri: Uri): Result<FloatAttachment> {
        return try {
            val contentResolver: ContentResolver = context.contentResolver

            // Read MIME type
            val mimeType = contentResolver.getType(uri) ?: "image/jpeg"

            // Decode only bounds first to determine dimensions
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            contentResolver.openInputStream(uri)?.use { stream ->
                BitmapFactory.decodeStream(stream, null, options)
            }

            // Calculate sample size
            val sampleSize = calculateSampleSize(options.outWidth, options.outHeight, MAX_DIMENSION)

            // Decode with sample size
            val decodeOptions = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
            }
            val bitmap = contentResolver.openInputStream(uri)?.use { stream ->
                decodeRotatedBitmap(stream, uri, contentResolver, decodeOptions)
            } ?: return Result.failure(Exception("Failed to decode image"))

            // Resize if still too large
            val finalBitmap = resizeIfNeeded(bitmap, MAX_DIMENSION, MAX_DIMENSION)

            // Generate thumbnail
            val thumbnail = resizeIfNeeded(finalBitmap, THUMBNAIL_MAX, THUMBNAIL_MAX)

            // Calculate approximate byte size
            val baos = ByteArrayOutputStream()
            finalBitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, baos)
            val sizeBytes = baos.size().toLong()

            val attachment = FloatAttachment(
                id = UUID.randomUUID().toString(),
                uri = uri,
                bitmap = finalBitmap,
                thumbnail = thumbnail,
                mimeType = mimeType,
                label = deriveLabel(uri),
                sizeBytes = sizeBytes,
            )
            _attachments.add(attachment)
            Result.success(attachment)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Add an image attachment from a [Bitmap] (e.g., captured screenshot).
     *
     * @param bitmap  The captured or received bitmap.
     * @param label   Optional description (e.g., "current screen").
     */
    suspend fun addBitmap(bitmap: Bitmap, label: String? = null): FloatAttachment {
        val finalBitmap = resizeIfNeeded(bitmap, MAX_DIMENSION, MAX_DIMENSION)
        val thumbnail = resizeIfNeeded(finalBitmap, THUMBNAIL_MAX, THUMBNAIL_MAX)

        val baos = ByteArrayOutputStream()
        finalBitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, baos)
        val sizeBytes = baos.size().toLong()

        val attachment = FloatAttachment(
            id = UUID.randomUUID().toString(),
            uri = null,
            bitmap = finalBitmap,
            thumbnail = thumbnail,
            mimeType = "image/jpeg",
            label = label ?: "captured",
            sizeBytes = sizeBytes,
        )
        _attachments.add(attachment)
        return attachment
    }

    /**
     * Remove an attachment by ID. Also recycles any Bitmaps held.
     */
    fun removeAttachment(attachmentId: String) {
        val attachment = _attachments.find { it.id == attachmentId } ?: return
        attachment.bitmap?.recycle()
        attachment.thumbnail?.recycle()
        _attachments.remove(attachment)
    }

    /**
     * Clear all attachments. Recycles all held Bitmaps.
     */
    fun clear() {
        for (attachment in _attachments) {
            attachment.bitmap?.recycle()
            attachment.thumbnail?.recycle()
        }
        _attachments.clear()
    }

    /**
     * Check if there are any attachments.
     */
    fun hasAttachments(): Boolean = _attachments.isNotEmpty()

    /**
     * Get the total size of all attachments in bytes.
     */
    fun totalSizeBytes(): Long = _attachments.sumOf { it.sizeBytes }

    // === Internal helpers ===

    private fun calculateSampleSize(width: Int, height: Int, maxDim: Int): Int {
        var sampleSize = 1
        while (width / sampleSize > maxDim || height / sampleSize > maxDim) {
            sampleSize *= 2
        }
        return sampleSize
    }

    private fun resizeIfNeeded(bitmap: Bitmap, maxWidth: Int, maxHeight: Int): Bitmap {
        if (bitmap.width <= maxWidth && bitmap.height <= maxHeight) return bitmap

        val scale = minOf(
            maxWidth.toFloat() / bitmap.width,
            maxHeight.toFloat() / bitmap.height,
        )
        val newWidth = (bitmap.width * scale).toInt()
        val newHeight = (bitmap.height * scale).toInt()
        return Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
    }

    private fun decodeRotatedBitmap(
        inputStream: java.io.InputStream,
        uri: Uri,
        contentResolver: ContentResolver,
        options: BitmapFactory.Options,
    ): Bitmap {
        val bitmap = BitmapFactory.decodeStream(inputStream, null, options) ?: throw Exception("Decode failed")

        // Handle EXIF rotation
        return try {
            val exifStream = contentResolver.openInputStream(uri) ?: return bitmap
            val exif = ExifInterface(exifStream)
            val orientation = exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            )
            val degrees = when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
            if (degrees != 0f) {
                val matrix = Matrix().apply { postRotate(degrees) }
                Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true).also {
                    if (it != bitmap) bitmap.recycle()
                }
            } else {
                bitmap
            }
        } catch (e: Exception) {
            bitmap
        }
    }

    private fun deriveLabel(uri: Uri): String {
        val lastSegment = uri.lastPathSegment ?: return "attachment"
        // Extract filename from content URI
        return if (lastSegment.contains('.')) {
            lastSegment.substringAfterLast('/')
        } else {
            "image"
        }
    }
}

/**
 * An image attachment in the float chat.
 */
data class FloatAttachment(
    val id: String,
    val uri: Uri?,
    val bitmap: Bitmap?,
    val thumbnail: Bitmap?,
    val mimeType: String,
    val label: String?,
    val sizeBytes: Long,
)
