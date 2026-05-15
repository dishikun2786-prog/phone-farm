package com.phonefarm.client.tools

import android.content.Context

/**
 * Atomic tool interface — every action the agent can take is a Tool.
 *
 * Each Tool exposes a JSON Schema parameter list so the LLM can
 * call it via function-calling without hardcoding action types.
 */
interface Tool {
    /** Unique identifier, e.g. "search_apps", "tap", "deep_link". */
    val name: String

    /** Human-readable description shown to the LLM. */
    val description: String

    /** JSON Schema parameter definitions for function calling. */
    val parameters: List<ToolParam>

    /** Execute the tool with named parameters. */
    suspend fun execute(params: Map<String, Any?>, context: ToolContext): ToolResult

    /**
     * Generate the OpenAI/Anthropic function-calling schema object
     * for this tool. Default implementation builds from [name],
     * [description], and [parameters].
     */
    fun toFunctionDef(): FunctionDef {
        val props = parameters.associate { p ->
            p.name to buildMap {
                put("type", p.type.jsonType)
                put("description", p.description)
                if (p.enumValues != null) put("enum", p.enumValues)
                if (p.defaultValue != null) put("default", p.defaultValue)
                if (p.itemsType != null) {
                    put("items", mapOf("type" to p.itemsType.jsonType))
                }
            }
        }
        val required = parameters.filter { it.required }.map { it.name }
        return FunctionDef(
            name = name,
            description = description,
            parameters = mapOf(
                "type" to "object",
                "properties" to props,
                "required" to required,
            ),
        )
    }
}

/** JSON Schema parameter descriptor. */
data class ToolParam(
    val name: String,
    val type: ParamType,
    val description: String,
    val required: Boolean = false,
    val enumValues: List<String>? = null,
    val defaultValue: Any? = null,
    val itemsType: ParamType? = null,
)

enum class ParamType(val jsonType: String) {
    STRING("string"),
    NUMBER("number"),
    INTEGER("integer"),
    BOOLEAN("boolean"),
    ARRAY("array"),
    OBJECT("object"),
}

/** Execution context injected into every tool call. */
data class ToolContext(
    val androidContext: Context,
    val screenWidth: Int = 0,
    val screenHeight: Int = 0,
    /** Extra data the agent can attach (e.g. session info). */
    val extras: Map<String, Any?> = emptyMap(),
)

/** LLM function-calling schema for a single tool. */
data class FunctionDef(
    val name: String,
    val description: String,
    val parameters: Map<String, Any?>,
)
