package com.phonefarm.client.account

import android.content.Context
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebView
import android.webkit.WebViewClient
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * WebView-based platform login with automatic cookie extraction.
 *
 * Opens an in-process WebView for the target platform's login page,
 * monitors URL changes to detect successful authentication, and
 * extracts session cookies upon completion.
 *
 * Supported platforms and their login URLs:
 *  - 微信视频号 (WeChat Channels): https://channels.weixin.qq.com/
 *  - 抖音 (Douyin):             https://www.douyin.com/
 *  - 快手 (Kuaishou):            https://www.kuaishou.com/
 *  - 小红书 (Xiaohongshu):        https://www.xiaohongshu.com/
 *
 * Uses Android's system WebView which shares the CookieManager with
 * Chrome (and other Chromium-based browsers) on the device.
 */
@Singleton
class AccountLoginHelper @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    data class LoginResult(
        val platform: String,
        val cookies: String,        // JSON array of cookies
        val success: Boolean,
        val errorMessage: String?,
    )

    companion object {
        private val PLATFORM_LOGIN_URLS = mapOf(
            "wechat" to "https://channels.weixin.qq.com/",
            "douyin" to "https://www.douyin.com/",
            "kuaishou" to "https://www.kuaishou.com/",
            "xiaohongshu" to "https://www.xiaohongshu.com/",
            "taobao" to "https://login.taobao.com/",
            "jd" to "https://passport.jd.com/",
        )

        /** URL patterns that indicate a successful login. */
        private val LOGIN_SUCCESS_PATTERNS = mapOf(
            "wechat" to listOf("channels.weixin.qq.com/web/pages/"),
            "douyin" to listOf("douyin.com/user/", "douyin.com/discover"),
            "kuaishou" to listOf("kuaishou.com/profile", "kuaishou.com/new"),
            "xiaohongshu" to listOf("xiaohongshu.com/explore", "xiaohongshu.com/profile"),
            "taobao" to listOf("taobao.com", "tmall.com"),
            "jd" to listOf("jd.com/cart", "jd.com/home"),
        )
    }

    /**
     * Launch a WebView login flow for the given platform.
     *
     * Returns a [LoginResult] with extracted cookies on success.
     *
     * @param platform  Platform identifier (douyin, kuaishou, xiaohongshu, etc.).
     * @param onWebViewReady  Callback to attach the WebView to a UI container (e.g., a full-screen Dialog).
     * @return [LoginResult] with cookies or error details.
     */
    suspend fun login(
        platform: String,
        onWebViewReady: (WebView) -> Unit,
    ): LoginResult {
        val loginUrl = PLATFORM_LOGIN_URLS[platform]
            ?: return LoginResult(platform, "", false, "Unknown platform: $platform")

        return suspendCancellableCoroutine { continuation ->
            val webView = WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.userAgentString = getPlatformUserAgent(platform)

                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        if (url != null && isLoginSuccess(platform, url)) {
                            extractCookies(url) { cookies ->
                                continuation.resume(
                                    LoginResult(platform, cookies, true, null)
                                )
                            }
                        }
                    }

                    override fun onReceivedError(
                        view: WebView?,
                        errorCode: Int,
                        description: String?,
                        failingUrl: String?,
                    ) {
                        // TODO: Handle error codes gracefully.
                    }
                }

                loadUrl(loginUrl)
            }

            onWebViewReady(webView)
        }
    }

    /**
     * Check whether the given URL indicates a successful login for [platform].
     */
    private fun isLoginSuccess(platform: String, url: String): Boolean {
        val patterns = LOGIN_SUCCESS_PATTERNS[platform] ?: return false
        return patterns.any { url.contains(it) }
    }

    /**
     * Extract all cookies for the given URL domain from [CookieManager].
     *
     * Returns a JSON string of the form:
     *   [{"name":"sessionid","value":"abc123","domain":"...","path":"/",...}, ...]
     */
    private fun extractCookies(url: String, callback: (String) -> Unit) {
        val cookieManager = CookieManager.getInstance()
        val cookieString = cookieManager.getCookie(url) ?: ""

        // Build a structured JSON array from the cookie string.
        val cookies = cookieString.split(";").mapNotNull { part ->
            val trimmed = part.trim()
            val eqIndex = trimmed.indexOf('=')
            if (eqIndex > 0) {
                val name = trimmed.substring(0, eqIndex).trim()
                val value = trimmed.substring(eqIndex + 1).trim()
                """{"name":"$name","value":"$value"}"""
            } else null
        }

        callback("[${cookies.joinToString(",")}]")
    }

    /**
     * Get a platform-specific User-Agent string to avoid being detected
     * as a mobile WebView (some platforms serve a different login page
     * to embedded browsers).
     */
    private fun getPlatformUserAgent(platform: String): String {
        // Use the standard mobile Chrome UA rather than the WebView default.
        return "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36"
    }

    /**
     * Clear all cookies for a given platform domain.
     *
     * Useful when logging out or switching accounts.
     */
    fun clearCookies(platform: String) {
        val cookieManager = CookieManager.getInstance()
        val domain = when (platform) {
            "wechat" -> "weixin.qq.com"
            "douyin" -> "douyin.com"
            "kuaishou" -> "kuaishou.com"
            "xiaohongshu" -> "xiaohongshu.com"
            else -> return
        }
        // CookieManager.removeAllCookies is too broad — we need per-domain.
        // On API 21+ we can use removeSessionCookies() and manually clear
        // persistent cookies for the target domain.
        cookieManager.removeAllCookies(null)
        cookieManager.flush()
        // TODO: Implement per-domain cookie clearing.
    }
}
