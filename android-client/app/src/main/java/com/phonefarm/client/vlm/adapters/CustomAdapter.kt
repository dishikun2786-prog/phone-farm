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
 * Generic OpenAI-compatible adapter for custom/self-hosted VLM endpoints.
 *
 * This adapter sends a standard multimodal chat completion request
 * with a configurable system prompt template style. It handles the
 * most common variations:
 *   - OpenAI / vLLM / Ollama / llama.cpp server
 *   - Anthropic Messages
 *   - Google Gemini
 */
@Singleton
class CustomAdapter @Inject constructor(
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

        return when (config.promptTemplateStyle.lowercase()) {
            "anthropic", "claude" -> executeAnthropic(prompt, config)
            "gemini", "google" -> executeGemini(prompt, config)
            else -> executeOpenAI(prompt, config) // openai, ollama, vllm, etc.
        }
    }

    override fun buildPrompt(
        screenshot: Bitmap,
        taskContext: String,
        memoryHints: String,
        history: List<VlmHistoryEntry>,
        config: CloudVlmConfig,
    ): VlmPrompt {
        val base64Image = bitmapToBase64(screenshot)
        val mimeType = "image/jpeg"

        val systemMessage = when (config.promptTemplateStyle.lowercase()) {
            "anthropic", "claude" -> """
You are an AI assistant controlling an Android smartphone via UI automation.
Analyze the screenshot and decide the next action. Output in JSON:
{"action": "<name>", "x": <int>, "y": <int>, ...}
            """.trimIndent()
            "gemini", "google" -> """
You control an Android phone. Based on the screen image, output the next UI action as JSON.
            """.trimIndent()
            else -> """
You are a smartphone GUI automation agent. Given the screenshot, determine the next precise action.

Output format (JSON):
{"action": "tap", "x": 540, "y": 1200}
{"action": "long_press", "x": 500, "y": 800, "duration_ms": 800}
{"action": "swipe", "x1": 100, "y1": 500, "x2": 100, "y2": 200, "duration_ms": 300}
{"action": "type", "text": "hello world"}
{"action": "back"}
{"action": "home"}
{"action": "launch", "package": "com.tencent.mm"}
{"action": "terminate", "message": "task completed"}

Coordinates are pixel values. Provide reasoning then the JSON action.
            """.trimIndent()
        }

        val userContent = buildString {
            append("Task: $taskContext\n")
            if (memoryHints.isNotBlank()) {
                append("Context: $memoryHints\n")
            }
            append("Provide the next action.")
        }

        val messages = mutableListOf<VlmMessage>()
        for (entry in history) {
            val parts = mutableListOf<VlmContentPart>()
            if (entry.screenshotBase64 != null) {
                parts.add(VlmContentPart.ImageContent(entry.screenshotBase64, mimeType))
            }
            parts.add(VlmContentPart.TextContent(entry.content))
            messages.add(VlmMessage(role = entry.role, content = parts))
        }
        messages.add(
            VlmMessage(
                role = "user",
                content = listOf(
                    VlmContentPart.ImageContent(base64Image, mimeType),
                    VlmContentPart.TextContent(userContent),
                ),
            )
        )

        return VlmPrompt(
            systemMessage = systemMessage,
            userMessages = messages,
            modelType = config.promptTemplateStyle,
            maxTokens = config.maxTokens,
            temperature = config.temperature,
        )
    }

    // ======== OpenAI-compatible request ========

    private suspend fun executeOpenAI(prompt: VlmPrompt, config: CloudVlmConfig): VlmResponse {
        val json = JSONObject()
        json.put("model", config.modelName)
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

        return postRequest(config, json.toString())
    }

    // ======== Anthropic Messages request ========

    private suspend fun executeAnthropic(prompt: VlmPrompt, config: CloudVlmConfig): VlmResponse {
        val json = JSONObject()
        json.put("model", config.modelName)
        json.put("max_tokens", prompt.maxTokens)
        json.put("system", prompt.systemMessage)

        val messages = JSONArray()
        for (msg in prompt.userMessages) {
            val msgObj = JSONObject()
            msgObj.put("role", when (msg.role) {
                "assistant" -> "assistant"
                else -> "user"
            })

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
                        imgObj.put("type", "image")
                        val sourceObj = JSONObject()
                        sourceObj.put("type", "base64")
                        sourceObj.put("media_type", part.mimeType)
                        sourceObj.put("data", part.base64)
                        imgObj.put("source", sourceObj)
                        contentArray.put(imgObj)
                    }
                }
            }
            msgObj.put("content", contentArray)
            messages.put(msgObj)
        }
        json.put("messages", messages)

        val response = postRequestAnthropic(config, json.toString())
        return response
    }

    // ======== Gemini request ========

    private suspend fun executeGemini(prompt: VlmPrompt, config: CloudVlmConfig): VlmResponse {
        val json = JSONObject()

        val contents = JSONArray()
        for (msg in prompt.userMessages) {
            val msgObj = JSONObject()
            msgObj.put("role", when (msg.role) {
                "assistant" -> "model"
                else -> "user"
            })

            val partsArray = JSONArray()
            for (part in msg.content) {
                when (part) {
                    is VlmContentPart.TextContent -> {
                        val textObj = JSONObject()
                        textObj.put("text", part.text)
                        partsArray.put(textObj)
                    }
                    is VlmContentPart.ImageContent -> {
                        val imgObj = JSONObject()
                        val inlineObj = JSONObject()
                        inlineObj.put("mimeType", part.mimeType)
                        inlineObj.put("data", part.base64)
                        imgObj.put("inlineData", inlineObj)
                        partsArray.put(imgObj)
                    }
                }
            }
            msgObj.put("parts", partsArray)
            contents.put(msgObj)
        }
        json.put("contents", contents)

        // System instruction
        val sysInstr = JSONObject()
        val sysParts = JSONArray()
        val sysText = JSONObject()
        sysText.put("text", prompt.systemMessage)
        sysParts.put(sysText)
        sysInstr.put("parts", sysParts)
        json.put("systemInstruction", sysInstr)

        // Generation config
        val genConfig = JSONObject()
        genConfig.put("maxOutputTokens", prompt.maxTokens)
        genConfig.put("temperature", prompt.temperature.toDouble())
        json.put("generationConfig", genConfig)

        return postRequestGemini(config, json.toString())
    }

    // ======== HTTP helpers ========

    private suspend fun postRequest(config: CloudVlmConfig, body: String): VlmResponse {
        val request = Request.Builder()
            .url("${config.apiBase}/chat/completions")
            .header("Authorization", "Bearer ${config.apiKey}")
            .header("Content-Type", "application/json")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()

        val startTime = System.currentTimeMillis()
        val response = okHttpClient.newCall(request).execute()
        val latencyMs = System.currentTimeMillis() - startTime

        val respBody = response.body?.string() ?: throw Exception("Empty response body")
        val json = JSONObject(respBody)

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
            thinking = "",
            actionJson = content,
            tokenUsage = usage,
            latencyMs = latencyMs,
            modelName = config.modelName,
        )
    }

    private suspend fun postRequestAnthropic(config: CloudVlmConfig, body: String): VlmResponse {
        val request = Request.Builder()
            .url("${config.apiBase}/messages")
            .header("x-api-key", config.apiKey)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()

        val startTime = System.currentTimeMillis()
        val response = okHttpClient.newCall(request).execute()
        val latencyMs = System.currentTimeMillis() - startTime

        val respBody = response.body?.string() ?: throw Exception("Empty response body")
        val json = JSONObject(respBody)

        if (json.has("error")) {
            throw Exception("Anthropic API error: ${json.getJSONObject("error").optString("message", "unknown")}")
        }

        val contentArray = json.getJSONArray("content")
        var content = ""
        for (i in 0 until contentArray.length()) {
            val block = contentArray.getJSONObject(i)
            if (block.getString("type") == "text") {
                content += block.getString("text")
            }
        }

        val usage = if (json.has("usage")) {
            val u = json.getJSONObject("usage")
            TokenUsage(
                promptTokens = u.optInt("input_tokens", 0),
                completionTokens = u.optInt("output_tokens", 0),
                totalTokens = u.optInt("input_tokens", 0) + u.optInt("output_tokens", 0),
            )
        } else {
            TokenUsage(0, 0, 0)
        }

        return VlmResponse(
            rawOutput = content,
            thinking = "",
            actionJson = content,
            tokenUsage = usage,
            latencyMs = latencyMs,
            modelName = config.modelName,
        )
    }

    private suspend fun postRequestGemini(config: CloudVlmConfig, body: String): VlmResponse {
        val url = "${config.apiBase}/models/${config.modelName}:generateContent?key=${config.apiKey}"

        val request = Request.Builder()
            .url(url)
            .header("Content-Type", "application/json")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()

        val startTime = System.currentTimeMillis()
        val response = okHttpClient.newCall(request).execute()
        val latencyMs = System.currentTimeMillis() - startTime

        val respBody = response.body?.string() ?: throw Exception("Empty response body")
        val json = JSONObject(respBody)

        if (json.has("error")) {
            throw Exception("Gemini API error: ${json.getJSONObject("error").optString("message", "unknown")}")
        }

        val candidates = json.getJSONArray("candidates")
        val candidate = candidates.getJSONObject(0)
        val contentObj = candidate.getJSONObject("content")
        val parts = contentObj.getJSONArray("parts")
        var content = ""
        for (i in 0 until parts.length()) {
            val part = parts.getJSONObject(i)
            if (part.has("text")) {
                content += part.getString("text")
            }
        }

        val usage = if (json.has("usageMetadata")) {
            val u = json.getJSONObject("usageMetadata")
            TokenUsage(
                promptTokens = u.optInt("promptTokenCount", 0),
                completionTokens = u.optInt("candidatesTokenCount", 0),
                totalTokens = u.optInt("totalTokenCount", 0),
            )
        } else {
            TokenUsage(0, 0, 0)
        }

        return VlmResponse(
            rawOutput = content,
            thinking = "",
            actionJson = content,
            tokenUsage = usage,
            latencyMs = latencyMs,
            modelName = config.modelName,
        )
    }

    private fun bitmapToBase64(bitmap: Bitmap, quality: Int = 85): String {
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }
}
