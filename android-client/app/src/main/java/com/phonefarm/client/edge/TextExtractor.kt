package com.phonefarm.client.edge

import android.graphics.Bitmap
import android.graphics.Rect
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.phonefarm.client.edge.model.OcrBlock
import com.phonefarm.client.edge.model.OcrResult
import dagger.hilt.android.scopes.ViewModelScoped
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * ML Kit OCR 文字提取器。
 *
 * 使用 Google ML Kit Text Recognition v2, 支持中英文。
 * 处理 720px 缩放后输入, 提取所有可见文字块及其位置。
 *
 * 性能: < 50ms (720p, ML Kit 硬件加速)
 */
@Singleton
class TextExtractor @Inject constructor() {

    private val recognizer: TextRecognizer = TextRecognition.getClient(
        ChineseTextRecognizerOptions.Builder().build()
    )

    private val targetWidth = 720

    /**
     * 从截图中提取文字。
     *
     * @param screenshot 原始截图
     * @return OCR 结果
     */
    suspend fun extract(screenshot: Bitmap): OcrResult = suspendCancellableCoroutine { cont ->
        // 缩放以提升速度
        val ratio = targetWidth.toFloat() / screenshot.width
        val scaledHeight = (screenshot.height * ratio).toInt()
        val scaled = Bitmap.createScaledBitmap(screenshot, targetWidth, scaledHeight, true)

        val image = InputImage.fromBitmap(scaled, 0)

        recognizer.process(image)
            .addOnSuccessListener { visionText ->
                val blocks = visionText.textBlocks.map { block ->
                    OcrBlock(
                        text = block.text,
                        bbox = Rect(
                            (block.boundingBox?.left ?: 0) / ratio.toInt(),
                            (block.boundingBox?.top ?: 0) / ratio.toInt(),
                            (block.boundingBox?.right ?: 0) / ratio.toInt(),
                            (block.boundingBox?.bottom ?: 0) / ratio.toInt()
                        ),
                        confidence = 0.7f
                    )
                }

                val totalChars = blocks.sumOf { it.text.length }

                scaled.recycle()

                cont.resume(
                    OcrResult(
                        blocks = blocks,
                        totalChars = totalChars
                    )
                )
            }
            .addOnFailureListener { e ->
                scaled.recycle()
                cont.resume(OcrResult(blocks = emptyList(), totalChars = 0))
            }
    }

    /**
     * 同步提取 (用于非协程上下文, 回退方案)。
     */
    fun extractBlocking(screenshot: Bitmap): OcrResult {
        val ratio = targetWidth.toFloat() / screenshot.width
        val scaledHeight = (screenshot.height * ratio).toInt()
        val scaled = Bitmap.createScaledBitmap(screenshot, targetWidth, scaledHeight, true)

        val image = InputImage.fromBitmap(scaled, 0)

        return try {
            val visionText = com.google.android.gms.tasks.Tasks.await(
                recognizer.process(image)
            )

            val blocks = visionText.textBlocks.map { block ->
                OcrBlock(
                    text = block.text,
                    bbox = Rect(
                        (block.boundingBox?.left ?: 0) / ratio.toInt(),
                        (block.boundingBox?.top ?: 0) / ratio.toInt(),
                        (block.boundingBox?.right ?: 0) / ratio.toInt(),
                        (block.boundingBox?.bottom ?: 0) / ratio.toInt()
                    ),
                    confidence = 0.7f
                )
            }

            OcrResult(
                blocks = blocks,
                totalChars = blocks.sumOf { it.text.length }
            )
        } catch (e: Exception) {
            OcrResult(blocks = emptyList(), totalChars = 0)
        } finally {
            scaled.recycle()
        }
    }
}
