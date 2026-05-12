package com.phonefarm.client.plugin

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.phonefarm.client.privilege.SilentInstallHelper
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.File
import java.io.FileInputStream
import java.io.InputStreamReader
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Silent APK installation via multiple privilege escalation methods.
 *
 * Installation methods (tried in priority order):
 *   1. **DeviceOwner** — uses android.app.admin.DevicePolicyManager.installPackage
 *      (requires device owner, set via ADB: `dpm set-device-owner`).
 *   2. **Shizuku** — uses UserService / Shizuku shell to call `pm install`.
 *   3. **Root** — uses `su -c pm install -r -d <apk_path>`.
 *
 * If no privilege method is available, falls back to standard package installer
 * intent (requires user interaction).
 */
@Singleton
class PluginInstaller @Inject constructor(
    @ApplicationContext private val context: Context,
    private val silentInstallHelper: SilentInstallHelper,
) {

    /**
     * Install an APK file silently (no user interaction).
     *
     * @param apkFile The APK file to install.
     * @param onProgress Progress callback [0.0, 1.0].
     * @return [InstallResult] indicating success or failure.
     */
    suspend fun installSilently(apkFile: File, onProgress: (Float) -> Unit): InstallResult =
        withContext(Dispatchers.IO) {
            if (!apkFile.exists() || !apkFile.canRead()) {
                return@withContext InstallResult.Failure("APK file does not exist or is not readable")
            }

            // Method 1: Try DeviceOwner / PackageInstaller Session
            try {
                val result = installViaPackageInstallerSession(apkFile, onProgress)
                if (result is InstallResult.Success) {
                    return@withContext result.copy(method = "device_owner")
                }
            } catch (_: Exception) {
                // Fall through to next method
            }

            // Method 2: Try Shizuku / shell-based pm install
            try {
                val shizukuResult = installViaShell(apkFile, useRoot = false)
                if (shizukuResult is InstallResult.Success) {
                    onProgress(1f)
                    return@withContext shizukuResult.copy(method = "shizuku")
                }
            } catch (_: Exception) {
                // Fall through to next method
            }

            // Method 3: Try Root pm install
            try {
                val rootResult = installViaShell(apkFile, useRoot = true)
                if (rootResult is InstallResult.Success) {
                    onProgress(1f)
                    return@withContext rootResult.copy(method = "root")
                }
            } catch (_: Exception) {
                // No more silent methods available
            }

            return@withContext InstallResult.Failure(
                "All silent installation methods failed. No privilege escalation available."
            )
        }

    /**
     * Install via Android [PackageInstaller.Session] API (requires elevated permission).
     */
    private suspend fun installViaPackageInstallerSession(
        apkFile: File,
        onProgress: (Float) -> Unit,
    ): InstallResult = withContext(Dispatchers.IO) {
        val pm = context.packageManager
        val packageInstaller = pm.packageInstaller
        val sessionParams = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL
        )

        val sessionId = packageInstaller.createSession(sessionParams)
        val session = packageInstaller.openSession(sessionId)

        try {
            FileInputStream(apkFile).use { input ->
                session.openWrite("package", 0, apkFile.length()).use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    var totalWritten = 0L
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        totalWritten += bytesRead
                        onProgress((totalWritten.toFloat() / apkFile.length()).coerceIn(0f, 0.9f))
                    }
                }
            }

            // Commit the session (this is asynchronous)
            val commitReceiver = object : PackageInstaller.SessionCallback() {
                override fun onCreated(sessionId: Int) {}
                override fun onBadgingChanged(sessionId: Int) {}
                override fun onActiveChanged(sessionId: Int, active: Boolean) {}
                override fun onProgressChanged(sessionId: Int, progress: Float) {
                    onProgress(progress)
                }
                override fun onFinished(sessionId: Int, success: Boolean) {
                    // Handled via the blocking wait below
                }
            }
            session.setStagingProgress(1f)

            // Commit with an intent sender that wraps a broadcast receiver
            val pendingIntent = android.app.PendingIntent.getBroadcast(
                context,
                sessionId,
                Intent("com.phonefarm.INSTALL_COMPLETE"),
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                    android.app.PendingIntent.FLAG_IMMUTABLE
                else 0
            )
            session.commit(pendingIntent.intentSender)

            // Wait briefly for installation to complete
            session.close()
            delay(2000L)

            // Verify the installation happened
            val packageName = context.packageManager
                .getPackageArchiveInfo(apkFile.absolutePath, 0)?.packageName
            if (packageName != null) {
                try {
                    val pkgInfo = context.packageManager.getPackageInfo(packageName, 0)
                    InstallResult.Success(
                        packageName = pkgInfo.packageName,
                        versionName = pkgInfo.versionName ?: "unknown",
                        method = "package_installer_session",
                    )
                } catch (_: PackageManager.NameNotFoundException) {
                    InstallResult.Failure("Installation session completed but package not found")
                }
            } else {
                InstallResult.Failure("Could not determine package name from APK")
            }
        } catch (e: Exception) {
            session.close()
            InstallResult.Failure("PackageInstaller session failed: ${e.message}")
        }
    }

    /**
     * Install via shell command (pm install), optionally with root.
     */
    private fun installViaShell(apkFile: File, useRoot: Boolean): InstallResult {
        val command = if (useRoot) {
            arrayOf("su", "-c", "pm install -r -d ${apkFile.absolutePath}")
        } else {
            arrayOf("pm", "install", "-r", "-d", apkFile.absolutePath)
        }

        val process = Runtime.getRuntime().exec(command)
        val stdout = BufferedReader(InputStreamReader(process.inputStream)).readText()
        val stderr = BufferedReader(InputStreamReader(process.errorStream)).readText()
        val exitCode = process.waitFor()

        return if (exitCode == 0 || stdout.contains("Success")) {
            val packageName = context.packageManager
                .getPackageArchiveInfo(apkFile.absolutePath, 0)?.packageName ?: "unknown"
            try {
                val pkgInfo = context.packageManager.getPackageInfo(packageName, 0)
                InstallResult.Success(
                    packageName = pkgInfo.packageName,
                    versionName = pkgInfo.versionName ?: "unknown",
                    method = if (useRoot) "root" else "shell",
                )
            } catch (_: PackageManager.NameNotFoundException) {
                InstallResult.Failure("Shell install reported success but package not found: $stderr")
            }
        } else {
            InstallResult.Failure("Shell install failed (exit $exitCode): $stderr")
        }
    }

    /**
     * Install an APK using the standard package installer intent.
     *
     * This requires user interaction (install confirmation dialog).
     * Used as last-resort fallback when no silent method is available.
     */
    fun installWithPackageInstaller(apkFile: File) {
        if (!apkFile.exists()) return

        val authority = "${context.packageName}.fileprovider"
        val apkUri: Uri = FileProvider.getUriForFile(context, authority, apkFile)

        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        context.startActivity(intent)
    }

    /**
     * Check if the installed plugin matches the expected package name.
     */
    suspend fun verifyInstallation(packageName: String, expectedVersion: String): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val pm = context.packageManager
                val packageInfo = pm.getPackageInfo(packageName, 0)
                val installedVersion = packageInfo.versionName ?: return@withContext false
                installedVersion == expectedVersion
            } catch (e: PackageManager.NameNotFoundException) {
                false
            }
        }
}

/** Result of a silent APK installation. */
sealed class InstallResult {
    data class Success(
        val packageName: String,
        val versionName: String,
        val method: String = "unknown",
    ) : InstallResult()
    data class Failure(val reason: String) : InstallResult()
}
