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
 * Adapter for Qwen2.5-VL and Qwen3-VL models (Alibaba).
 *
 * Prompt format: JSON-based action specification.
 *   System: "You are a smartphone GUI automation assistant..."
 *   Action: `{"action": "tap", "x": 0.5, "y": 0.3}`
 *   Coordinates: float [0.0, 1.0] (proportional to screen dimensions).
 */
@Singleton
class QwenVLAdapter @Inject constructor(
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
            thinking = extractQwenThinking(content),
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
You are an expert smartphone GUI automation assistant. Your task is to analyze the current screen and decide the next precise action to accomplish the user's goal.

OUTPUT FORMAT — always respond with a valid JSON object:
{"action": "tap", "x": <float 0.0-1.0>, "y": <float 0.0-1.0>}
{"action": "long_press", "x": <float>, "y": <float>}
{"action": "swipe", "x1": <float>, "y1": <float>, "x2": <float>, "y2": <float>}
{"action": "type", "text": "<string>"}
{"action": "back"}
{"action": "home"}
{"action": "launch", "package": "<package_name>"}
{"action": "terminate", "message": "<completion summary>"}

Coordinate system: proportional [0.0, 1.0] relative to screen width and height.
First explain your reasoning, then output ONLY the JSON action object.
        """.trimIndent()

        val userContent = buildString {
            append("Task: $taskContext\n")
            if (memoryHints.isNotBlank()) {
                append("Memory Hints: $memoryHints\n")
            }
            append("Analyze the screenshot and provide the next action in JSON format.")
        }

        val messages = mutableListOf<VlmMessage>()

        // History
        for (entry in history) {
            val parts = mutableListOf<VlmContentPart>()
            if (entry.screenshotBase64 != null) {
                parts.add(VlmContentPart.ImageContent(entry.screenshotBase64))
            }
            parts.add(VlmContentPart.TextContent(entry.content))
            messages.add(VlmMessage(role = entry.role, content = parts))
        }

        // Current turn
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
            modelType = "qwenvl",
            maxTokens = config.maxTokens,
            temperature = config.temperature,
        )
    }

    private fun extractQwenThinking(content: String): String {
        // Qwen-VL typically doesn't use XML think tags; extract reasoning before JSON
        val jsonStart = content.indexOf('{')
        return if (jsonStart > 0) {
            content.substring(0, jsonStart).trim()
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
