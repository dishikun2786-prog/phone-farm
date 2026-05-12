package com.phonefarm.client.crash

import android.content.Context
import android.os.Build
import android.os.Debug
import android.os.Process
import com.phonefarm.client.data.local.dao.CrashReportDao
import com.phonefarm.client.data.local.entity.CrashReportEntity
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
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
    }

    /** The original handler that was in place before [install]. */
    private var previousHandler: Thread.UncaughtExceptionHandler? = null

    /** The name of the script currently executing, if any. Updated by the task runner. */
    @Volatile
    var currentScriptName: String? = null

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

            // Persist synchronously on IO thread via a fire-and-forget coroutine.
            try {
                CoroutineScope(Dispatchers.IO).launch {
                    crashReportDao.insert(entity)
                }
                // Give Room a moment to flush the write.
                Thread.sleep(500)
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
        val unreported = crashReportDao.getUnreported()
        for (crash in unreported) {
            try {
                // TODO: Send crash report to control server via REST or WebSocket.
                //       POST /api/v1/crashes with the crash data as JSON.
                //       On success, mark as reported.
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
     * Uses shell execution which may be rate-limited on newer Android versions.
     */
    private fun captureLogSnapshot(): String? {
        return try {
            val process = Runtime.getRuntime().exec(
                arrayOf("logcat", "-t", MAX_LOG_LINES.toString(), "-v", "threadtime")
            )
            val reader = process.inputStream.bufferedReader()
            val lines = reader.readLines()
            reader.close()
            process.destroy()
            lines.joinToString("\n")
        } catch (_: Exception) {
            null
        }
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
