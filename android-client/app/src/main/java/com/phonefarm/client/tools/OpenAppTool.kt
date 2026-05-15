package com.phonefarm.client.tools

import android.content.Intent
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Opens an app by package name or searches by app name.
 * Wraps Android Intent-based app launching.
 */
@Singleton
class OpenAppTool @Inject constructor() : Tool {

    override val name = "open_app"
    override val description = "Open an installed app by package name. Use search_apps first to find the package if unsure."

    override val parameters = listOf(
        ToolParam("package", ParamType.STRING, "App package name, e.g. com.tencent.mm", required = true),
    )

    override suspend fun execute(params: Map<String, Any?>, context: ToolContext): ToolResult {
        val pkg = params["package"] as? String
            ?: return ToolResult.Error("package is required")

        return try {
            val launchIntent = context.androidContext.packageManager
                .getLaunchIntentForPackage(pkg)

            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.androidContext.startActivity(launchIntent)
                ToolResult.Success(
                    data = mapOf("package" to pkg, "launched" to true),
                    message = "Opened $pkg",
                )
            } else {
                // Fallback: try to open via market or settings
                ToolResult.Error(
                    message = "Cannot find launch activity for $pkg. App may not be installed.",
                    code = "APP_NOT_FOUND",
                    retryable = false,
                )
            }
        } catch (e: Exception) {
            ToolResult.Error(
                message = "Failed to open $pkg: ${e.message}",
                code = "LAUNCH_FAILED",
            )
        }
    }
}
