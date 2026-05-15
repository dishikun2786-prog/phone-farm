package com.phonefarm.client.crash

import android.content.Context
import android.os.Build
import android.os.Debug
import android.os.Process
import com.phonefarm.client.data.local.dao.CrashReportDao
import com.phonefarm.client.data.local.entity.CrashReportEntity
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Global uncaught exception handler for crash reporting.
 *
 * Installs itself as [Thread.setDefaultUncaughtExceptionHandler], collecting:
 *  - Full stack trace
 *  - Device info (model, Android version, ABI, total/available RAM)
 *  - Last ~50 logcat lines (runtime buffer capture)
 *  - Current executing script name (if available)
 *  - Memory state (heap usage, native heap, /proc/meminfo summary)
 *
 * Crash records are persisted to Room and can be uploaded to the control
 * server when connectivity is restored.
 */
@Singleton
class CrashReporter @Inject constructor(
    @ApplicationContext private val context: Context,
    private val crashReportDao: CrashReportDao,
) {

    companion object {
        private const val TAG = "CrashReporter"
        private const val MAX_LOG_LINES = 50

        /** In-app ring buffer — logcat is empty on Android 8+. */
        private val logBuffer = ArrayDeque<String>(MAX_LOG_LINES + 1)

        /** Append a log line to the ring buffer. Call from anywhere that produces logs. */
        @JvmStatic
        fun appendLog(tag: String, message: String) {
            synchronized(logBuffer) {
                if (logBuffer.size >= MAX_LOG_LINES) logBuffer.removeFirst()
                val ts = java.text.SimpleDateFormat("MM-dd HH:mm:ss.SSS", java.util.Locale.US)
                    .format(java.util.Date())
                logBuffer.addLast("$ts $tag: $message")
            }
        }

        /** Snapshot the ring buffer. */
        private fun snapshotLogBuffer(): String? {
            synchronized(logBuffer) {
                if (logBuffer.isEmpty()) return null
                return logBuffer.joinToString("\n")
            }
        }
    }

    /** The original handler that was in place before [install]. */
    private var previousHandler: Thread.UncaughtExceptionHandler? = null

    /** The name of the script currently executing, if any. Updated by the task runner. */
    @Volatile
    var currentScriptName: String? = null

    /** Callback invoked with crash report JSON. Wire to WebSocket sender. */
    var onReportCrash: ((String) -> Unit)? = null

    // ---- public API ----

    /**
     * Install this reporter as the default uncaught exception handler.
     * Safe to call multiple times (no-op after first install).
     */
    fun install() {
        if (previousHandler != null) return

        previousHandler = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            // Collect crash info synchronously (we are about to crash anyway).
            val entity = collectCrashEntity(
                throwable = throwable,
                thread = thread,
                crashType = "java_crash",
            )

            // Persist asynchronously — let the process crash handler continue
            // while the crash report is written in the background.
            try {
                GlobalScope.launch(Dispatchers.IO) {
                    crashReportDao.insert(entity)
                }
            } catch (_: Exception) {
                // Last-resort: write crash info to a plain file on disk.
                writeCrashToFile(entity)
            }

            // Delegate to the previous handler (usually the system default
            // which shows the "App has stopped" dialog).
            previousHandler?.uncaughtException(thread, throwable)
        }
    }

    /**
     * Report all pending (unreported) crash records to the control server.
     *
     * Expected to be called when the WebSocket connection is established
     * after a crash, or on a periodic retry schedule.
     */
    suspend fun reportPendingCrashes() {
        val sender = onReportCrash ?: return
        val unreported = crashReportDao.getUnreported()
        for (crash in unreported) {
            try {
                val crashJson = JSONObject().apply {
                    put("type", "crash_report")
                    put("crashType", crash.crashType)
                    put("stackTrace", crash.stackTrace)
                    put("deviceInfo", crash.deviceInfo)
                    put("scriptName", crash.scriptName)
                    put("memoryInfo", crash.memoryInfo)
                    put("logSnapshot", crash.logSnapshot)
                    put("timestamp", crash.timestamp)
                }.toString()
                sender(crashJson)
                crashReportDao.markReported(crash.id)
            } catch (_: Exception) {
                // Will retry on next invocation.
                break
            }
        }
    }

    // ---- data collection ----

    /**
     * Collect all crash diagnostic information into a [CrashReportEntity].
     */
    private fun collectCrashEntity(
        throwable: Throwable,
        thread: Thread,
        crashType: String,
    ): CrashReportEntity {
        return CrashReportEntity(
            crashType = crashType,
            stackTrace = stackTraceToString(throwable),
            deviceInfo = collectDeviceInfo(),
            scriptName = currentScriptName,
            memoryInfo = collectMemoryInfo(),
            logSnapshot = captureLogSnapshot(),
            timestamp = System.currentTimeMillis(),
            reported = false,
        )
    }

    /**
     * Convert a [Throwable] to a full multi-line stack trace string,
     * including cause chain.
     */
    private fun stackTraceToString(throwable: Throwable): String {
        val sw = StringWriter()
        val pw = PrintWriter(sw)
        throwable.printStackTrace(pw)
        var cause = throwable.cause
        while (cause != null) {
            pw.println("Caused by: ")
            cause.printStackTrace(pw)
            cause = cause.cause
        }
        pw.flush()
        return sw.toString()
    }

    /**
     * Collect device info as a JSON string.
     */
    private fun collectDeviceInfo(): String {
        return try {
            val json = JSONObject().apply {
                put("brand", Build.BRAND)
                put("manufacturer", Build.MANUFACTURER)
                put("model", Build.MODEL)
                put("androidVersion", Build.VERSION.RELEASE)
                put("sdkInt", Build.VERSION.SDK_INT)
                put("abi", Build.SUPPORTED_ABIS.joinToString(","))
                put("buildFingerprint", Build.FINGERPRINT)
                put("processPid", Process.myPid())
                put("processName", getProcessName())
                put("appVersion", getAppVersion())
            }
            json.toString(2)
        } catch (_: Exception) {
            "{}"
        }
    }

    /**
     * Collect memory state including heap usage and /proc/meminfo snippet.
     */
    private fun collectMemoryInfo(): String {
        return try {
            val runtime = Runtime.getRuntime()
            val heapUsed = runtime.totalMemory() - runtime.freeMemory()
            val heapMax = runtime.maxMemory()

            val memInfo = Debug.MemoryInfo()
            Debug.getMemoryInfo(memInfo)

            val json = JSONObject().apply {
                put("heapUsedMb", heapUsed / (1024 * 1024))
                put("heapMaxMb", heapMax / (1024 * 1024))
                put("nativeHeapMb", Debug.getNativeHeapAllocatedSize() / (1024 * 1024))
                put("pssKb", memInfo.totalPss)
                put("nativePssKb", memInfo.nativePss)
                put("dalvikPssKb", memInfo.dalvikPss)
                put("meminfoSummary", readProcMeminfoSummary())
            }
            json.toString(2)
        } catch (_: Exception) {
            "{}"
        }
    }

    /**
     * Capture the last ~50 lines from logcat (runtime buffer only).
     * On Android 8+, logcat may return empty for the app's own PID.
     * Falls back to the in-app ring buffer when logcat yields nothing.
     */
    private fun captureLogSnapshot(): String? {
        val logcatLines = try {
            val process = Runtime.getRuntime().exec(
                arrayOf("logcat", "-t", MAX_LOG_LINES.toString(), "-v", "threadtime")
            )
            val reader = process.inputStream.bufferedReader()
            val lines = reader.readLines()
            reader.close()
            process.destroy()
            if (lines.isNotEmpty()) lines.joinToString("\n") else null
        } catch (_: Exception) {
            null
        }

        // Fall back to in-app ring buffer on Android 8+ where logcat returns empty
        return logcatLines ?: snapshotLogBuffer()
    }

    /**
     * Fallback: write crash JSON to a plain file when Room is unavailable.
     */
    private fun writeCrashToFile(entity: CrashReportEntity) {
        try {
            val crashDir = java.io.File(context.filesDir, "crashes")
            crashDir.mkdirs()
            val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US)
                .format(Date(entity.timestamp))
            val file = java.io.File(crashDir, "crash_$timestamp.json")
            val json = JSONObject().apply {
                put("type", entity.crashType)
                put("stackTrace", entity.stackTrace)
                put("deviceInfo", entity.deviceInfo)
                put("scriptName", entity.scriptName)
                put("memoryInfo", entity.memoryInfo)
                put("timestamp", entity.timestamp)
            }
            file.writeText(json.toString(2))
        } catch (_: Exception) {
            // Completely unrecoverable — the process is about to die.
        }
    }

    // ---- helpers ----

    private fun getProcessName(): String {
        return try {
            java.io.File("/proc/self/cmdline").readText().trim().replace(" ", " ")
        } catch (_: Exception) {
            "unknown"
        }
    }

    private fun getAppVersion(): String {
        return try {
            val pkgInfo = context.packageManager
                .getPackageInfo(context.packageName, 0)
            pkgInfo.versionName ?: "unknown"
        } catch (_: Exception) {
            "unknown"
        }
    }

    private fun readProcMeminfoSummary(): String {
        return try {
            val file = java.io.File("/proc/meminfo")
            if (!file.canRead()) return "unavailable"
            val lines = file.readLines()
            val summary = lines.take(10).joinToString("; ")
            summary
        } catch (_: Exception) {
            "unavailable"
        }
    }
}
