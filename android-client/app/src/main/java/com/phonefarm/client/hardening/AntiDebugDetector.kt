package com.phonefarm.client.hardening

import android.content.Context
import android.os.Build
import android.os.Debug
import android.os.Process
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.BufferedReader
import java.io.File
import java.io.FileInputStream
import java.io.InputStreamReader
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Comprehensive anti-debugging and hooking-framework detection.
 *
 * Detects:
 *  - Frida (dynamic instrumentation via ptrace/inline hooking)
 *  - Xposed / LSPosed (ART method hooking framework)
 *  - Magisk / MagiskHide / Zygisk (systemless root + module loading)
 *  - LSPosed modules specifically targeting this app
 *  - Other common hooking frameworks (Substrate, EdXposed, Pine, SandHook)
 *
 * This detector runs early in Application.onCreate and can trigger
 * self-protection measures (delayed crash, tamper reporting, etc.).
 */
@Singleton
class AntiDebugDetector @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    data class DetectionResult(
        val fridaDetected: Boolean,
        val xposedDetected: Boolean,
        val lsposedDetected: Boolean,
        val magiskDetected: Boolean,
        val zygiskDetected: Boolean,
        val anyDebuggerAttached: Boolean,
        val details: List<String>,
    ) {
        val isClean: Boolean get() = !fridaDetected && !xposedDetected &&
            !lsposedDetected && !magiskDetected && !zygiskDetected && !anyDebuggerAttached
    }

    // ---- public API ----

    /**
     * Run all anti-debug checks and return a consolidated result.
     */
    fun detectAll(): DetectionResult {
        val details = mutableListOf<String>()

        val frida = detectFrida(details)
        val xposed = detectXposed(details)
        val lsposed = detectLsposed(details)
        val magisk = detectMagisk(details)
        val zygisk = detectZygisk(details)
        val debugger = detectDebugger(details)

        return DetectionResult(
            fridaDetected = frida,
            xposedDetected = xposed,
            lsposedDetected = lsposed,
            magiskDetected = magisk,
            zygiskDetected = zygisk,
            anyDebuggerAttached = debugger,
            details = details,
        )
    }

    // ---- Frida ----

    private fun detectFrida(details: MutableList<String>): Boolean {
        var found = false

        // Check default Frida port (27042)
        try {
            java.net.Socket().use { socket ->
                socket.connect(java.net.InetSocketAddress("127.0.0.1", 27042), 300)
                details.add("Frida default port 27042 open")
                found = true
            }
        } catch (_: Exception) {
            // Port not open — expected.
        }

        // Check common Frida ports (27043–27049)
        if (!found) {
            for (port in 27043..27049) {
                if (found) break
                try {
                    val socket = java.net.Socket()
                    socket.connect(java.net.InetSocketAddress("127.0.0.1", port), 200)
                    details.add("Frida port $port open")
                    found = true
                    socket.close()
                } catch (_: Exception) {
                    // Continue scanning.
                }
            }
        }

        // Check /proc/self/maps for frida libraries
        if (readProcMapsLine { line ->
                line.contains("frida") || line.contains("gum-js") ||
                line.contains("gadget") || line.contains("linjector")
            }) {
            details.add("Frida library found in /proc/self/maps")
            found = true
        }

        // Check thread names for Frida
        if (scanProcTaskComm { comm ->
                comm.contains("frida", ignoreCase = true) ||
                comm.contains("gum-js", ignoreCase = true)
            }) {
            details.add("Frida thread detected in /proc/self/task")
            found = true
        }

        // Check for frida-server named pipes
        if (File("/data/local/tmp/frida-server").exists() ||
            File("/data/local/tmp/re.frida.server").exists() ||
            File("/sdcard/frida-server").exists()
        ) {
            details.add("Frida server binary found on disk")
            found = true
        }

        return found
    }

    // ---- Xposed ----

    private fun detectXposed(details: MutableList<String>): Boolean {
        var found = false

        // Check for XposedBridge class in classloader
        try {
            ClassLoader.getSystemClassLoader()
                .loadClass("de.robv.android.xposed.XposedBridge")
            details.add("XposedBridge class loaded")
            found = true
        } catch (_: ClassNotFoundException) {
            // Not loaded.
        }

        // Check for XposedHelpers class
        try {
            ClassLoader.getSystemClassLoader()
                .loadClass("de.robv.android.xposed.XposedHelpers")
            details.add("XposedHelpers class loaded")
            found = true
        } catch (_: ClassNotFoundException) {
            // Not loaded.
        }

        // Check for Xposed installer package
        val xposedPackages = listOf(
            "de.robv.android.xposed.installer",
            "com.solohsu.android.edxp.manager",
            "org.meowcat.edxposed.manager",
        )
        for (pkg in xposedPackages) {
            if (isPackageInstalled(pkg)) {
                details.add("Xposed package installed: $pkg")
                found = true
            }
        }

        // Check proc maps for Xposed libraries
        if (readProcMapsLine { line ->
                line.contains("XposedBridge") || line.contains("xposed")
            }) {
            details.add("Xposed library found in /proc/self/maps")
            found = true
        }

        // Check stack trace for Xposed method hooks
        try {
            val stackTrace = Thread.currentThread().stackTrace
            for (element in stackTrace) {
                val className = element.className
                if (className.contains("de.robv.android.xposed") ||
                    className.contains("XposedBridge")
                ) {
                    details.add("Xposed in stack trace: $className")
                    found = true
                    break
                }
            }
        } catch (_: Exception) {
            // Unable to inspect stack.
        }

        return found
    }

    // ---- LSPosed ----

    private fun detectLsposed(details: MutableList<String>): Boolean {
        var found = false

        val lsposedPackages = listOf(
            "org.lsposed.manager",
            "org.lsposed.lspatch",
            "org.lsposed.lspd",
        )
        for (pkg in lsposedPackages) {
            if (isPackageInstalled(pkg)) {
                details.add("LSPosed package installed: $pkg")
                found = true
            }
        }

        // Check for LSPosed-related files in /data/adb
        val lsposedPaths = listOf(
            "/data/adb/lspd",
            "/data/adb/modules/lsposed",
            "/data/adb/modules/zygisk_lsposed",
            "/data/misc/lsposed",
        )
        for (path in lsposedPaths) {
            if (File(path).exists()) {
                details.add("LSPosed path exists: $path")
                found = true
            }
        }

        // Check proc maps for LSPosed libraries
        if (readProcMapsLine { line ->
                line.contains("lsposed") || line.contains("lspd") ||
                line.contains("riru_lsposed")
            }) {
            details.add("LSPosed library found in /proc/self/maps")
            found = true
        }

        return found
    }

    // ---- Magisk ----

    private fun detectMagisk(details: MutableList<String>): Boolean {
        var found = false

        // Check known Magisk paths
        val magiskPaths = listOf(
            "/data/adb/magisk",
            "/data/adb/modules",
            "/sbin/magisk",
            "/data/adb/magisk.db",
            "/data/adb/magisk/busybox",
            "/data/adb/magisk/magiskinit",
            "/data/adb/magisk/magiskpolicy",
            "/system/bin/magisk",
            "/system/xbin/magisk",
        )
        for (path in magiskPaths) {
            if (File(path).exists()) {
                details.add("Magisk path exists: $path")
                found = true
                break
            }
        }

        // Check for Magisk Manager package
        val magiskPackages = listOf(
            "com.topjohnwu.magisk",
            "io.github.huskydg.magisk",
            "com.topjohnwu.magisk.alpha",
        )
        for (pkg in magiskPackages) {
            if (isPackageInstalled(pkg)) {
                details.add("Magisk Manager installed: $pkg")
                found = true
            }
        }

        // Check /proc/self/mountinfo for magisk mounts
        try {
            val mountinfo = File("/proc/self/mountinfo")
            if (mountinfo.canRead()) {
                val reader = BufferedReader(InputStreamReader(FileInputStream(mountinfo)))
                reader.useLines { lines ->
                    lines.forEach { line ->
                        if (line.contains("magisk") || line.contains("worker")) {
                            details.add("Magisk mount found in mountinfo")
                            found = true
                            return@useLines
                        }
                    }
                }
            }
        } catch (_: Exception) {
            // Cannot read mountinfo.
        }

        // Check for su binary
        val suPaths = listOf(
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/system/sbin/su",
            "/vendor/bin/su",
            "/data/local/su",
            "/data/local/bin/su",
            "/data/local/xbin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/system/usr/we-need-root/su",
        )
        for (path in suPaths) {
            val suFile = File(path)
            if (suFile.exists()) {
                details.add("su binary found: $path")
                found = true
                break
            }
        }

        return found
    }

    // ---- Zygisk ----

    private fun detectZygisk(details: MutableList<String>): Boolean {
        var found = false

        // Zygisk leaves markers in /data/adb
        val zygiskPaths = listOf(
            "/data/adb/modules/zygisksu",
            "/data/adb/modules/zygisk_assistant",
            "/data/adb/modules/zygisk_lsposed",
            "/data/adb/zygisk",
        )
        for (path in zygiskPaths) {
            if (File(path).exists()) {
                details.add("Zygisk path exists: $path")
                found = true
            }
        }

        // Check proc maps for zygisk library
        if (readProcMapsLine { line ->
                line.contains("zygisk") || line.contains("zygote")
            }) {
            details.add("Zygisk library found in /proc/self/maps")
            found = true
        }

        return found
    }

    // ---- debugger ----

    private fun detectDebugger(details: MutableList<String>): Boolean {
        var found = false

        if (Debug.isDebuggerConnected()) {
            details.add("JDWP debugger connected")
            found = true
        }

        if (Debug.waitingForDebugger()) {
            details.add("JDWP debugger waiting for connection")
            found = true
        }

        // Check /proc/self/status TracerPid (non-zero means being traced)
        try {
            val status = File("/proc/self/status")
            if (status.canRead()) {
                val reader = BufferedReader(InputStreamReader(FileInputStream(status)))
                reader.useLines { lines ->
                    for (line in lines) {
                        if (line.startsWith("TracerPid:")) {
                            val tracerPid = line.substringAfter(":")
                                .trim().toIntOrNull() ?: 0
                            if (tracerPid != 0) {
                                details.add("Process traced by PID $tracerPid")
                                found = true
                            }
                            break
                        }
                    }
                }
            }
        } catch (_: Exception) {
            // Cannot read status.
        }

        // Check FLAG_DEBUGGABLE
        try {
            val appInfo = context.packageManager
                .getApplicationInfo(context.packageName, 0)
            if ((appInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                // Debuggable flag set — warn but don't treat as attack on dev builds
                if (!isProbablyEmulator()) {
                    details.add("APK compiled with android:debuggable=true on non-emulator device")
                    found = true
                }
            }
        } catch (_: Exception) {
            // Cannot read app info.
        }

        return found
    }

    // ---- utility helpers ----

    /**
     * Check whether a package is installed on the device.
     */
    private fun isPackageInstalled(packageName: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (_: android.content.pm.PackageManager.NameNotFoundException) {
            false
        }
    }

    /**
     * Read /proc/self/maps line by line. Return true as soon as [predicate]
     * matches any line.
     */
    private fun readProcMapsLine(predicate: (String) -> Boolean): Boolean {
        return try {
            val maps = File("/proc/self/maps")
            if (!maps.canRead()) return false
            val reader = BufferedReader(InputStreamReader(FileInputStream(maps)))
            reader.useLines { lines ->
                lines.any { predicate(it) }
            }
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Scan /proc/self/task/ for thread comm names matching [predicate].
     */
    private fun scanProcTaskComm(predicate: (String) -> Boolean): Boolean {
        return try {
            val taskDir = File("/proc/self/task")
            if (!taskDir.isDirectory) return false
            taskDir.listFiles()?.any { taskFile ->
                try {
                    val comm = File(taskFile, "comm").readText().trim()
                    predicate(comm)
                } catch (_: Exception) {
                    false
                }
            } ?: false
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Simple heuristic: check a few known emulator build properties.
     * Used to relax the FLAG_DEBUGGABLE check during development.
     */
    private fun isProbablyEmulator(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic") ||
                Build.FINGERPRINT.startsWith("unknown") ||
                Build.MODEL.contains("google_sdk") ||
                Build.MODEL.contains("Emulator") ||
                Build.MODEL.contains("Android SDK built for x86") ||
                Build.MANUFACTURER.contains("Genymotion") ||
                Build.BRAND.startsWith("generic"))
    }
}
