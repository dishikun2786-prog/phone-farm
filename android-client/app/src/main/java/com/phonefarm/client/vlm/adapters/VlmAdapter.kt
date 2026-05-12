package com.phonefarm.client.vlm.adapters

import android.graphics.Bitmap
import com.phonefarm.client.vlm.CloudVlmConfig
import com.phonefarm.client.vlm.VlmHistoryEntry
import com.phonefarm.client.vlm.VlmResponse

/**
 * Adapter interface for VLM model-specific prompt construction and API calling.
 *
 * Each concrete adapter encapsulates:
 *   - Prompt template format (XML, JSON, plain text)
 *   - Image encoding requirements (base64, URL, bytes)
 *   - API request/response schema differences
 *   - Thinking/action delimiter conventions
 *
 * Implementations:
 *   - [AutoGLMAdapter] : AutoGLM-Phone-9B, UI-TARS
 *   - [QwenVLAdapter]  : Qwen2.5-VL, Qwen3-VL
 *   - [MaiuiAdapter]   : MAI-UI
 *   - [GuiOwlAdapter]  : GUI-Owl
 *   - [CustomAdapter]  : Generic OpenAI-compatible
 */
interface VlmAdapter {

    /**
     * Execute a VLM inference call and return the structured response.
     *
     * @param screenshot   Current device screenshot.
     * @param taskContext  User's NL task description.
     * @param memoryHints  Relevant memory facts.
     * @param config       Cloud VLM configuration.
     * @param history      Conversation history entries.
     * @return Parsed [VlmResponse].
     */
    suspend fun execute(
        screenshot: Bitmap,
        taskContext: String,
        memoryHints: String,
        config: CloudVlmConfig,
        history: List<VlmHistoryEntry>,
    ): VlmResponse

    /**
     * Build a prompt object suitable for sending to the VLM API.
     *
     * @return [VlmPrompt] with the fully rendered system + user messages.
     */
    fun buildPrompt(
        screenshot: Bitmap,
        taskContext: String,
        memoryHints: String,
        history: List<VlmHistoryEntry>,
        config: CloudVlmConfig,
    ): VlmPrompt
}

/**
 * A fully rendered prompt ready for dispatch to the VLM API.
 */
data class VlmPrompt(
    val systemMessage: String,
    val userMessages: List<VlmMessage>,
    val modelType: String,
    val maxTokens: Int,
    val temperature: Float,
)

/**
 * A single message in a VLM conversation (system, user, or assistant).
 */
data class VlmMessage(
    val role: String,
    val content: List<VlmContentPart>,
)

/**
 * A part of a VLM message — either text or an image.
 */
sealed class VlmContentPart {
    data class TextContent(val text: String) : VlmContentPart()
    data class ImageContent(val base64: String, val mimeType: String = "image/jpeg") : VlmContentPart()
}
