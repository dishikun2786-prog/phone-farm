package com.phonefarm.client.tools

import android.content.Intent
import android.net.Uri
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Opens a deep link URL or URI intent.
 *
 * Supports:
 * - Standard deep links: meituan://ai/chat?query=food
 * - HTTP URLs that open in browsers or apps
 * - Custom scheme URIs
 */
@Singleton
class DeepLinkTool @Inject constructor() : Tool {

    override val name = "deep_link"
    override val description = "Open a deep link or URL intent to jump directly to a specific page in an app."

    override val parameters = listOf(
        ToolParam("uri", ParamType.STRING, "The deep link URI, e.g. meituan://ai/chat?query=pizza or https://example.com", required = true),
        ToolParam("package", ParamType.STRING, "Target package name. If omitted, Android resolves the best handler."),
    )

    override suspend fun execute(params: Map<String, Any?>, context: ToolContext): ToolResult {
        val uriStr = params["uri"] as? String
            ?: return ToolResult.Error("uri is required")
        val targetPackage = params["package"] as? String

        return try {
            val uri = Uri.parse(uriStr)
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (targetPackage != null) {
                    setPackage(targetPackage)
                }
            }

            // Verify there's an activity to handle this
            val resolved = context.androidContext.packageManager
                .resolveActivity(intent, 0)
            if (resolved != null) {
                context.androidContext.startActivity(intent)
                ToolResult.Success(
                    data = mapOf("uri" to uriStr, "resolvedBy" to resolved.activityInfo.packageName),
                    message = "Deep link opened: $uriStr",
                )
            } else {
                ToolResult.Error(
                    message = "No app can handle: $uriStr",
                    code = "NO_HANDLER",
                )
            }
        } catch (e: Exception) {
            ToolResult.Error(
                message = "Deep link failed: ${e.message}",
                code = "DEEPLINK_FAILED",
            )
        }
    }
}
