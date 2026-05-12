package com.phonefarm.client.bridge

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.mozilla.javascript.Context as RhinoContext
import org.mozilla.javascript.Scriptable
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * JavaScript-bridge implementation of the AutoX `http` global object.
 *
 * Provides HTTP client methods to Rhino scripts:
 *   var resp = http.get("https://example.com/api", {headers: {...}})
 *   var resp = http.post("https://example.com/api", body, {headers: {...}})
 *   var resp = http.request(method, url, body, options)
 *
 * Each response has: statusCode, body (string), headers (object), url, requestUrl
 */
@Singleton
class JsHttp @Inject constructor(
    private val okHttpClient: OkHttpClient,
) {

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    /**
     * Perform an HTTP GET request.
     * @param url The target URL.
     * @param options Optional map with "headers" (Map<String, String>), "timeout" (Int ms).
     * @return An [HttpResponse] with statusCode, body, headers, url.
     */
    fun get(url: String, options: Map<String, Any>? = null): HttpResponse {
        return request("GET", url, null, options)
    }

    /**
     * Perform an HTTP POST request.
     * @param url The target URL.
     * @param body Request body (String for JSON/text, ByteArray for binary).
     * @param options Optional map with "headers", "timeout", "contentType".
     */
    fun post(url: String, body: Any?, options: Map<String, Any>? = null): HttpResponse {
        return request("POST", url, body, options)
    }

    /**
     * Perform an HTTP PUT request.
     */
    fun put(url: String, body: Any?, options: Map<String, Any>? = null): HttpResponse {
        return request("PUT", url, body, options)
    }

    /**
     * Perform an HTTP DELETE request.
     */
    fun delete(url: String, options: Map<String, Any>? = null): HttpResponse {
        return request("DELETE", url, null, options)
    }

    /**
     * Generic HTTP request with configurable method, body, and options.
     * Builds an OkHttp Request from the parameters, executes it synchronously,
     * and returns a JS-friendly [HttpResponse] object.
     */
    fun request(
        method: String,
        url: String,
        body: Any?,
        options: Map<String, Any>?,
    ): HttpResponse {
        val headers = options?.get("headers") as? Map<*, *>
        val timeoutMs = (options?.get("timeout") as? Number)?.toInt() ?: 30_000
        val contentType = (options?.get("contentType") as? String) ?: "application/json; charset=utf-8"

        val client = okHttpClient.newBuilder()
            .connectTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
            .readTimeout(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
            .build()

        val requestBuilder = Request.Builder().url(url)

        // Apply custom headers from options.
        headers?.forEach { (k, v) ->
            requestBuilder.addHeader(k.toString(), v.toString())
        }

        // Build request body if provided.
        when {
            body == null -> { /* no body for GET/DELETE */ }
            body is String -> {
                val mediaType = contentType.toMediaType()
                requestBuilder.method(method, body.toRequestBody(mediaType))
            }
            body is ByteArray -> {
                val mediaType = "application/octet-stream".toMediaType()
                requestBuilder.method(method, body.toRequestBody(mediaType))
            }
            else -> {
                val json = body.toString()
                requestBuilder.method(method, json.toRequestBody(jsonMediaType))
            }
        }

        val request = requestBuilder.build()
        val response = client.newCall(request).execute()

        val responseBody = response.body?.string() ?: ""
        val responseHeaders: Map<String, String> = response.headers.toMap()

        return HttpResponse(
            statusCode = response.code,
            body = responseBody,
            headers = responseHeaders,
            url = response.request.url.toString(),
            requestUrl = url,
        )
    }

    /**
     * Perform an asynchronous HTTP GET request. The [callback] is invoked on the
     * Rhino context thread with (response, error) when the request completes.
     *
     * Usage from JS:
     *   http.getAsync("https://example.com/api", function(resp, err) {
     *       if (err) { log(err); return; }
     *       log(resp.body);
     *   });
     */
    fun getAsync(url: String, callback: Any?) {
        val cx = JsBridge.currentRhinoContext
        val scope = JsBridge.currentScope
        if (cx == null || scope == null || callback == null) return

        // Capture references for the OkHttp callback running on a background thread.
        val jsCallback = callback
        val jsScope = scope

        val request = Request.Builder().url(url).build()
        okHttpClient.newCall(request).enqueue(object : okhttp3.Callback {
            override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                val body = response.body?.string() ?: ""
                val resp = HttpResponse(
                    statusCode = response.code,
                    body = body,
                    headers = response.headers.toMap(),
                    url = response.request.url.toString(),
                    requestUrl = url,
                )
                invokeCallback(jsScope, jsCallback, resp, null)
            }

            override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                invokeCallback(jsScope, jsCallback, null, e.message ?: "HTTP request failed")
            }
        })
    }

    /**
     * Safely dispatch a callback into the Rhino context from a background thread.
     * Uses [RhinoContext.call] to enter the context and invoke the JS function.
     */
    private fun invokeCallback(
        scope: Scriptable,
        callback: Any?,
        result: HttpResponse?,
        error: String?,
    ) {
        try {
            val cx = RhinoContext.enter()
            try {
                when (callback) {
                    is org.mozilla.javascript.Function -> {
                        val args = arrayOf(
                            result?.let { RhinoContext.javaToJS(it, scope) } ?: org.mozilla.javascript.Undefined.instance,
                            error?.let { RhinoContext.javaToJS(it, scope) } ?: org.mozilla.javascript.Undefined.instance,
                        )
                        callback.call(cx, scope, scope, args)
                    }
                }
            } finally {
                RhinoContext.exit()
            }
        } catch (e: Exception) {
            android.util.Log.e("JsHttp", "Failed to invoke async callback", e)
        }
    }

    /**
     * JS-friendly HTTP response wrapper.
     */
    data class HttpResponse(
        val statusCode: Int,
        val body: String,
        val headers: Map<String, String>,
        val url: String,
        val requestUrl: String,
    ) {
        /**
         * Return true if the status code is in the 2xx range.
         */
        fun isOk(): Boolean = statusCode in 200..299

        /**
         * Parse the body as JSON and return it as a JS-friendly object.
         * Tries JSONObject first, then JSONArray, then falls back to the raw string.
         */
        fun json(): Any? {
            return try {
                val trimmed = body.trim()
                when {
                    trimmed.startsWith("{") -> org.json.JSONObject(body)
                    trimmed.startsWith("[") -> org.json.JSONArray(body)
                    else -> body
                }
            } catch (_: Exception) {
                body
            }
        }

        /**
         * Return the body as an XML string (identity — XML is a string format).
         */
        fun xml(): String = body
    }
}
