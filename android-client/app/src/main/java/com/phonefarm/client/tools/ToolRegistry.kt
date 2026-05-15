package com.phonefarm.client.tools

/**
 * Central registry for all available tools.
 *
 * Tools are registered by name and exposed to the LLM via
 * [generateFunctionDefs] which produces the full function-calling
 * schema for the active tool set.
 *
 * All tools are injected via Hilt constructor injection.
 */
@javax.inject.Singleton
class ToolRegistry @javax.inject.Inject constructor(
    searchAppsTool: SearchAppsTool,
    openAppTool: OpenAppTool,
    deepLinkTool: DeepLinkTool,
    clipboardTool: ClipboardTool,
    httpTool: HttpTool,
    shellTool: ShellTool,
    deviceActionTool: DeviceActionTool,
) {
    private val tools = mutableMapOf<String, Tool>()

    init {
        registerAll(searchAppsTool, openAppTool, deepLinkTool, clipboardTool, httpTool, shellTool, deviceActionTool)
    }

    fun register(tool: Tool): ToolRegistry {
        tools[tool.name] = tool
        return this
    }

    fun registerAll(vararg toolList: Tool): ToolRegistry {
        toolList.forEach { register(it) }
        return this
    }

    fun get(name: String): Tool? = tools[name]

    fun getAll(): List<Tool> = tools.values.toList()

    fun getNames(): Set<String> = tools.keys.toSet()

    /** Generate the complete function-calling schema for all registered tools. */
    fun generateFunctionDefs(): List<FunctionDef> = tools.values.map { it.toFunctionDef() }

    /**
     * Generate a compact description string for system prompts.
     * Example: "- search_apps(query): 智能搜索已安装应用\n- tap(x, y): 点击指定坐标"
     */
    fun generateToolPrompt(): String = tools.values.joinToString("\n") { tool ->
        val params = tool.parameters.joinToString(", ") { p ->
            "${p.name}: ${p.type.jsonType}" + if (p.required) "" else "?"
        }
        "- ${tool.name}($params): ${tool.description}"
    }

    /**
     * Execute a tool by name, converting string-keyed params
     * to the typed map the tool expects.
     */
    suspend fun execute(
        name: String,
        params: Map<String, Any?>,
        context: ToolContext,
    ): ToolResult {
        val tool = tools[name] ?: return ToolResult.Error(
            message = "Unknown tool: $name. Available: ${tools.keys.joinToString(", ")}",
            code = "UNKNOWN_TOOL",
        )
        return try {
            tool.execute(params, context)
        } catch (e: Exception) {
            ToolResult.Error(
                message = "Tool '$name' threw: ${e.message}",
                code = "TOOL_EXCEPTION",
                retryable = true,
            )
        }
    }
}
