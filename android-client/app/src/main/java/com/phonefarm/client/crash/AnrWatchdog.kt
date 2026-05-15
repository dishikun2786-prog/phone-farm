package com.phonefarm.client.crash

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Printer
import com.phonefarm.client.data.local.dao.CrashReportDao
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import com.phonefarm.client.data.local.entity.CrashReportEntity
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * ANR (Application Not Responding) detection via main thread message queue monitoring.
 *
 * Android reports ANRs when the main thread is blocked for > 5 seconds while
 * processing a touch event or broadcast, but the system does NOT report ANRs
 * caused by background service stalls. This watchdog provides a secondary
 * detection layer:
 *
 * 1. Sets a [Printer] on [Looper.getMainLooper] to intercept message dispatch.
 * 2. Every ~1 second, checks whether a dispatched message has not yet completed.
 * 3. If a message takes > 5 seconds, collects a stack trace and reports via
 *    [CrashReporter] (or direct file write).
 *
 * The watchdog itself runs on an internal background thread to avoid
 * contributing to main-thread congestion.
 */
@Singleton
class AnrWatchdog @Inject constructor(
    @ApplicationContext private val context: Context,
    private val crashReportDao: CrashReportDao,
) {

    companion object {
        private const val TAG = "AnrWatchdog"
        /** Duration in ms after which to trigger an ANR report. */
        private const val ANR_THRESHOLD_MS = 5000L
        /** How often to check (ms). */
        private const val CHECK_INTERVAL_MS = 1000L
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var isRunning = false

    /** A dedicated background thread for monitor ticks. */
    private var monitorThread: Thread? = null

    /** Timestamp when the current message dispatch started (set by Printer). */
    @Volatile
    private var dispatchStartTime = 0L

    // ---- public API ----

    /**
     * Start ANR monitoring.
     *
     * Installs a Looper Printer and starts the background tick thread.
     * If the main thread blocks for longer than [ANR_THRESHOLD_MS], a
     * report is generated.
     *
     * Safe to call multiple times — subsequent calls are ignored if already running.
     */
    fun start() {
        if (isRunning) return
        isRunning = true

        // Install a Printer on the main looper to track message dispatch timing.
        // setMessageLogging is deprecated from API 30 but still functional;
        // the replacement (Looper.setObserver) is only available from API 35.
        @Suppress("DEPRECATION")
        Looper.getMainLooper().setMessageLogging(object : Printer {
            override fun println(x: String?) {
                if (x == null) return
                // Each message dispatch is bracketed by:
                //   ">>>>> Dispatching to ..." (start)
                //   "<<<<< Finished to ..."   (end)
                if (x.startsWith(">>>>> Dispatching")) {
                    dispatchStartTime = System.currentTimeMillis()
                }
                if (x.startsWith("<<<<< Finished")) {
                    dispatchStartTime = 0L
                }
            }
        })

        // Start the background monitor thread.
        monitorThread = Thread({
            while (isRunning) {
                try {
                    Thread.sleep(CHECK_INTERVAL_MS)
                } catch (_: InterruptedException) {
                    break
                }
                checkForAnr()
            }
        }, "AnrWatchdog-Monitor").apply {
            isDaemon = true
            priority = Thread.NORM_PRIORITY
            start()
        }
    }

    /**
     * Stop ANR monitoring and tear down the monitor thread.
     */
    fun stop() {
        isRunning = false
        monitorThread?.interrupt()
        monitorThread = null
        scope.cancel()
        dispatchStartTime = 0L
        Looper.getMainLooper().setMessageLogging(null)
    }

    // ---- internal ----

    /**
     * Check whether the main thread appears to be blocked.
     */
    private fun checkForAnr() {
        val startTime = dispatchStartTime
        if (startTime == 0L) return // No message currently being dispatched.

        val elapsed = System.currentTimeMillis() - startTime
        if (elapsed >= ANR_THRESHOLD_MS) {
            reportAnr(elapsed)
        }
    }

    /**
     * Collect diagnostic information and write an ANR report.
     */
    private fun reportAnr(blockedMs: Long) {
        val mainThread = Looper.getMainLooper().thread

        val stackTrace = buildString {
            appendLine("=== ANR Watchdog Report ===")
            appendLine("Main thread blocked for: ${blockedMs}ms")
            appendLine("Thread name: ${mainThread.name}")
            appendLine("Thread state: ${mainThread.state}")
            appendLine()
            appendLine("Main thread stack trace:")
            for (element in mainThread.stackTrace) {
                appendLine("    at $element")
            }
            appendLine()
            appendLine("All thread stack traces:")
            val allThreads = Thread.getAllStackTraces()
            for ((thread, stack) in allThreads) {
                appendLine("  Thread: ${thread.name} (${thread.state})")
                for (element in stack) {
                    appendLine("    at $element")
                }
                appendLine()
            }
        }

        android.util.Log.e(TAG, stackTrace)

        // Persist ANR report to Room DB; fall back to plain file.
        val deviceInfo = try {
            org.json.JSONObject().apply {
                put("brand", android.os.Build.BRAND)
                put("model", android.os.Build.MODEL)
                put("androidVersion", android.os.Build.VERSION.RELEASE)
                put("sdkInt", android.os.Build.VERSION.SDK_INT)
                put("blockedMs", blockedMs)
            }.toString(2)
        } catch (_: Exception) { "{}" }

        val entity = CrashReportEntity(
            crashType = "anr",
            stackTrace = stackTrace,
            deviceInfo = deviceInfo,
            scriptName = null,
            memoryInfo = null,
            logSnapshot = null,
            timestamp = System.currentTimeMillis(),
            reported = false,
        )
        try {
            scope.launch { crashReportDao.insert(entity) }
        } catch (_: Exception) {
            // Fallback: write to plain file
            try {
                val anrDir = java.io.File(context.filesDir, "anrs")
                anrDir.mkdirs()
                val ts = java.text.SimpleDateFormat("yyyyMMdd_HHmmss_SSS", java.util.Locale.US)
                    .format(java.util.Date())
                java.io.File(anrDir, "anr_$ts.txt").writeText(stackTrace)
            } catch (_: Exception) { }
        }

        // Reset the dispatch start time to avoid duplicate reports for
        // the same blocking event.
        dispatchStartTime = 0L
    }
}
