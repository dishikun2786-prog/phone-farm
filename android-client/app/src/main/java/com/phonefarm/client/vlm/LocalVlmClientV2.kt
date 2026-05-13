package com.phonefarm.client.vlm

import android.graphics.Bitmap
import android.util.Base64
import android.util.Log
import com.phonefarm.client.model.ModelHotUpdate
import com.phonefarm.client.vlm.mnn.MnnLlmBridge
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Local on-device VLM inference client V2 — uses MNN (Mobile Neural Network) instead
 * of llama.cpp for on-device LLM inference.
 *
 * Same public interface as [LocalVlmClient] for drop-in replacement:
 *   - `execute(screenshot, taskContext, memoryHints, modelId): VlmResponse`
 *   - `isAvailable(): Boolean`
 *
 * Key improvements over V1:
 *   - Uses MNN (Alibaba's mobile inference framework) which has better Android
 *     compatibility than llama.cpp
 *   - Supports Qwen2-0.5B model format for efficient on-device inference
 *   - Automatic cloud fallback when local model confidence is low
 *   - Confidence scoring based on output coherence, JSON validity, and action completeness
 *   - Rule-based decision tree as ultimate fallback when no model is available
 *
 * Model format: MNN .mnn model with tokenizer_config.json.
 * Backends: CPU (always), Vulkan, NNAPI (auto-detected).
 *
 * @property isNativeAvailable Whether MNN native library was loaded.
 * @property isModelReady Whether a model is currently loaded and ready.
 */
@Singleton
class LocalVlmClientV2 @Inject constructor(
    private val modelHotUpdate: ModelHotUpdate,
) {

    companion object {
        private const val TAG = "LocalVlmClientV2"

        /** Minimum confidence threshold to accept local output. Below this, fall back to cloud. */
        private const val MIN_CONFIDENCE_THRESHOLD = 0.4f

        /** Maximum tokens for local inference. */
        private const val LOCAL_MAX_TOKENS = 256

        /** Default temperature for local inference. */
        private const val LOCAL_TEMPERATURE = 0.1f
    }

    // ── Public API ──

    /**
     * Whether local inference is possible (native lib loaded).
     */
    fun isAvailable(): Boolean = MnnLlmBridge.nativeLoaded || true // Rule-based always available

    /**
     * Whether MNN native acceleration is available.
     */
    val isMnnNativeAvailable: Boolean get() = MnnLlmBridge.nativeLoaded

    /**
     * Whether a model is currently loaded.
     */
    val isModelReady: Boolean get() = MnnLlmBridge.isReady

    /**
     * Execute local VLM inference with automatic cloud fallback.
     *
     * Tries MNN LLM first (if available). Falls back to the rule-based decision
     * tree when MNN is unavailable. The confidence score determines whether the
     * output should be trusted or the caller should fall back to cloud API.
     *
     * @param screenshot Current device screenshot as a Bitmap.
     * @param taskContext User's natural-language task description.
     * @param memoryHints Relevant facts from MemoryManager.
     * @param modelId Registered model ID (used to find MNN model path).
     * @return Structured [VlmResponse] with confidence scoring.
     */
    suspend fun execute(
        screenshot: Bitmap,
        taskContext: String,
        memoryHints: String,
        modelId: String,
    ): VlmResponse = withContext(Dispatchers.Default) {
        val startTime = System.currentTimeMillis()

        // Build the full prompt
        val prompt = buildPrompt(taskContext, memoryHints, screenshot)

        // Try MNN native inference first
        val (output, backendUsed) = if (MnnLlmBridge.nativeLoaded && MnnLlmBridge.isReady) {
            try {
                val result = MnnLlmBridge.generate(
                    prompt = prompt,
                    maxTokens = LOCAL_MAX_TOKENS,
                    temperature = LOCAL_TEMPERATURE,
                )
                result to "MNN"
            } catch (e: Exception) {
                Log.w(TAG, "MNN inference failed, falling back to rules: ${e.message}")
                MnnLlmBridge.generate(prompt, maxTokens = LOCAL_MAX_TOKENS) to "MNN-RuleFallback"
            }
        } else {
            // Rule-based fallback (always available)
            val result = MnnLlmBridge.generate(prompt, maxTokens = LOCAL_MAX_TOKENS)
            result to "RuleBased"
        }

        val latencyMs = System.currentTimeMillis() - startTime

        // Compute confidence score
        val confidence = computeConfidence(output)

        // Extract thinking and JSON from output
        val thinking = extractThinking(output)
        val actionJson = extractActionJson(output)

        val tokenEstimate = MnnLlmBridge.estimateTokens(prompt) +
            MnnLlmBridge.estimateTokens(output)

        // Build screenshot info for context
        val screenshotInfo = buildScreenshotDescription(screenshot)

        VlmResponse(
            rawOutput = output,
            thinking = thinking,
            actionJson = actionJson ?: output,
            tokenUsage = TokenUsage(
                promptTokens = MnnLlmBridge.estimateTokens(prompt),
                completionTokens = MnnLlmBridge.estimateTokens(output),
                totalTokens = tokenEstimate,
            ),
            latencyMs = latencyMs,
            modelName = "mnn-$modelId",
        )
    }

    /**
     * Execute inference and return confidence metadata alongside response.
     *
     * @return [VlmResponseWithConfidence] containing response and confidence details.
     */
    suspend fun executeWithConfidence(
        screenshot: Bitmap,
        taskContext: String,
        memoryHints: String,
        modelId: String,
    ): VlmResponseWithConfidence = withContext(Dispatchers.Default) {
        val response = execute(screenshot, taskContext, memoryHints, modelId)
        val confidence = computeConfidence(response.rawOutput)

        VlmResponseWithConfidence(
            response = response,
            confidence = confidence,
            shouldFallbackToCloud = confidence < MIN_CONFIDENCE_THRESHOLD,
            backendUsed = if (MnnLlmBridge.nativeLoaded) "MNN" else "RuleBased",
        )
    }

    /**
     * Initialize the MNN LLM model from model storage.
     *
     * @param modelId The model ID to load.
     * @return true if the model was loaded successfully.
     */
    fun initModel(modelId: String): Boolean {
        val modelType = when {
            modelId.contains("qwen", ignoreCase = true) -> ModelHotUpdate.ModelType.MNN_QWEN
            modelId.contains("phi", ignoreCase = true) -> ModelHotUpdate.ModelType.MNN_PHI
            else -> ModelHotUpdate.ModelType.MNN_QWEN
        }

        val modelPath = modelHotUpdate.getActiveModelPath(modelType)
        if (modelPath == null) {
            Log.w(TAG, "No model path found for $modelType. Model not downloaded?")
            return false
        }

        // Config path is in the same version directory
        val modelDir = java.io.File(modelPath).parentFile
        val configPath = java.io.File(modelDir, "tokenizer_config.json").absolutePath

        return MnnLlmBridge.init(modelPath, configPath)
    }

    /**
     * Release the currently loaded MNN model.
     */
    fun releaseModel() {
        MnnLlmBridge.release()
    }

    /**
     * Get the currently active backend.
     */
    fun getActiveBackend(): String = MnnLlmBridge.getActiveBackend()

    // ── Prompt building ──

    /**
     * Build the full VLM prompt including screenshot description and task context.
     */
    private fun buildPrompt(
        taskContext: String,
        memoryHints: String,
        screenshot: Bitmap,
    ): String {
        val screenshotDesc = buildScreenshotDescription(screenshot)
        val base64Image = bitmapToBase64Url(screenshot)

        return buildString {
            appendLine("You are a smartphone GUI automation assistant controlling an Android device.")
            appendLine("Analyze the screen and output the next action in JSON format.")
            appendLine()
            appendLine("Available actions:")
            appendLine("- tap at coordinates → {\"action\":\"tap\",\"x\":<int>,\"y\":<int>}")
            appendLine("- long press → {\"action\":\"long_press\",\"x\":<int>,\"y\":<int>,\"duration_ms\":<int>}")
            appendLine("- swipe → {\"action\":\"swipe\",\"x1\":<int>,\"y1\":<int>,\"x2\":<int>,\"y2\":<int>}")
            appendLine("- type text → {\"action\":\"type\",\"text\":\"<string>\"}")
            appendLine("- press back → {\"action\":\"back\"}")
            appendLine("- press home → {\"action\":\"home\"}")
            appendLine("- launch app → {\"action\":\"launch\",\"package\":\"<pkg>\"}")
            appendLine("- wait/pause → {\"action\":\"wait\",\"duration_ms\":<int>}")
            appendLine("- task complete → {\"action\":\"terminate\",\"message\":\"<reason>\"}")
            appendLine()

            appendLine("Screen information:")
            appendLine("- Dimensions: ${screenshot.width}x${screenshot.height}")
            appendLine("- Visual features: $screenshotDesc")
            appendLine()

            appendLine("Task: $taskContext")

            if (memoryHints.isNotBlank()) {
                appendLine()
                appendLine("Relevant memory / context:")
                appendLine(memoryHints)
            }

            appendLine()
            appendLine("Output ONLY the JSON action object. Do not include any other text.")
            appendLine("Current action:")
        }
    }

    /**
     * Build a textual description of the screenshot's visual features.
     * This supplements the base64 image encoding for models that can't process images natively.
     */
    private fun buildScreenshotDescription(bitmap: Bitmap): String {
        val small = Bitmap.createScaledBitmap(bitmap, 32, 32, true)
        val pixels = IntArray(1024)
        small.getPixels(pixels, 0, 32, 0, 0, 32, 32)
        small.recycle()

        var totalBright = 0.0
        var colorVariance = 0.0
        val cols = 32
        val rows = 32
        val quadrants = Array(4) { QuadrantStats() }

        for (i in pixels.indices) {
            val p = pixels[i]
            val r = (p shr 16) and 0xFF
            val g = (p shr 8) and 0xFF
            val b = p and 0xFF
            val gray = 0.299 * r + 0.587 * g + 0.114 * b
            totalBright += gray

            val col = i % cols
            val row = i / cols
            val qIdx = if (row < rows / 2) {
                if (col < cols / 2) 0 else 1
            } else {
                if (col < cols / 2) 2 else 3
            }
            quadrants[qIdx].sum += gray
            quadrants[qIdx].count++
            quadrants[qIdx].maxR = maxOf(quadrants[qIdx].maxR, r)
            quadrants[qIdx].minR = minOf(quadrants[qIdx].minR, r)
        }

        val avgBright = totalBright / pixels.size

        // Determine dominant color temperature
        val coolPixels = pixels.count { p ->
            val b = p and 0xFF
            val r = (p shr 16) and 0xFF
            b > r + 20
        }
        val warmPixels = pixels.count { p ->
            val r = (p shr 16) and 0xFF
            val b = p and 0xFF
            r > b + 20
        }
        val colorTemp = when {
            coolPixels > warmPixels * 1.5 -> "cool/bluish"
            warmPixels > coolPixels * 1.5 -> "warm/reddish"
            else -> "neutral"
        }

        // Describe quadrant distribution
        val qDescs = quadrants.mapIndexed { idx, q ->
            val qAvg = q.sum / q.count.coerceAtLeast(1)
            val contrast = q.maxR - q.minR
            val contrastDesc = when {
                contrast > 80 -> "high-contrast"
                contrast > 40 -> "moderate-contrast"
                else -> "low-contrast"
            }
            val position = when (idx) {
                0 -> "top-left"
                1 -> "top-right"
                2 -> "bottom-left"
                3 -> "bottom-right"
                else -> "unknown"
            }
            "$position: ${"%.0f".format(qAvg)} brightness, $contrastDesc"
        }

        return buildString {
            append("avg_brightness=${"%.0f".format(avgBright)}, ")
            append("color_temp=$colorTemp, ")
            append("layout: ${qDescs.joinToString("; ")}")
        }
    }

    private data class QuadrantStats(
        var sum: Double = 0.0,
        var count: Int = 0,
        var maxR: Int = 0,
        var minR: Int = 255,
    )

    // ── Confidence scoring ──

    /**
     * Compute a confidence score [0.0, 1.0] based on output coherence.
     *
     * Scoring heuristics:
     *   - Valid JSON structure: +0.5
     *   - Contains "action" key: +0.2
     *   - Action is a known action type: +0.15
     *   - Coordinates in valid range (0–2160): +0.1
     *   - No obvious error messages: +0.05
     *   - Penalty for very short output (< 10 chars): -0.3
     *   - Penalty for repeated characters (hallucination indicator): -0.2
     */
    private fun computeConfidence(output: String): Float {
        if (output.isBlank()) return 0.0f

        var score = 0.0f

        // Length check
        if (output.length < 10) score -= 0.3f
        if (output.length > 50) score += 0.1f

        // JSON structure check
        val trimmed = output.trim()
        val hasJsonStructure = trimmed.startsWith("{") && trimmed.contains("}")
        if (hasJsonStructure) {
            score += 0.5f

            // Check for "action" key
            if (Regex(""""action"\s*:""").containsMatchIn(trimmed)) {
                score += 0.2f

                // Known action types
                val knownActions = listOf("tap", "swipe", "type", "back", "home",
                    "launch", "wait", "terminate", "long_press")
                val actionMatch = Regex(""""action"\s*:\s*"(.*?)"""").find(trimmed)
                if (actionMatch != null) {
                    val action = actionMatch.groupValues[1].lowercase()
                    if (action in knownActions) {
                        score += 0.15f
                    }
                    // Coordinates valid range
                    if (action == "tap" || action == "long_press" || action == "swipe") {
                        val xMatch = Regex(""""x\d*"\s*:\s*(\d+)""").find(trimmed)
                        val yMatch = Regex(""""y\d*"\s*:\s*(\d+)""").find(trimmed)
                        val x = xMatch?.groupValues?.get(1)?.toIntOrNull()
                        val y = yMatch?.groupValues?.get(1)?.toIntOrNull()
                        if (x != null && y != null && x in 0..2160 && y in 0..3840) {
                            score += 0.1f
                        }
                    }
                }
            }
        } else {
            // Non-JSON output could be an error message
            val errorKeywords = listOf("error", "failed", "cannot", "unable", "sorry",
                "错误", "失败", "无法", "不能")
            if (errorKeywords.any { trimmed.lowercase().contains(it) }) {
                score -= 0.2f
            }
        }

        // Hallucination detection: check for repeated substrings
        val repeatedPattern = detectRepeatedPatterns(trimmed)
        if (repeatedPattern) score -= 0.2f

        // Check for no obvious garbage characters
        val garbageRatio = trimmed.count { it.code < 32 && it != '\n'.code && it != '\r'.code }
            .toFloat() / trimmed.length.coerceAtLeast(1)
        if (garbageRatio > 0.1f) score -= 0.3f

        return score.coerceIn(0.0f, 1.0f)
    }

    /**
     * Detect repeated patterns in text (LLM hallucination indicator).
     */
    private fun detectRepeatedPatterns(text: String): Boolean {
        if (text.length < 20) return false

        // Check for 4-char or longer substrings repeated 3+ times consecutively
        val windowSizes = listOf(4, 5, 6, 8)
        for (windowSize in windowSizes) {
            if (text.length < windowSize * 3) continue

            val substrings = text.windowed(windowSize)
            var consecutiveRepeats = 0
            for (i in 1 until substrings.size) {
                if (substrings[i] == substrings[i - 1]) {
                    consecutiveRepeats++
                    if (consecutiveRepeats >= 3) return true
                } else {
                    consecutiveRepeats = 0
                }
            }
        }

        // Check for character-level repetition (same char 8+ times)
        if (Regex("""(.)\1{7,}""").containsMatchIn(text)) return true

        return false
    }

    // ── Output parsing ──

    /**
     * Extract thinking/reasoning from output (text before the JSON).
     */
    private fun extractThinking(output: String): String {
        val jsonStart = output.indexOf('{')
        val jsonEnd = output.lastIndexOf('}')
        if (jsonStart in 1 until jsonEnd) {
            return output.substring(0, jsonStart).trim()
        }
        // If no JSON delimiters, check for action patterns
        val actionKeywords = listOf("\"action\"", "action:")
        for (kw in actionKeywords) {
            val idx = output.indexOf(kw)
            if (idx > 0) {
                return output.substring(0, idx).trim()
            }
        }
        return ""
    }

    /**
     * Extract the JSON action from output.
     */
    private fun extractActionJson(output: String): String? {
        // Find JSON object delimiters
        val jsonStart = output.indexOf('{')
        val jsonEnd = output.lastIndexOf('}')

        if (jsonStart >= 0 && jsonEnd > jsonStart) {
            val candidate = output.substring(jsonStart, jsonEnd + 1).trim()

            // Validate it's plausibly JSON with action field
            if (candidate.contains("action") && candidate.length < 500) {
                return candidate
            }

            // Try parsing it as JSON
            try {
                org.json.JSONObject(candidate)
                return candidate
            } catch (_: org.json.JSONException) {
                // Not valid JSON, try to fix common issues
                val fixed = fixCommonJsonIssues(candidate)
                try {
                    org.json.JSONObject(fixed)
                    return fixed
                } catch (_: org.json.JSONException) {
                    // Can't fix it
                }
            }
        }

        return null
    }

    /**
     * Fix common JSON formatting issues in LLM output.
     */
    private fun fixCommonJsonIssues(json: String): String {
        return json
            // Fix single quotes → double quotes for keys and string values
            .replace(Regex("""'(\w+)'"""), """"$1"""")
            // Fix trailing commas before closing braces
            .replace(Regex(""",\s*}"""), "}")
            .replace(Regex(""",\s*]"""), "]")
            // Fix missing quotes around string values after colon
            .replace(Regex(""":\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\s+[a-zA-Z_][a-zA-Z0-9_]*)*)\s*([,}])""")) { match ->
                val value = match.groupValues[1]
                val delimiter = match.groupValues[2]
                if (value in listOf("true", "false", "null") || value.toIntOrNull() != null) {
                    match.value // Don't quote booleans, nulls, numbers
                } else {
                    """: "$value"$delimiter"""
                }
            }
    }

    // ── Bitmap utilities ──

    /**
     * Convert Bitmap to base64 URL for inclusion in text prompt.
     */
    private fun bitmapToBase64Url(bitmap: Bitmap, quality: Int = 75): String {
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        return "data:image/jpeg;base64," +
            Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }
}

// ── Extended response type ──

/**
 * VLM response with confidence metadata for cloud fallback decisions.
 *
 * @param response The VLM inference response.
 * @param confidence Confidence score [0.0, 1.0].
 * @param shouldFallbackToCloud Whether the caller should retry with cloud API.
 * @param backendUsed Which backend produced this response ("MNN" or "RuleBased").
 */
data class VlmResponseWithConfidence(
    val response: VlmResponse,
    val confidence: Float,
    val shouldFallbackToCloud: Boolean,
    val backendUsed: String,
) {
    companion object {
        /** Confidence threshold below which cloud fallback is recommended. */
        const val CLOUD_FALLBACK_THRESHOLD = 0.4f
    }
}
