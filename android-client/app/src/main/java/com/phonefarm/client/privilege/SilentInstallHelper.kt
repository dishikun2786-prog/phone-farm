package com.phonefarm.client.privilege

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Auto-select the best available method for silent APK installation.
 *
 * Priority order:
 *   1. **DeviceOwner** — DevicePolicyManager.installPackage (no user interaction)
 *   2. **Shizuku** — Shizuku UserService / shell `pm install`
 *   3. **Root** — `su -c pm install -r -d <apk>`
 *   4. **PackageInstaller** — Standard Android PackageInstaller session (API 21+)
 *   5. **ACTION_VIEW** — Standard install intent (requires user confirmation)
 *
 * The helper probes each method in priority order and returns the first
 * available. Methods 1-3 are truly "silent" (no UI). Method 4 may show
 * OEM-specific UI. Method 5 always shows a dialog.
 */
@Singleton
class SilentInstallHelper @Inject constructor(
    @ApplicationContext private val context: Context,
    private val deviceOwnerManager: DeviceOwnerManager,
    private val rootPermissionChecker: RootPermissionChecker,
) {

    /**
     * Determine the best available installation method.
     *
     * @return The highest-priority [InstallMethod] available on this device.
     */
    fun detectBestMethod(): InstallMethod {
        // 1. DeviceOwner — truly silent, highest priority
        if (deviceOwnerManager.isDeviceOwner()) return InstallMethod.DEVICE_OWNER

        // 2. Shizuku — silent via Shizuku UserService or shell
        if (isShizukuAvailable()) return InstallMethod.SHIZUKU

        // 3. Root — silent via su -c pm install
        if (rootPermissionChecker.isRootAvailable()) return InstallMethod.ROOT

        // 4. PackageInstaller — may show OEM-specific UI (API 21+)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            return InstallMethod.PACKAGE_INSTALLER
        }

        // 5. Always fall back — shows user confirmation dialog
        return InstallMethod.ACTION_VIEW
    }

    /**
     * Install an APK using the best available method.
     *
     * @param apkFile The APK file to install.
     * @return [InstallMethodResult] with the method used and success/failure.
     */
    suspend fun installWithBestMethod(apkFile: File): InstallMethodResult {
        val method = detectBestMethod()
        return try {
            when (method) {
                InstallMethod.DEVICE_OWNER -> installViaDeviceOwner(apkFile)
                InstallMethod.SHIZUKU -> installViaShizuku(apkFile)
                InstallMethod.ROOT -> installViaRoot(apkFile)
                InstallMethod.PACKAGE_INSTALLER -> installViaPackageInstaller(apkFile)
                InstallMethod.ACTION_VIEW -> installViaActionView(apkFile)
            }
        } catch (e: Exception) {
            InstallMethodResult(method, false, e.message)
        }
    }

    /**
     * Check if any silent method is available (methods 1-3).
     */
    fun canInstallSilently(): Boolean {
        return detectBestMethod().isSilent
    }

    /**
     * Check if Shizuku is available and authorized.
     */
    fun isShizukuAvailable(): Boolean {
        return try {
            rikka.shizuku.Shizuku.pingBinder()
        } catch (_: SecurityException) {
            false
        } catch (_: Exception) {
            false
        }
    }

    // ---- Private install helpers ----

    private fun installViaDeviceOwner(apkFile: File): InstallMethodResult {
        return try {
            deviceOwnerManager.installPackage(apkFile)
            InstallMethodResult(InstallMethod.DEVICE_OWNER, true, null)
        } catch (e: Exception) {
            InstallMethodResult(InstallMethod.DEVICE_OWNER, false, e.message)
        }
    }

    private fun installViaShizuku(apkFile: File): InstallMethodResult {
        return try {
            val process = Runtime.getRuntime().exec(
                arrayOf("pm", "install", "-r", "-d", apkFile.absolutePath)
            )
            val exitCode = process.waitFor()
            if (exitCode == 0) {
                InstallMethodResult(InstallMethod.SHIZUKU, true, null)
            } else {
                val errorOutput = process.errorStream.bufferedReader().readText()
                InstallMethodResult(InstallMethod.SHIZUKU, false, errorOutput.ifBlank { "Exit code: $exitCode" })
            }
        } catch (e: Exception) {
            InstallMethodResult(InstallMethod.SHIZUKU, false, e.message)
        }
    }

    private fun installViaRoot(apkFile: File): InstallMethodResult {
        return try {
            val process = Runtime.getRuntime().exec(
                arrayOf("su", "-c", "pm install -r -d ${apkFile.absolutePath}")
            )
            val exitCode = process.waitFor()
            if (exitCode == 0) {
                InstallMethodResult(InstallMethod.ROOT, true, null)
            } else {
                val errorOutput = process.errorStream.bufferedReader().readText()
                InstallMethodResult(InstallMethod.ROOT, false, errorOutput.ifBlank { "Exit code: $exitCode" })
            }
        } catch (e: Exception) {
            InstallMethodResult(InstallMethod.ROOT, false, e.message)
        }
    }

    @Suppress("DEPRECATION")
    private fun installViaPackageInstaller(apkFile: File): InstallMethodResult {
        return try {
            val packageInstaller = context.packageManager.packageInstaller
            val sessionParams = android.content.pm.PackageInstaller.SessionParams(
                android.content.pm.PackageInstaller.SessionParams.MODE_FULL_INSTALL
            )
            val sessionId = packageInstaller.createSession(sessionParams)
            val session = packageInstaller.openSession(sessionId)

            session.use { s ->
                apkFile.inputStream().use { input ->
                    s.openWrite("package", 0, apkFile.length()).use { output ->
                        input.copyTo(output)
                    }
                }
                val pendingIntent = android.app.PendingIntent.getBroadcast(
                    context,
                    sessionId,
                    android.content.Intent("com.phonefarm.client.INSTALL_COMPLETE"),
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
                )
                s.commit(pendingIntent.intentSender)
            }
            InstallMethodResult(InstallMethod.PACKAGE_INSTALLER, true, null)
        } catch (e: Exception) {
            InstallMethodResult(InstallMethod.PACKAGE_INSTALLER, false, e.message)
        }
    }

    private fun installViaActionView(apkFile: File): InstallMethodResult {
        return try {
            val uri: android.net.Uri = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                androidx.core.content.FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    apkFile
                )
            } else {
                android.net.Uri.fromFile(apkFile)
            }
            val intent = android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(intent)
            InstallMethodResult(InstallMethod.ACTION_VIEW, true, null)
        } catch (e: Exception) {
            InstallMethodResult(InstallMethod.ACTION_VIEW, false, e.message)
        }
    }
}

/** Available installation methods. */
enum class InstallMethod(val isSilent: Boolean) {
    DEVICE_OWNER(true),
    SHIZUKU(true),
    ROOT(true),
    PACKAGE_INSTALLER(false),
    ACTION_VIEW(false),
}

/** Result of an install attempt. */
data class InstallMethodResult(
    val method: InstallMethod,
    val success: Boolean,
    val errorMessage: String?,
)
