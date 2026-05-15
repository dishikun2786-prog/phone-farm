package com.phonefarm.client.tools

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Execute shell commands on the device.
 *
 * Commands run with the app's UID permissions. For privileged commands
 * (e.g. `input tap`), Shizuku shell should be used instead.
 */
@Singleton
class ShellTool @Inject constructor() : Tool {

    override val name = "shell"
    override val description = "Execute a shell command. Useful for reading system info, file operations, and simple shell tasks. Not for UI touch actions — use device_action for that."

    override val parameters = listOf(
        ToolParam("command", ParamType.STRING, "Shell command to execute", required = true),
        ToolParam("timeout_ms", ParamType.INTEGER, "Timeout in milliseconds (default 5000)", defaultValue = 5000),
    )

    override suspend fun execute(params: Map<String, Any?>, context: ToolContext): ToolResult {
        val command = params["command"] as? String
            ?: return ToolResult.Error("command is required")
        val timeoutMs = (params["timeout_ms"] as? Number)?.toLong() ?: 5000L

        // Blocklist dangerous commands
        val lower = command.lowercase().trim()
        val blockedPatterns = listOf("rm -rf /", "mkfs.", "dd if=", "> /dev/block", "reboot")
        for (pattern in blockedPatterns) {
            if (lower.contains(pattern)) {
                return ToolResult.Error(
                    message = "Blocked dangerous command: $pattern",
                    code = "BLOCKED",
                )
            }
        }

        return withContext(Dispatchers.IO) {
            try {
                val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", command))
                val stdout = BufferedReader(InputStreamReader(process.inputStream)).use { it.readText() }
                val stderr = BufferedReader(InputStreamReader(process.errorStream)).use { it.readText() }

                val completed = process.waitFor(timeoutMs, TimeUnit.MILLISECONDS)

                if (!completed) {
                    process.destroyForcibly()
                }

                val exitCode = if (completed) process.exitValue() else -1

                if (exitCode == 0) {
                    ToolResult.Success(
                        data = mapOf(
                            "stdout" to stdout.take(5000),
                            "stderr" to stderr.take(1000),
                            "exitCode" to exitCode,
                        ),
                        message = "Command completed: ${stdout.take(200)}",
                    )
                } else {
                    ToolResult.Partial(
                        data = mapOf(
                            "stdout" to stdout.take(5000),
                            "stderr" to stderr.take(1000),
                            "exitCode" to exitCode,
                        ),
                        message = "Command exited with code $exitCode: ${stderr.take(200)}",
                    )
                }
            } catch (e: Exception) {
                ToolResult.Error(
                    message = "Shell command failed: ${e.message}",
                    code = "SHELL_ERROR",
                )
            }
        }
    }
}
