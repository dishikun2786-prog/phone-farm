package com.phonefarm.client.vlm.adapters

import android.graphics.Bitmap
import android.util.Base64
import com.phonefarm.client.vlm.CloudVlmConfig
import com.phonefarm.client.vlm.VlmHistoryEntry
import com.phonefarm.client.vlm.VlmResponse
import com.phonefarm.client.vlm.TokenUsage
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Adapter for MAI-UI (Multimodal Agentic Interaction for UIs) models.
 *
 * MAI-UI uses a JSON-based action schema:
 *   `{"action": "tap", "x": 512, "y": 384}`
 *
 * MAI-UI is specialized for mobile UI understanding with emphasis on
 * semantic element identification and multi-step task planning.
 * It uses pixel coordinates by default rather than normalized coordinates.
 */
@Singleton
class MaiuiAdapter @Inject constructor(
    private val okHttpClient: OkHttpClient,
) : VlmAdapter {

    override suspend fun execute(
        screenshot: Bitmap,
        taskContext: String,
        memoryHints: String,
        config: CloudVlmConfig,
        history: List<VlmHistoryEntry>,
    ): VlmResponse {
        val prompt = buildPrompt(screenshot, taskContext, memoryHints, history, config)
        val requestBody = buildOpenAIRequest(prompt, config.modelName)

        val request = Request.Builder()
            .url("${config.apiBase}/chat/completions")
            .header("Authorization", "Bearer ${config.apiKey}")
            .header("Content-Type", "application/json")
            .post(requestBody.toRequestBody("application/json".toMediaType()))
            .build()

        val startTime = System.currentTimeMillis()
        val response = okHttpClient.newCall(request).execute()
        val latencyMs = System.currentTimeMillis() - startTime

        val body = response.body?.string() ?: throw Exception("Empty response body")
        val json = JSONObject(body)

        if (json.has("error")) {
            throw Exception("VLM API error: ${json.getJSONObject("error").optString("message", "unknown")}")
        }

        val choices = json.getJSONArray("choices")
        val choice = choices.getJSONObject(0)
        val message = choice.getJSONObject("message")
        val content = message.getString("content")

        val usage = if (json.has("usage")) {
            val u = json.getJSONObject("usage")
            TokenUsage(
                promptTokens = u.optInt("prompt_tokens", 0),
                completionTokens = u.optInt("completion_tokens", 0),
                totalTokens = u.optInt("total_tokens", 0),
            )
        } else {
            TokenUsage(0, 0, 0)
        }

        return VlmResponse(
            rawOutput = content,
            thinking = extractJsonThinking(content),
            actionJson = content,
            tokenUsage = usage,
            latencyMs = latencyMs,
            modelName = config.modelName,
        )
    }

    override fun buildPrompt(
        screenshot: Bitmap,
        taskContext: String,
        memoryHints: String,
        history: List<VlmHistoryEntry>,
        config: CloudVlmConfig,
    ): VlmPrompt {
        val base64Image = bitmapToBase64(screenshot)

        val systemMessage = """
You are a precise mobile UI automation agent (MAI-UI). Your role is to observe the smartphone screen and decide the exact next step to accomplish the user's task.

CRITICAL: Output your action as a JSON object only. No extra text.

AVAILABLE ACTIONS (pixel coordinates):
{
  "action": "tap",
  "x": <pixel_x>,
  "y": <pixel_y>
}
{
  "action": "long_press",
  "x": <pixel_x>,
  "y": <pixel_y>,
  "duration_ms": 800
}
{
  "action": "swipe",
  "x1": <pixel_x1>,
  "y1": <pixel_y1>,
  "x2": <pixel_x2>,
  "y2": <pixel_y2>,
  "duration_ms": 300
}
{
  "action": "type",
  "text": "<text to input>"
}
{
  "action": "back"
}
{
  "action": "home"
}
{
  "action": "launch",
  "package": "<package_name>"
}
{
  "action": "terminate",
  "message": "<reason>"
}

RULES:
1. Coordinates are in actual screen pixels (top-left is 0,0).
2. Tap the exact center of the target UI element.
3. If stuck, try scrolling or going back.
4. When the task is done, output action "terminate".

Screen dimensions: ${config.coordinateSystem} (you may receive this in the prompt context).
        """.trimIndent()

        val userContent = buildString {
            append("TASK: $taskContext\n\n")
            if (memoryHints.isNotBlank()) {
                append("CONTEXT: $memoryHints\n\n")
            }
            append("Based on the screenshot above, what is the next action? Output JSON only.")
        }

        val messages = mutableListOf<VlmMessage>()

        for (entry in history) {
            val parts = mutableListOf<VlmContentPart>()
            if (entry.screenshotBase64 != null) {
                parts.add(VlmContentPart.ImageContent(entry.screenshotBase64))
            }
            parts.add(VlmContentPart.TextContent(entry.content))
            messages.add(VlmMessage(role = entry.role, content = parts))
        }

        messages.add(
            VlmMessage(
                role = "user",
                content = listOf(
                    VlmContentPart.ImageContent(base64Image),
                    VlmContentPart.TextContent(userContent),
                ),
            )
        )

        return VlmPrompt(
            systemMessage = systemMessage,
            userMessages = messages,
            modelType = "maiui",
            maxTokens = config.maxTokens,
            temperature = config.temperature,
        )
    }

    private fun extractJsonThinking(content: String): String {
        val jsonStart = content.indexOf('{')
        return if (jsonStart > 0) content.substring(0, jsonStart).trim() else ""
    }

    private fun buildOpenAIRequest(prompt: VlmPrompt, modelName: String): String {
        val json = JSONObject()
        json.put("model", modelName)
        json.put("max_tokens", prompt.maxTokens)
        json.put("temperature", prompt.temperature.toDouble())

        val messages = JSONArray()

        val sysMsg = JSONObject()
        sysMsg.put("role", "system")
        sysMsg.put("content", prompt.systemMessage)
        messages.put(sysMsg)

        for (msg in prompt.userMessages) {
            val msgObj = JSONObject()
            msgObj.put("role", msg.role)

            val contentArray = JSONArray()
            for (part in msg.content) {
                when (part) {
                    is VlmContentPart.TextContent -> {
                        val textObj = JSONObject()
                        textObj.put("type", "text")
                        textObj.put("text", part.text)
                        contentArray.put(textObj)
                    }
                    is VlmContentPart.ImageContent -> {
                        val imgObj = JSONObject()
                        imgObj.put("type", "image_url")
                        val urlObj = JSONObject()
                        urlObj.put("url", "data:${part.mimeType};base64,${part.base64}")
                        imgObj.put("image_url", urlObj)
                        contentArray.put(imgObj)
                    }
                }
            }
            msgObj.put("content", contentArray)
            messages.put(msgObj)
        }

        json.put("messages", messages)
        return json.toString()
    }

    private fun bitmapToBase64(bitmap: Bitmap, quality: Int = 85): String {
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }
}
