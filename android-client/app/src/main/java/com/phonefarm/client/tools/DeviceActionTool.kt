package com.phonefarm.client.tools

import com.phonefarm.client.edge.ActionExecutor
import com.phonefarm.client.edge.model.DeviceAction
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Unified device interaction tool wrapping tap/swipe/type/back/home/launch/wait.
 *
 * This tool bridges the Tool abstraction to the existing [ActionExecutor].
 * The LLM calls this with an "action" type and parameters, and we map to
 * the canonical [DeviceAction] and execute.
 */
@Singleton
class DeviceActionTool @Inject constructor(
    private val actionExecutor: ActionExecutor,
) : Tool {

    override val name = "device_action"
    override val description = "Perform a device interaction: tap, long_press, swipe, type text, back, home, launch app, or wait."

    override val parameters = listOf(
        ToolParam("action", ParamType.STRING, "Action type", required = true,
            enumValues = listOf("tap", "long_press", "swipe", "type", "back", "home", "launch", "wait")),
        ToolParam("x", ParamType.INTEGER, "X coordinate (for tap, long_press, swipe)"),
        ToolParam("y", ParamType.INTEGER, "Y coordinate (for tap, long_press, swipe)"),
        ToolParam("x2", ParamType.INTEGER, "End X (for swipe)"),
        ToolParam("y2", ParamType.INTEGER, "End Y (for swipe)"),
        ToolParam("text", ParamType.STRING, "Text to type (for type action)"),
        ToolParam("package", ParamType.STRING, "Package name (for launch action)"),
        ToolParam("duration_ms", ParamType.INTEGER, "Duration in milliseconds (for long_press, swipe, wait)", defaultValue = 300),
    )

    override suspend fun execute(params: Map<String, Any?>, context: ToolContext): ToolResult {
        val actionType = params["action"] as? String
            ?: return ToolResult.Error("action is required")

        val deviceAction: DeviceAction = try {
            when (actionType.lowercase()) {
                "tap" -> DeviceAction.Tap(
                    x = (params["x"] as? Number)?.toInt() ?: return ToolResult.Error("x required for tap"),
                    y = (params["y"] as? Number)?.toInt() ?: return ToolResult.Error("y required for tap"),
                )
                "long_press" -> DeviceAction.LongPress(
                    x = (params["x"] as? Number)?.toInt() ?: return ToolResult.Error("x required"),
                    y = (params["y"] as? Number)?.toInt() ?: return ToolResult.Error("y required"),
                    durationMs = (params["duration_ms"] as? Number)?.toInt() ?: 800,
                )
                "swipe" -> DeviceAction.Swipe(
                    x1 = (params["x"] as? Number)?.toInt() ?: return ToolResult.Error("x required"),
                    y1 = (params["y"] as? Number)?.toInt() ?: return ToolResult.Error("y required"),
                    x2 = (params["x2"] as? Number)?.toInt() ?: return ToolResult.Error("x2 required for swipe"),
                    y2 = (params["y2"] as? Number)?.toInt() ?: return ToolResult.Error("y2 required for swipe"),
                    durationMs = (params["duration_ms"] as? Number)?.toInt() ?: 300,
                )
                "type" -> DeviceAction.Type(
                    text = params["text"] as? String ?: return ToolResult.Error("text required for type"),
                )
                "back" -> DeviceAction.Back
                "home" -> DeviceAction.Home
                "launch" -> DeviceAction.Launch(
                    packageName = params["package"] as? String ?: return ToolResult.Error("package required for launch"),
                )
                "wait" -> DeviceAction.Wait(
                    durationMs = (params["duration_ms"] as? Number)?.toLong() ?: 1000L,
                )
                else -> return ToolResult.Error("Unknown action: $actionType")
            }
        } catch (e: Exception) {
            return ToolResult.Error("Failed to build action: ${e.message}")
        }

        return try {
            val result = actionExecutor.execute(deviceAction)
            when (result) {
                is com.phonefarm.client.edge.ExecutionResult.Success -> ToolResult.Success(
                    message = "$actionType executed in ${result.durationMs}ms",
                )
                is com.phonefarm.client.edge.ExecutionResult.Failed -> ToolResult.Error(
                    message = result.reason,
                    code = "ACTION_FAILED",
                    retryable = true,
                )
                is com.phonefarm.client.edge.ExecutionResult.ServiceUnavailable -> ToolResult.Unavailable(
                    reason = result.reason,
                )
            }
        } catch (e: Exception) {
            ToolResult.Error(
                message = "Action execution threw: ${e.message}",
                code = "ACTION_EXCEPTION",
                retryable = true,
            )
        }
    }
}
