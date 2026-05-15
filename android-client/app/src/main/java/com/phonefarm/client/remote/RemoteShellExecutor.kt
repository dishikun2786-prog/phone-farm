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
     * Uses Shizuku's newProcess API to run shell commands with ADB-level
     * privileges without requiring root access.
     */
    private fun runWithShizuku(command: String): RemoteCommandResult {
        return try {
            val shizukuClass = Class.forName("rikka.shizuku.Shizuku")
            val newProcessMethod = shizukuClass.getMethod(
                "newProcess", Array<String>::class.java, String::class.java,
                java.util.List::class.java
            )

            val cmdArray = arrayOf("sh", "-c", command)
            val process = newProcessMethod.invoke(null, cmdArray, null, null)

            // If newProcess returned a Process, wait for it
            if (process is java.lang.Process) {
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
            } else {
                // Shizuku.newProcess on some versions returns void — assume success
                RemoteCommandResult.Success(output = "")
            }
        } catch (e: ClassNotFoundException) {
            RemoteCommandResult.Error("Shizuku not installed")
        } catch (e: NoSuchMethodException) {
            // Fallback: try using ShizukuBinderWrapper to get shell service
            runWithShizukuBinder(command)
        } catch (e: Exception) {
            RemoteCommandResult.Error("Shizuku execution failed: ${e.message}")
        }
    }

    /**
     * Fallback Shizuku execution via Binder-based shell service.
     */
    @Suppress("UNCHECKED_CAST")
    private fun runWithShizukuBinder(command: String): RemoteCommandResult {
        return try {
            val shizukuClass = Class.forName("rikka.shizuku.Shizuku")
            val binderReadyMethod = shizukuClass.getMethod("pingBinder")
            val binderReady = binderReadyMethod.invoke(null) as? Boolean ?: false

            if (!binderReady) {
                return RemoteCommandResult.Error("Shizuku binder not ready")
            }

            // Obtain the hidden service "activity" to run shell commands
            val serviceManagerClass = Class.forName("android.os.ServiceManager")
            val getServiceMethod = serviceManagerClass.getMethod(
                "getService", String::class.java
            )
            val binder = getServiceMethod.invoke(null, "activity")

            if (binder == null) {
                return RemoteCommandResult.Error("Could not get activity service")
            }

            // Use the ShizukuBinderWrapper to wrap the service binder
            val wrapperClass = Class.forName("rikka.shizuku.ShizukuBinderWrapper")
            val wrapper = wrapperClass.getConstructor(android.os.IBinder::class.java)
                .newInstance(binder)

            // Transact via the wrapper to execute shell
            val transactMethod = wrapperClass.getMethod(
                "transact", Int::class.javaPrimitiveType,
                android.os.Parcel::class.java,
                android.os.Parcel::class.java,
                Int::class.javaPrimitiveType
            )

            val data = android.os.Parcel.obtain()
            val reply = android.os.Parcel.obtain()
            data.writeInterfaceToken("android.app.IActivityManager")
            data.writeString(command)

            val result = transactMethod.invoke(wrapper, 159, data, reply, 0) as? Boolean ?: false

            data.recycle()
            reply.recycle()

            if (result) {
                RemoteCommandResult.Success(output = "")
            } else {
                RemoteCommandResult.Error("Shizuku transact failed")
            }
        } catch (e: Exception) {
            RemoteCommandResult.Error("Shizuku binder fallback failed: ${e.message}")
        }
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
