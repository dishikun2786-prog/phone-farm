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
 * Adapter for GUI-Owl (Generalist UI Understanding with OWL-based model).
 *
 * GUI-Owl uses a text-based action format:
 *   `click at (500, 300)`
 *   `swipe from (100, 500) to (100, 200)`
 *   `type "hello world"`
 *
 * GUI-Owl is designed for zero-shot UI grounding across diverse
 * application interfaces without task-specific fine-tuning.
 */
@Singleton
class GuiOwlAdapter @Inject constructor(
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
            thinking = extractGuiOwlThinking(content),
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
You are a smartphone control assistant. Based on the screenshot, describe the next UI action in plain English.

AVAILABLE COMMANDS (use pixel coordinates from the screenshot):
- click at (x, y)
- long press at (x, y)
- swipe from (x1, y1) to (x2, y2)
- type "text to type"
- press back
- press home
- launch <package name>
- task complete: <message>

Instructions:
1. Observe the screenshot carefully.
2. Decide the single best next action to accomplish the user's task.
3. Output ONLY the action command on its own line. You may provide brief reasoning before it.

Coordinates: use exact pixel positions visible in the screenshot.
        """.trimIndent()

        val userContent = buildString {
            append("Task: $taskContext\n")
            if (memoryHints.isNotBlank()) {
                append("Previous observations: $memoryHints\n")
            }
            append("\nWhat should be the next action?")
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
            modelType = "guiowl",
            maxTokens = config.maxTokens,
            temperature = config.temperature,
        )
    }

    private fun extractGuiOwlThinking(content: String): String {
        // Extract any text before the command line
        val lines = content.lines()
        val actionIdx = lines.indexOfFirst { line ->
            val trimmed = line.trim().lowercase()
            trimmed.startsWith("click") || trimmed.startsWith("long press") ||
                trimmed.startsWith("swipe") || trimmed.startsWith("type") ||
                trimmed.startsWith("press") || trimmed.startsWith("launch") ||
                trimmed.startsWith("task complete")
        }
        return if (actionIdx > 0) {
            lines.take(actionIdx).joinToString("\n").trim()
        } else if (actionIdx < 0) {
            content.trim()
        } else {
            ""
        }
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
