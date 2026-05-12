package com.phonefarm.client.remote

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader

/**
 * Shell command execution via root (su) or Shizuku with configurable timeout.
 *
 * Attempts root (su) first; if unavailable, falls back to Shizuku if installed.
 * Non-root execution runs in the app's UID sandbox with limited privileges.
 *
 * Commands are executed on [Dispatchers.IO] and guarded by a configurable
 * timeout to prevent indefinite blocking.
 */
@Singleton
class RemoteShellExecutor @Inject constructor() {

    companion object {
        private const val TAG = "RemoteShellExecutor"
        /** Default timeout for shell commands (10 seconds). */
        private const val DEFAULT_TIMEOUT_MS = 10_000L
        /** Maximum allowed timeout (5 minutes). */
        private const val MAX_TIMEOUT_MS = 300_000L
    }

    /**
     * Execute a shell command and return its stdout/stderr.
     *
     * @param command    Shell command string to execute.
     * @param timeoutMs  Maximum time to wait before killing the process.
     * @return [RemoteCommandResult.Success] with combined stdout + stderr,
     *         or [RemoteCommandResult.Error] on failure or timeout.
     */
    suspend fun execute(
        command: String,
        timeoutMs: Long = DEFAULT_TIMEOUT_MS,
    ): RemoteCommandResult {
        val effectiveTimeout = timeoutMs.coerceAtMost(MAX_TIMEOUT_MS)

        return try {
            withTimeout(effectiveTimeout) {
                withContext(Dispatchers.IO) {
                    runCommand(command)
                }
            }
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            RemoteCommandResult.Error(
                "Shell command timed out after ${effectiveTimeout}ms",
                code = 408,
            )
        } catch (e: Exception) {
            RemoteCommandResult.Error("Shell execution failed: ${e.message}")
        }
    }

    /**
     * Execute a shell command and return the exit code.
     *
     * @param command    Shell command string.
     * @param timeoutMs  Maximum time to wait.
     * @return Pair of (exitCode, output).
     */
    suspend fun executeWithCode(
        command: String,
        timeoutMs: Long = DEFAULT_TIMEOUT_MS,
    ): Pair<Int, String> {
        val result = execute(command, timeoutMs)
        return when (result) {
            is RemoteCommandResult.Success -> 0 to (result.output ?: "")
            is RemoteCommandResult.Error -> -1 to result.message
        }
    }

    // ---- internal ----

    /**
     * Run a shell command with the most privileged shell available.
     */
    private fun runCommand(command: String): RemoteCommandResult {
        return if (isSuAvailable()) {
            runWithSu(command)
        } else if (isShizukuAvailable()) {
            runWithShizuku(command)
        } else {
            runWithRuntime(command)
        }
    }

    /**
     * Run command with root (su).
     */
    private fun runWithSu(command: String): RemoteCommandResult {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("su", "-c", command))
            val stdout = readStream(process.inputStream)
            val stderr = readStream(process.errorStream)
            val exitCode = process.waitFor()

            if (exitCode == 0) {
                RemoteCommandResult.Success(
                    output = buildString {
                        if (stdout.isNotEmpty()) append(stdout)
                        if (stderr.isNotEmpty()) {
                            if (isNotEmpty()) append("\n")
                            append("[stderr] $stderr")
                        }
                    }
                )
            } else {
                RemoteCommandResult.Error(
                    "Command exited with code $exitCode: $stderr",
                    code = exitCode,
                )
            }
        } catch (e: Exception) {
            RemoteCommandResult.Error("su execution failed: ${e.message}")
        }
    }

    /**
     * Run command via Shizuku (user-level system server process).
     *
     * Shizuku provides elevated privileges without full root.
     * The app must have the Shizuku API integrated and permission granted.
     */
    private fun runWithShizuku(command: String): RemoteCommandResult {
        // TODO: Integrate Shizuku API:
        //       val service = ShizukuBinderWrapper(SystemServiceHelper.getSystemService("activity"))
        //       Shizuku.newProcess(arrayOf("sh", "-c", command), null, null)
        return RemoteCommandResult.Error("Shizuku integration not yet implemented")
    }

    /**
     * Run command in the app's normal sandboxed shell (no root).
     */
    private fun runWithRuntime(command: String): RemoteCommandResult {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", command))
            val stdout = readStream(process.inputStream)
            val stderr = readStream(process.errorStream)
            val exitCode = process.waitFor()

            if (exitCode == 0) {
                RemoteCommandResult.Success(output = stdout.ifEmpty { stderr })
            } else {
                RemoteCommandResult.Error(
                    "Command exited with code $exitCode: $stderr",
                    code = exitCode,
                )
            }
        } catch (e: Exception) {
            RemoteCommandResult.Error("Shell execution failed: ${e.message}")
        }
    }

    // ---- availability checks ----

    /**
     * Check whether the su binary is available (root access).
     */
    fun isSuAvailable(): Boolean {
        val suPaths = listOf(
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/system/sbin/su",
            "/vendor/bin/su",
        )
        return suPaths.any { File(it).exists() }
    }

    /**
     * Check whether Shizuku is installed and running.
     */
    fun isShizukuAvailable(): Boolean {
        return try {
            // Simple probe: try to bind to Shizuku.
            // A more robust check requires the app to include the Shizuku API library.
            val clazz = Class.forName("moe.shizuku.api.ShizukuClient")
            val method = clazz.getMethod("isAlive")
            method.invoke(null) as? Boolean ?: false
        } catch (_: ClassNotFoundException) {
            false
        } catch (_: Exception) {
            false
        }
    }

    // ---- utility ----

    private fun readStream(inputStream: java.io.InputStream): String {
        val reader = BufferedReader(InputStreamReader(inputStream))
        return reader.use { it.readText() }.trim()
    }
}
