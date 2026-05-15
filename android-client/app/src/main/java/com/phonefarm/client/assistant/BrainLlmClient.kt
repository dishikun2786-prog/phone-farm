package com.phonefarm.client.assistant

import android.graphics.Bitmap
import android.util.Base64
import com.phonefarm.client.network.ApiService
import com.phonefarm.client.network.AssistantChatRequest
import com.phonefarm.client.network.AssistantChatResponse
import com.phonefarm.client.network.AssistantConfigResponse
import com.phonefarm.client.network.AssistantMessage
import com.phonefarm.client.network.AssistantSessionCreate
import com.phonefarm.client.network.AssistantSessionUpdate
import com.phonefarm.client.network.AssistantVisionContent
import com.phonefarm.client.network.AssistantVisionMessage
import com.phonefarm.client.network.AssistantVisionRequest
import com.phonefarm.client.network.AssistantVisionResponse
import com.phonefarm.client.network.AssistantImageUrl
import com.phonefarm.client.network.ToolDefDto
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * LLM client for the AI Assistant — proxies calls through the control server.
 *
 * All LLM requests go through the server (API keys never touch the device):
 *   - Brain: POST /api/v1/assistant/chat  (DeepSeek via Anthropic Messages API)
 *   - Vision: POST /api/v1/assistant/vision (QwenVL via DashScope API)
 */
@Singleton
class BrainLlmClient @Inject constructor(
    private val apiService: ApiService,
) {

    companion object {
        private const val JPEG_QUALITY = 75
    }

    /**
     * Send a text chat to the Brain LLM (DeepSeek via server proxy).
     *
     * @param tools Optional function-calling tool definitions. Each tool's parameters
     *              is a JsonObject matching the OpenAI/Anthropic function schema.
     */
    suspend fun chat(
        messages: List<AssistantMessage>,
        systemPrompt: String? = null,
        sessionId: String? = null,
        tools: List<ToolDefDto>? = null,
    ): Result<AssistantChatResponse> {
        return try {
            val request = AssistantChatRequest(
                messages = messages,
                systemPrompt = systemPrompt,
                sessionId = sessionId,
                tools = tools,
            )
            val response = apiService.assistantChat(request)
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Send a vision request to the Phone Agent (QwenVL via server proxy).
     * The screenshot is encoded as base64 JPEG in the request.
     */
    suspend fun vision(
        screenshot: Bitmap,
        prompt: String,
        sessionId: String? = null,
    ): Result<AssistantVisionResponse> {
        return try {
            val base64Image = bitmapToBase64Jpeg(screenshot)

            val messages = listOf(
                AssistantVisionMessage(
                    role = "user",
                    content = listOf(
                        AssistantVisionContent(
                            type = "image_url",
                            imageUrl = AssistantImageUrl(url = "data:image/jpeg;base64,$base64Image"),
                        ),
                        AssistantVisionContent(
                            type = "text",
                            text = prompt,
                        ),
                    ),
                )
            )

            val request = AssistantVisionRequest(
                messages = messages,
                sessionId = sessionId,
            )
            val response = apiService.assistantVision(request)
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Fetch assistant configuration from the server. */
    suspend fun getConfig(): Result<AssistantConfigResponse> {
        return try {
            val config = apiService.getAssistantConfig()
            Result.success(config)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Create a new assistant session on the server. */
    suspend fun createSession(deviceId: String, title: String? = null): Result<String> {
        return try {
            val response = apiService.createAssistantSession(
                AssistantSessionCreate(deviceId = deviceId, title = title)
            )
            Result.success(response.sessionId)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Update session tokens/steps/status. */
    suspend fun updateSession(sessionId: String, tokens: Int?, steps: Int?, status: String?) {
        try {
            apiService.updateAssistantSession(
                sessionId,
                AssistantSessionUpdate(tokens = tokens, steps = steps, status = status)
            )
        } catch (_: Exception) { }
    }

    /** Complete a session. */
    suspend fun completeSession(sessionId: String, success: Boolean) {
        updateSession(sessionId, tokens = null, steps = null, status = if (success) "completed" else "error")
    }

    // ── internal ──

    private suspend fun bitmapToBase64Jpeg(bitmap: Bitmap): String =
        withContext(Dispatchers.Default) {
            val stream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream)
            Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
        }
}
