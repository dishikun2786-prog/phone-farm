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
import kotlin.time.measureTime

/**
 * Adapter for AutoGLM-Phone-9B and UI-TARS models.
 *
 * Prompt format: XML-based action specification.
 *   System: "你是一个手机操作助手。根据截图输出操作指令。"
 *   Action: `<action type="tap"><x>500</x><y>300</y></action>`
 *   Coordinates: normalized [0, 1000] on both axes.
 */
@Singleton
class AutoGLMAdapter @Inject constructor(
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
        val requestBody = buildOpenAIRequest(prompt)

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

        // Handle OpenAI error responses
        if (json.has("error")) {
            throw Exception("VLM API error: ${json.getJSONObject("error").optString("message", "unknown")}")
        }

        val choices = json.getJSONArray("choices")
        val choice = choices.getJSONObject(0)
        val message = choice.getJSONObject("message")
        val content = message.getString("content")

        // Token usage
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

        // Extract finish reason
        val finishReason = choice.optString("finish_reason", "stop")

        return VlmResponse(
            rawOutput = content,
            thinking = extractAutoGLMThinking(content),
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
你是一个手机操作助手，运行在 Android 设备上。根据当前屏幕截图，决定下一步操作。

操作规范（归一化坐标系 [0, 1000]，左上角为原点）：
- do(action="Tap", element=[x, y])          点击指定坐标
- do(action="LongPress", element=[x, y])    长按指定坐标
- do(action="Swipe", element=[x1, y1, x2, y2]) 从(x1,y1)滑动到(x2,y2)
- do(action="Type", text="文字内容")          输入文字
- do(action="Back")                          返回
- do(action="Home")                          回到桌面
- do(action="Launch", app="包名")             启动应用（如 com.tencent.mm）
- finish(message="完成描述")                   任务完成时调用

先在 <think> 标签中分析当前屏幕和步骤，然后在 <answer> 中给出精确的 do(...) 指令。
        """.trimIndent()

        val userContent = buildString {
            append("任务: $taskContext\n")
            if (memoryHints.isNotBlank()) {
                append("记忆提示: $memoryHints\n")
            }
            append("请根据截图输出下一步操作。")
        }

        // Build messages with screenshots in the user message
        val messages = mutableListOf<VlmMessage>()

        // Add history
        for (entry in history) {
            val parts = mutableListOf<VlmContentPart>()
            if (entry.screenshotBase64 != null) {
                parts.add(VlmContentPart.ImageContent(entry.screenshotBase64))
            }
            parts.add(VlmContentPart.TextContent(entry.content))
            messages.add(VlmMessage(role = entry.role, content = parts))
        }

        // Add current screenshot + task
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
            modelType = config.promptTemplateStyle,
            maxTokens = config.maxTokens,
            temperature = config.temperature,
        )
    }

    private fun extractAutoGLMThinking(content: String): String {
        val regex = Regex("""<think>(.*?)</think>""", setOf(RegexOption.DOT_MATCHES_ALL))
        return regex.find(content)?.groupValues?.get(1)?.trim() ?: ""
    }

    private fun buildOpenAIRequest(prompt: VlmPrompt): String {
        val json = JSONObject()
        json.put("model", "autoglm") // Will be overridden by adapter caller's config
        json.put("max_tokens", prompt.maxTokens)
        json.put("temperature", prompt.temperature.toDouble())

        val messages = JSONArray()

        // System message
        val sysMsg = JSONObject()
        sysMsg.put("role", "system")
        sysMsg.put("content", prompt.systemMessage)
        messages.put(sysMsg)

        // User/assistant messages with multimodal content
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
                        urlObj.put(
                            "url",
                            "data:${part.mimeType};base64,${part.base64}"
                        )
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
        val bytes = stream.toByteArray()
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }
}
