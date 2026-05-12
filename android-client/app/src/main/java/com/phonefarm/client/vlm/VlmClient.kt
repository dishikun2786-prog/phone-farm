package com.phonefarm.client.vlm

import android.graphics.Bitmap
import com.phonefarm.client.vlm.adapters.*
import okhttp3.OkHttpClient
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Cloud VLM HTTP client using OkHttp for OpenAI-compatible API calls.
 *
 * Sends a screenshot along with task context, memory hints, and conversation
 * history to a remote VLM endpoint and returns the structured response.
 *
 * Internally delegates to the appropriate [VlmAdapter] based on
 * [CloudVlmConfig.promptTemplateStyle] to handle model-specific
 * prompt formatting and API schema differences.
 */
@Singleton
class VlmClient @Inject constructor(
    private val okHttpClient: OkHttpClient,
) {

    /**
     * Execute a single cloud VLM inference call.
     *
     * @param screenshot  The current device screenshot as a Bitmap (encoded to JPEG base64).
     * @param taskContext The user's natural-language task description.
     * @param memoryHints Relevant facts retrieved from MemoryManager.
     * @param config      Cloud VLM connection parameters (endpoint, model, temperature, etc.).
     * @param history     Previous conversation turns for multi-step context.
     * @return Structured [VlmResponse] containing model reasoning and parsed action.
     */
    suspend fun execute(
        screenshot: Bitmap,
        taskContext: String,
        memoryHints: String,
        config: CloudVlmConfig,
        history: List<VlmHistoryEntry>,
    ): VlmResponse {
        val adapter = selectAdapter(config.promptTemplateStyle)
        return adapter.execute(screenshot, taskContext, memoryHints, config, history)
    }

    /**
     * Build a prompt object for the given model type without executing the API call.
     * Useful for debugging and prompt preview.
     */
    fun buildPrompt(
        screenshot: Bitmap,
        taskContext: String,
        memoryHints: String,
        config: CloudVlmConfig,
        history: List<VlmHistoryEntry>,
    ): VlmPrompt {
        val adapter = selectAdapter(config.promptTemplateStyle)
        return adapter.buildPrompt(screenshot, taskContext, memoryHints, history, config)
    }

    /**
     * Select the appropriate VLM adapter based on the prompt template style.
     *
     * This factory method creates the correct adapter instance for the model type.
     * Each adapter encapsulates model-specific prompt construction and API calling.
     */
    private fun selectAdapter(style: String): VlmAdapter {
        return when (style.lowercase()) {
            "autoglm" -> AutoGLMAdapter(okHttpClient)
            "uitars" -> AutoGLMAdapter(okHttpClient) // UI-TARS uses same format as AutoGLM
            "qwenvl" -> QwenVLAdapter(okHttpClient)
            "maiui" -> MaiuiAdapter(okHttpClient)
            "guiowl" -> GuiOwlAdapter(okHttpClient)
            "custom" -> CustomAdapter(okHttpClient)
            "openai" -> CustomAdapter(okHttpClient)
            "anthropic", "claude" -> CustomAdapter(okHttpClient)
            "gemini", "google" -> CustomAdapter(okHttpClient)
            "ollama" -> CustomAdapter(okHttpClient)
            "vllm" -> CustomAdapter(okHttpClient)
            else -> AutoGLMAdapter(okHttpClient) // Default fallback
        }
    }
}

/**
 * Parsed VLM API response containing reasoning and the structured action.
 */
data class VlmResponse(
    val rawOutput: String,
    val thinking: String,
    val actionJson: String?,
    val tokenUsage: TokenUsage,
    val latencyMs: Long,
    val modelName: String,
)

/**
 * Token usage statistics from the VLM API.
 */
data class TokenUsage(
    val promptTokens: Int,
    val completionTokens: Int,
    val totalTokens: Int,
)

/**
 * A single entry in the conversation history sent to the VLM.
 */
data class VlmHistoryEntry(
    val role: String,
    val content: String,
    val screenshotBase64: String?,
)
