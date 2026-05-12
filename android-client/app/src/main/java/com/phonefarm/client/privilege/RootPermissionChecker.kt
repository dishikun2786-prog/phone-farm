package com.phonefarm.client.privilege

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Root access detection and command execution helper.
 *
 * Checks for root availability via multiple methods:
 *   1. Check for `su` binary in standard locations
 *   2. Check for SuperSU / Magisk / KSU app packages
 *   3. Test `su` execution with `su -c id`
 *
 * Root access enables:
 *   - Silent APK installation (`su -c pm install`)
 *   - System-level settings modification
 *   - Direct IMEI/serial retrieval
 *   - App data backup/restore
 *
 * Security note: Root access is neither required nor encouraged.
 * PhoneFarm uses DeviceOwner (preferred) or Shizuku (fallback) for
 * silent operations. Root is only used as a last-resort fallback.
 */
@Singleton
class RootPermissionChecker @Inject constructor() {

    companion object {
        private val SU_PATHS = listOf(
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/system/sbin/su",
            "/vendor/bin/su",
            "/data/local/su",
        )
        private val ROOT_PACKAGES = listOf(
            "com.topjohnwu.magisk",
            "com.noshufou.android.su",
            "com.thirdparty.superuser",
            "eu.chainfire.supersu",
            "me.weishu.kernelsu",
        )
    }

    @Volatile
    private var _rootAvailableCache: Boolean? = null

    /**
     * Check if root access is available on this device.
     *
     * @return true if su is found and executable.
     */
    fun isRootAvailable(): Boolean {
        _rootAvailableCache?.let { return it }
        val available = try {
            val process = Runtime.getRuntime().exec(arrayOf("su", "-c", "echo rootcheck"))
            val reader = java.io.BufferedReader(java.io.InputStreamReader(process.inputStream))
            val output = reader.readText()
            process.waitFor()
            reader.close()
            process.exitValue() == 0 && output.contains("rootcheck")
        } catch (e: Exception) {
            false
        }
        _rootAvailableCache = available
        return available
    }

    /**
     * Execute a command as root using `su -c`.
     *
     * @param command The shell command to execute as root.
     * @return [RootCommandResult] with exit code and output.
     */
    suspend fun executeAsRoot(command: String): RootCommandResult = withContext(Dispatchers.IO) {
        try {
            val process = Runtime.getRuntime().exec(arrayOf("su", "-c", command))
            val stdout = java.io.BufferedReader(java.io.InputStreamReader(process.inputStream)).readText()
            val stderr = java.io.BufferedReader(java.io.InputStreamReader(process.errorStream)).readText()
            val exitCode = process.waitFor()
            RootCommandResult(exitCode, stdout, stderr)
        } catch (e: Exception) {
            RootCommandResult(-1, "", e.message ?: "Unknown error")
        }
    }

    /**
     * Attempt to acquire root access (prompts user on first run).
     *
     * Merely tests `su -c id` and returns true if granted.
     */
    suspend fun requestRootAccess(): Boolean {
        val result = executeAsRoot("id")
        return result.exitCode == 0 && result.stdout.contains("uid=0")
    }

    /**
     * Get the root management app info (Magisk, SuperSU, etc.).
     *
     * @return Package name of the root manager, or null if none found.
     */
    fun getRootManagerPackage(): String? {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("pm", "list", "packages"))
            val reader = java.io.BufferedReader(java.io.InputStreamReader(process.inputStream))
            val output = reader.readText()
            process.waitFor()
            reader.close()
            for (pkg in ROOT_PACKAGES) {
                if (output.contains("package:$pkg")) return pkg
            }
            null
        } catch (e: Exception) {
            null
        }
    }
}

/** Result of executing a root command. */
data class RootCommandResult(
    val exitCode: Int,
    val stdout: String,
    val stderr: String,
)
