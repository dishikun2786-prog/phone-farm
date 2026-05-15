package com.phonefarm.client.tools

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Makes HTTP requests from the device.
 *
 * Useful for:
 * - Fetching data from web APIs
 * - Triggering webhooks
 * - Reading web content for the agent
 */
@Singleton
class HttpTool @Inject constructor() : Tool {

    override val name = "http"
    override val description = "Make an HTTP request to a URL. Use for fetching web data or calling APIs."

    override val parameters = listOf(
        ToolParam("url", ParamType.STRING, "Full URL to request", required = true),
        ToolParam("method", ParamType.STRING, "HTTP method", defaultValue = "GET", enumValues = listOf("GET", "POST", "PUT", "DELETE")),
        ToolParam("body", ParamType.STRING, "Request body (JSON string, for POST/PUT)"),
        ToolParam("headers", ParamType.OBJECT, "Additional headers as key-value pairs"),
    )

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
        .build()

    override suspend fun execute(params: Map<String, Any?>, context: ToolContext): ToolResult {
        val url = params["url"] as? String
            ?: return ToolResult.Error("url is required")
        val method = (params["method"] as? String)?.uppercase() ?: "GET"
        val body = params["body"] as? String
        @Suppress("UNCHECKED_CAST")
        val headers = params["headers"] as? Map<String, String>

        return withContext(Dispatchers.IO) {
            try {
                val requestBuilder = Request.Builder().url(url)

                // Apply custom headers if provided
                headers?.forEach { (key, value) ->
                    requestBuilder.addHeader(key, value)
                }

                when (method) {
                    "GET" -> requestBuilder.get()
                    "POST" -> {
                        val mediaType = "application/json; charset=utf-8".toMediaType()
                        requestBuilder.post((body ?: "").toRequestBody(mediaType))
                    }
                    "PUT" -> {
                        val mediaType = "application/json; charset=utf-8".toMediaType()
                        requestBuilder.put((body ?: "").toRequestBody(mediaType))
                    }
                    "DELETE" -> requestBuilder.delete()
                    else -> return@withContext ToolResult.Error("Unsupported method: $method")
                }

                val response = client.newCall(requestBuilder.build()).execute()
                val responseBody = response.body?.string() ?: ""

                if (response.isSuccessful) {
                    ToolResult.Success(
                        data = mapOf(
                            "status" to response.code,
                            "body" to responseBody.take(5000),
                        ),
                        message = "HTTP $method $url → ${response.code}",
                    )
                } else {
                    ToolResult.Error(
                        message = "HTTP ${response.code}: ${responseBody.take(500)}",
                        code = "HTTP_${response.code}",
                        retryable = response.code >= 500,
                    )
                }
            } catch (e: Exception) {
                ToolResult.Error(
                    message = "HTTP request failed: ${e.message}",
                    code = "HTTP_ERROR",
                    retryable = true,
                )
            }
        }
    }
}
