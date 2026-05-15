package com.phonefarm.client.tools

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Read and write the system clipboard.
 */
@Singleton
class ClipboardTool @Inject constructor() : Tool {

    override val name = "clipboard"
    override val description = "Read from or write to the system clipboard."

    override val parameters = listOf(
        ToolParam("action", ParamType.STRING, "Either 'read' or 'write'", required = true, enumValues = listOf("read", "write")),
        ToolParam("text", ParamType.STRING, "Text to write (required for action=write)"),
    )

    override suspend fun execute(params: Map<String, Any?>, context: ToolContext): ToolResult {
        val action = params["action"] as? String
            ?: return ToolResult.Error("action is required: 'read' or 'write'")

        val cm = context.androidContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            ?: return ToolResult.Error("Clipboard service unavailable", code = "SERVICE_UNAVAILABLE")

        return when (action.lowercase()) {
            "read" -> {
                val clip = cm.primaryClip
                if (clip != null && clip.itemCount > 0) {
                    val text = clip.getItemAt(0).text?.toString() ?: ""
                    ToolResult.Success(
                        data = mapOf("text" to text),
                        message = "Clipboard read: ${text.take(100)}",
                    )
                } else {
                    ToolResult.Success(
                        data = mapOf("text" to ""),
                        message = "Clipboard is empty",
                    )
                }
            }
            "write" -> {
                val text = params["text"] as? String
                    ?: return ToolResult.Error("text is required for write action")
                val clip = ClipData.newPlainText("phonefarm", text)
                cm.setPrimaryClip(clip)
                ToolResult.Success(
                    data = mapOf("written" to true),
                    message = "Clipboard set: ${text.take(100)}",
                )
            }
            else -> ToolResult.Error("Unknown action: $action. Use 'read' or 'write'")
        }
    }
}
