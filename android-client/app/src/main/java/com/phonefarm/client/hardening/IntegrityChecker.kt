package com.phonefarm.client.hardening

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import android.os.Debug
import android.os.Process
import androidx.core.content.pm.PackageInfoCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.BufferedReader
import java.io.File
import java.io.FileInputStream
import java.io.InputStreamReader
import java.security.MessageDigest
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.system.exitProcess

/**
 * Integrity verification layer for APK tamper detection.
 *
 * Checks the APK signature against the expected certificate, verifies DEX/SO
 * file CRCs, detects debugger attachment, and probes for Frida/Xposed hooks.
 */
@Singleton
class IntegrityChecker @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    companion object {
        private const val TAG = "IntegrityChecker"
        private const val EXPECTED_SIGNATURE_HASH =
            "TODO:replace-with-release-signature-sha256"
        private const val TAMPER_RESPONSE_DELAY_MS = 5000L
    }

    // ---- signature verification ----

    /**
     * Verify the APK signature matches the expected release certificate.
     *
     * Compares the SHA-256 hash of the first signature against [EXPECTED_SIGNATURE_HASH].
     * On debug builds the check is relaxed; on release builds a mismatch triggers
     * [onIntegrityFailure].
     *
     * @return true if the signature is valid (or is a debug build).
     */
    fun checkSignature(): Boolean {
        return try {
            val packageInfo: PackageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNING_CERTIFICATES
                )
            } else {
                @Suppress("DEPRECATION")
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNATURES
                )
            }

            val signatures: Array<Signature> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.signingInfo?.apkContentsSigners ?: emptyArray()
            } else {
                @Suppress("DEPRECATION")
                packageInfo.signatures ?: emptyArray()
            }

            if (signatures.isEmpty()) {
                onIntegrityFailure("No signatures found in APK")
                return false
            }

            val sigHash = MessageDigest.getInstance("SHA-256")
                .digest(signatures[0].toByteArray())
                .joinToString("") { "%02x".format(it) }

            // Debug builds are signed with the debug keystore — skip strict check.
            val isDebug = (packageInfo.applicationInfo?.flags ?: 0) and
                    android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0

            if (!isDebug && sigHash != EXPECTED_SIGNATURE_HASH) {
                onIntegrityFailure("Signature hash mismatch: expected=$EXPECTED_SIGNATURE_HASH actual=$sigHash")
                return false
            }

            true
        } catch (e: Exception) {
            onIntegrityFailure("Signature check exception: ${e.message}")
            false
        }
    }

    // ---- DEX integrity ----

    /**
     * Compute and compare CRC-32 checksums for all DEX files within the APK.
     *
     * On a tampered APK the DEX CRCs recorded in the ZIP central directory
     * will not match the recomputed values. This method iterates every entry
     * in the APK zip file and verifies classes*.dex entries.
     *
     * @return true if all DEX entries pass CRC verification.
     */
    fun checkDexIntegrity(): Boolean {
        return try {
            val apkPath = context.packageManager
                .getApplicationInfo(context.packageName, 0)
                .sourceDir
            val zipFile = ZipFile(apkPath)
            var allValid = true

            val entries = zipFile.entries()
            while (entries.hasMoreElements()) {
                val entry: ZipEntry = entries.nextElement()
                val name = entry.name
                // Check classes.dex, classes2.dex, classes3.dex, etc.
                if (name.startsWith("classes") && name.endsWith(".dex")) {
                    val expectedCrc = entry.crc
                    val actualCrc = computeCrc32(zipFile.getInputStream(entry))
                    if (expectedCrc != actualCrc) {
                        allValid = false
                        onIntegrityFailure("DEX CRC mismatch: $name expected=$expectedCrc actual=$actualCrc")
                        break
                    }
                }
            }

            zipFile.close()
            allValid
        } catch (e: Exception) {
            onIntegrityFailure("DEX integrity check exception: ${e.message}")
            false
        }
    }

    /**
     * Compute CRC-32 checksum from an input stream (reads fully).
     */
    private fun computeCrc32(inputStream: java.io.InputStream): Long {
        val crc = CRC32()
        val buffer = ByteArray(8192)
        var bytesRead: Int
        while (inputStream.read(buffer).also { bytesRead = it } != -1) {
            crc.update(buffer, 0, bytesRead)
        }
        inputStream.close()
        return crc.value
    }

    // ---- debugger detection ----

    /**
     * Check whether a debugger is currently attached to this process.
     *
     * Uses [Debug.isDebuggerConnected] and [Debug.waitingForDebugger]
     * which reflect the JDWP debugger state.
     *
     * @return true if a debugger is attached or waiting.
     */
    fun isDebuggerAttached(): Boolean {
        return Debug.isDebuggerConnected() || Debug.waitingForDebugger()
    }

    // ---- Frida detection ----

    /**
     * Detect Frida dynamic instrumentation by scanning for Frida-specific
     * port ranges, named threads, and library mappings.
     *
     * Checks:
     *  - /proc/self/maps for frida-agent or frida-gadget shared libraries
     *  - /proc/self/task for threads named "frida" or "gum-js-loop"
     *  - Default Frida TCP port 27042 being open
     *
     * @return true if any Frida indicators are found.
     */
    fun isFridaDetected(): Boolean {
        return try {
            if (checkProcMapsForFrida()) return true
            if (checkProcTasksForFrida()) return true
            if (checkFridaPort()) return true
            false
        } catch (e: Exception) {
            // If we cannot read /proc, assume detection isn't possible — log and continue.
            false
        }
    }

    private fun checkProcMapsForFrida(): Boolean {
        return try {
            val maps = File("/proc/self/maps")
            if (!maps.canRead()) return false
            val reader = BufferedReader(InputStreamReader(FileInputStream(maps)))
            val found = reader.useLines { lines ->
                lines.any { line ->
                    line.contains("frida-agent") ||
                    line.contains("frida-gadget") ||
                    line.contains("gum-js-loop") ||
                    line.contains("linjector")
                }
            }
            found
        } catch (_: Exception) {
            false
        }
    }

    private fun checkProcTasksForFrida(): Boolean {
        return try {
            val taskDir = File("/proc/self/task")
            if (!taskDir.isDirectory) return false
            val tasks = taskDir.listFiles() ?: return false
            tasks.any { task ->
                try {
                    val comm = File(task, "comm").readText().trim()
                    comm.contains("frida", ignoreCase = true) ||
                    comm.contains("gum-js", ignoreCase = true) ||
                    comm.contains("gadget", ignoreCase = true)
                } catch (_: Exception) {
                    false
                }
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun checkFridaPort(): Boolean {
        return try {
            val socket = java.net.Socket()
            socket.connect(java.net.InetSocketAddress("127.0.0.1", 27042), 500)
            socket.close()
            true
        } catch (_: Exception) {
            false
        }
    }

    // ---- Xposed detection ----

    /**
     * Detect Xposed framework hooking by checking for the XposedBridge
     * classloader and by looking for known Xposed/LSPosed package names.
     *
     * Checks:
     *  - ClassLoader for "de.robv.android.xposed.XposedBridge"
     *  - Installed packages matching known Xposed/LSPosed module IDs
     *  - /proc/self/maps for Xposed shared libraries
     *
     * @return true if any Xposed/LSPosed indicators are found.
     */
    fun isXposedDetected(): Boolean {
        return try {
            if (checkXposedClassLoader()) return true
            if (checkXposedPackages()) return true
            if (checkProcMapsForXposed()) return true
            false
        } catch (e: Exception) {
            false
        }
    }

    private fun checkXposedClassLoader(): Boolean {
        return try {
            ClassLoader.getSystemClassLoader()
                .loadClass("de.robv.android.xposed.XposedBridge")
            true
        } catch (_: ClassNotFoundException) {
            false
        }
    }

    private fun checkXposedPackages(): Boolean {
        val xposedPackages = listOf(
            "de.robv.android.xposed.installer",
            "org.lsposed.manager",
            "io.va.exposed",
        )
        return try {
            val installed = context.packageManager.getInstalledPackages(0)
            installed.any { pkg -> pkg.packageName in xposedPackages }
        } catch (_: Exception) {
            false
        }
    }

    private fun checkProcMapsForXposed(): Boolean {
        return try {
            val maps = File("/proc/self/maps")
            if (!maps.canRead()) return false
            val reader = BufferedReader(InputStreamReader(FileInputStream(maps)))
            val found = reader.useLines { lines ->
                lines.any { line ->
                    line.contains("XposedBridge") ||
                    line.contains("lsposed") ||
                    line.contains("xposed")
                }
            }
            found
        } catch (_: Exception) {
            false
        }
    }

    // ---- integrity failure handler ----

    /**
     * Called when any integrity check fails.
     *
     * Records the failure reason, optionally posts a tamper alert to the server,
     * and (on release builds) may delay or terminate the process to frustrate
     * reverse engineering.
     *
     * @param reason Human-readable description of the integrity failure.
     */
    fun onIntegrityFailure(reason: String) {
        android.util.Log.e(TAG, "Integrity failure: $reason")
        // TODO: Persist failure event to local DB for later reporting.
        // TODO: Send tamper alert WebSocket message to control server if connected.
        // TODO: On release builds, optionally schedule delayed exit to hinder analysis:
        //       Thread.sleep(TAMPER_RESPONSE_DELAY_MS); Process.killProcess(Process.myPid())
    }
}
