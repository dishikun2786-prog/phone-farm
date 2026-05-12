package com.phonefarm.client.vlm

import android.graphics.Bitmap
import android.util.Base64
import com.phonefarm.client.model.ModelManager
import javax.inject.Inject
import javax.inject.Singleton
import java.io.ByteArrayOutputStream

/**
 * Local on-device VLM inference client.
 *
 * Uses llama.cpp JNI bindings to run VLM models entirely on-device,
 * eliminating cloud API latency and data-privacy concerns.
 *
 * Supported quantization formats: Q4_K_M, Q5_K_M, Q8_0.
 * Supported backends: CPU (fallback), Vulkan, NNAPI, QNN, NeuroPilot, HiAI.
 */
@Singleton
class LocalVlmClient @Inject constructor(
    private val modelManager: ModelManager,
) {

    companion object {
        init {
            try {
                System.loadLibrary("llama_android")
            } catch (_: UnsatisfiedLinkError) {
                // llama.cpp JNI library not available; local inference disabled
            }
        }

        /** Whether the native library was successfully loaded. */
        val isNativeAvailable: Boolean by lazy {
            try {
                System.loadLibrary("llama_android")
                true
            } catch (_: UnsatisfiedLinkError) {
                false
            }
        }
    }

    // ===== JNI native methods =====

    /**
     * Load a model from a .gguf file path.
     * @return Native pointer (llama_model*), or 0 on failure.
     */
    private external fun nativeLoadModel(
        modelPath: String,
        nGpuLayers: Int,
        backend: String,
    ): Long

    /**
     * Free a loaded model.
     */
    private external fun nativeFreeModel(modelPtr: Long)

    /**
     * Create a context for inference.
     * @return Native pointer (llama_context*), or 0 on failure.
     */
    private external fun nativeCreateContext(
        modelPtr: Long,
        nCtx: Int,
        nBatch: Int,
    ): Long

    /**
     * Free a context.
     */
    private external fun nativeFreeContext(ctxPtr: Long)

    /**
     * Encode an image (raw RGB bytes) into the model's vision encoder.
     * @return Number of image tokens, or 0 on failure.
     */
    private external fun nativeEncodeImage(
        ctxPtr: Long,
        imageData: ByteArray,
        width: Int,
        height: Int,
        channels: Int,
    ): Int

    /**
     * Run text generation until stop token or max tokens.
     * @return Generated text.
     */
    private external fun nativeGenerate(
        ctxPtr: Long,
        prompt: String,
        maxTokens: Int,
        temperature: Float,
        topP: Float,
    ): String

    // ===== Public API =====

    /**
     * Execute local VLM inference.
     *
     * @param screenshot   Current device screenshot as a Bitmap.
     * @param taskContext  User's natural-language task description.
     * @param memoryHints  Relevant facts from MemoryManager.
     * @param modelId      Registered model ID from ModelRegistry.
     * @return Structured [VlmResponse] from the local model.
     */
    suspend fun execute(
        screenshot: Bitmap,
        taskContext: String,
        memoryHints: String,
        modelId: String,
    ): VlmResponse {
        if (!isNativeAvailable) {
            throw UnsupportedOperationException(
                "Local VLM inference is not available: llama.cpp JNI library not loaded"
            )
        }

        // Build the prompt
        val prompt = buildPrompt(taskContext, memoryHints)

        // Load model (or use cached pointer)
        val modelPtr = modelManager.loadModel(modelId)
        if (modelPtr == 0L) {
            throw IllegalStateException("Failed to load local model: $modelId")
        }

        return try {
            // Create inference context
            val ctxPtr = nativeCreateContext(modelPtr, nCtx = 2048, nBatch = 512)
            if (ctxPtr == 0L) {
                throw IllegalStateException("Failed to create inference context")
            }

            try {
                // Encode screenshot image
                val (imageBytes, width, height) = bitmapToRawRGB(screenshot)
                val imageTokens = nativeEncodeImage(ctxPtr, imageBytes, width, height, 3)

                // Combine image tokens placeholder with text prompt
                val fullPrompt = if (imageTokens > 0) {
                    // Some llama.cpp VLMs use <image> token or img placeholder
                    prompt
                } else {
                    // Fallback: encode image as base64 in text (less efficient but universal)
                    val base64Image = bitmapToBase64(screenshot)
                    "$prompt\n\n[Image data: data:image/jpeg;base64,$base64Image]"
                }

                val startTime = System.currentTimeMillis()
                val output = nativeGenerate(
                    ctxPtr = ctxPtr,
                    prompt = fullPrompt,
                    maxTokens = 512,
                    temperature = 0.1f,
                    topP = 0.9f,
                )
                val latencyMs = System.currentTimeMillis() - startTime

                VlmResponse(
                    rawOutput = output,
                    thinking = extractThinking(output),
                    actionJson = output,
                    tokenUsage = TokenUsage(
                        promptTokens = estimateTokenCount(fullPrompt),
                        completionTokens = estimateTokenCount(output),
                        totalTokens = estimateTokenCount(fullPrompt) + estimateTokenCount(output),
                    ),
                    latencyMs = latencyMs,
                    modelName = modelId,
                )
            } finally {
                nativeFreeContext(ctxPtr)
            }
        } catch (e: Exception) {
            throw RuntimeException("Local VLM inference failed: ${e.message}", e)
        }
    }

    /**
     * Check whether local inference is available on this device.
     */
    fun isAvailable(): Boolean = isNativeAvailable

    // ===== Helpers =====

    private fun buildPrompt(taskContext: String, memoryHints: String): String {
        return buildString {
            appendLine("You are a smartphone GUI automation assistant controlling an Android device.")
            appendLine("Analyze the screen and output the next action in JSON format.")
            appendLine()
            appendLine("Available actions:")
            appendLine("- tap at (x, y) → {\"action\":\"tap\",\"x\":<int>,\"y\":<int>}")
            appendLine("- swipe → {\"action\":\"swipe\",\"x1\":<int>,\"y1\":<int>,\"x2\":<int>,\"y2\":<int>}")
            appendLine("- type → {\"action\":\"type\",\"text\":\"<string>\"}")
            appendLine("- back → {\"action\":\"back\"}")
            appendLine("- home → {\"action\":\"home\"}")
            appendLine("- launch → {\"action\":\"launch\",\"package\":\"<pkg>\"}")
            appendLine("- finish → {\"action\":\"terminate\",\"message\":\"<reason>\"}")
            appendLine()
            appendLine("Task: $taskContext")
            if (memoryHints.isNotBlank()) {
                appendLine("Memory: $memoryHints")
            }
            appendLine()
            appendLine("Output the next action as JSON only.")
        }
    }

    /**
     * Convert bitmap to raw RGB byte array.
     * Most VLM vision encoders expect 224x224 or 336x336 RGB input.
     */
    private fun bitmapToRawRGB(bitmap: Bitmap): Triple<ByteArray, Int, Int> {
        val targetWidth = 336
        val targetHeight = 336
        val scaled = Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true)
        val pixels = IntArray(targetWidth * targetHeight)
        scaled.getPixels(pixels, 0, targetWidth, 0, 0, targetWidth, targetHeight)
        scaled.recycle()

        val bytes = ByteArray(targetWidth * targetHeight * 3)
        for (i in pixels.indices) {
            val pixel = pixels[i]
            bytes[i * 3] = ((pixel shr 16) and 0xFF).toByte()     // R
            bytes[i * 3 + 1] = ((pixel shr 8) and 0xFF).toByte()  // G
            bytes[i * 3 + 2] = (pixel and 0xFF).toByte()           // B
        }
        return Triple(bytes, targetWidth, targetHeight)
    }

    private fun bitmapToBase64(bitmap: Bitmap, quality: Int = 85): String {
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }

    private fun extractThinking(output: String): String {
        val jsonStart = output.indexOf('{')
        return if (jsonStart > 0) output.substring(0, jsonStart).trim() else ""
    }

    /**
     * Rough token estimation: ~4 chars per token for English, ~1.5 for Chinese.
     */
    private fun estimateTokenCount(text: String): Int {
        var count = 0
        for (ch in text) {
            count += if (ch.code > 127) 2 else 1
        }
        return count / 4
    }
}
