package com.phonefarm.client.tools

/**
 * Result from a tool execution.
 */
sealed class ToolResult {
    /** Tool executed successfully. */
    data class Success(
        val data: Any? = null,
        val message: String = "",
    ) : ToolResult()

    /** Tool ran but produced a partial / degraded result. */
    data class Partial(
        val data: Any? = null,
        val message: String,
    ) : ToolResult()

    /** Tool failed with a recoverable error. */
    data class Error(
        val message: String,
        val code: String = "TOOL_ERROR",
        val retryable: Boolean = false,
    ) : ToolResult()

    /** Tool cannot execute because a precondition is not met. */
    data class Unavailable(
        val reason: String,
    ) : ToolResult()

    val isSuccess: Boolean get() = this is Success
    val isError: Boolean get() = this is Error

    fun <T> getOrNull(): T? = (this as? Success)?.data as? T

    fun getMessage(): String = when (this) {
        is Success -> message
        is Partial -> message
        is Error -> message
        is Unavailable -> reason
    }
}
