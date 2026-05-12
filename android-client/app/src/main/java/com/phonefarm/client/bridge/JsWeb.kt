package com.phonefarm.client.bridge

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * JavaScript-bridge implementation of the AutoX `web` global object.
 *
 * Provides WebSocket connectivity to Rhino scripts:
 *   var ws = web.newWebSocket("ws://example.com/socket");
 *   ws.send("hello");
 *   ws.onMessage = function(msg) { log(msg); };
 *   ws.close();
 */
@Singleton
class JsWeb @Inject constructor(
    private val okHttpClient: OkHttpClient,
) {

    /**
     * Create a new WebSocket connection to [url] and immediately initiate the
     * handshake. Returns a [JsWebSocket] wrapper that scripts can attach callbacks to.
     *
     * In AutoX, `web.newWebSocket(url)` auto-connects, matching this behavior.
     */
    fun newWebSocket(url: String): JsWebSocket {
        val ws = JsWebSocket(okHttpClient, url)
        ws.connect()
        return ws
    }

    /**
     * Lightweight WebSocket wrapper for JS script consumption.
     *
     * Callbacks (set from JS):
     *   ws.onOpen = function() { ... }
     *   ws.onMessage = function(msg) { ... }
     *   ws.onClose = function(code, reason) { ... }
     *   ws.onError = function(err) { ... }
     *
     * Methods:
     *   ws.send(text)
     *   ws.sendBinary(bytes)
     *   ws.close(code, reason)
     */
    class JsWebSocket(
        private val okHttpClient: OkHttpClient,
        private val url: String,
    ) {
        private var rawSocket: WebSocket? = null

        @Volatile var onOpen: (() -> Unit)? = null
        @Volatile var onMessage: ((String) -> Unit)? = null
        @Volatile var onClose: ((Int, String) -> Unit)? = null
        @Volatile var onError: ((String) -> Unit)? = null

        /**
         * Initiate the WebSocket connection. Called automatically by
         * [JsWeb.newWebSocket]; can also be called manually to reconnect.
         * Returns true if the request was enqueued successfully.
         */
        fun connect(): Boolean {
            val request = Request.Builder()
                .url(url)
                .build()

            rawSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    onOpen?.invoke()
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    onMessage?.invoke(text)
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(1000, null)
                    onClose?.invoke(code, reason)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    onClose?.invoke(code, reason)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    onError?.invoke(t.message ?: "WebSocket error")
                }
            })
            return rawSocket != null
        }

        /**
         * TODO: Send a text message through the WebSocket.
         */
        fun send(text: String): Boolean {
            return rawSocket?.send(text) ?: false
        }

        /**
         * TODO: Send binary data through the WebSocket.
         */
        fun sendBinary(data: ByteArray): Boolean {
            return rawSocket?.send(okio.ByteString.of(*data)) ?: false
        }

        /**
         * TODO: Close the WebSocket with an optional code and reason.
         */
        fun close(code: Int = 1000, reason: String = "") {
            rawSocket?.close(code, reason)
            rawSocket = null
        }

        /**
         * TODO: Return the current ready state. Not exposed since OkHttp manages this internally.
         */
        fun isOpen(): Boolean {
            // OkHttp WebSocket does not expose ready state directly;
            // track open/closed via callbacks.
            return rawSocket != null
        }
    }
}
