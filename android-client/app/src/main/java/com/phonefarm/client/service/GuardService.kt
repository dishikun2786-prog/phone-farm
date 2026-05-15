package com.phonefarm.client.service

import android.app.ActivityManager
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import com.phonefarm.client.MainActivity
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject

/**
 * Dual-process daemon guard service — runs in `:guard` separate process.
 *
 * Monitors the main application process health and automatically restarts
 * [BridgeForegroundService] if it dies. The main service also monitors this
 * guard service (mutual watchdog pattern).
 *
 * Health check mechanisms (three layers):
 * 1. **ActivityManager** — checks [ActivityManager.getProcessesInErrorCondition]
 *    periodically for crashed/ANR'd processes.
 * 2. **Heartbeat file** — both services write timestamps to a shared file
 *    in the app's internal storage. If the main service's heartbeat is stale
 *    (>15 seconds), the guard restarts it.
 * 3. **Broadcast ping/pong** — the guard sends an explicit broadcast ping;
 *    the main service responds with a pong. If no response within the timeout,
 *    the main service is considered dead.
 *
 * Runs in process `:guard` specified via AndroidManifest `android:process=":guard"`.
 *
 * @property guardAlive Whether this guard service is currently running.
 */
@AndroidEntryPoint
class GuardService : Service() {

    companion object {
        const val TAG = "GuardService"
        const val NOTIFICATION_ID = 2001
        const val CHANNEL_ID = "phonefarm_guard"
        const val CHANNEL_NAME = "Guard Service"

        /** Heartbeat file name in the app's filesDir. */
        const val HEARTBEAT_FILE = "guard_heartbeat"

        /** Interval between health checks in milliseconds. */
        const val CHECK_INTERVAL_MS = 10_000L

        /** If the main service heartbeat is older than this, it's considered dead. */
        const val HEARTBEAT_STALE_THRESHOLD_MS = 15_000L

        /** Timeout for ping broadcast response. */
        const val PING_TIMEOUT_MS = 5_000L

        /** Broadcast action for guard ping. */
        const val ACTION_GUARD_PING = "com.phonefarm.client.action.GUARD_PING"

        /** Broadcast action for main service pong response. */
        const val ACTION_GUARD_PONG = "com.phonefarm.client.action.GUARD_PONG"

        /** WakeLock tag. */
        const val WAKELOCK_TAG = "phonefarm:guard_wakelock"

        /** Heartbeat key prefix. */
        const val HB_KEY_GUARD = "guard"
        const val HB_KEY_MAIN = "main"

        /** Target main service class name for restart. */
        const val MAIN_SERVICE_CLASS = "com.phonefarm.client.service.BridgeForegroundService"

        /**
         * Check if the guard service process is running.
         */
        fun isGuardProcessRunning(context: Context): Boolean {
            val manager = context.getSystemService(ACTIVITY_SERVICE) as ActivityManager
            val processes = manager.runningAppProcesses ?: return false
            return processes.any { it.processName.endsWith(":guard") }
        }
    }

    // ── State ──

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val isRunning = AtomicBoolean(false)
    private var wakeLock: PowerManager.WakeLock? = null
    private var healthCheckJob: kotlinx.coroutines.Job? = null
    private var heartbeatJob: kotlinx.coroutines.Job? = null

    /** Track consecutive main service failures. */
    private var consecutiveRestarts = 0
    private val maxConsecutiveRestarts = 5

    /** Whether we received a pong in the current cycle. */
    private val pongReceived = AtomicBoolean(false)

    /** Heartbeat file in shared storage. */
    private lateinit var heartbeatFile: File

    /** Broadcast receiver for pong responses. */
    private val pongReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == ACTION_GUARD_PONG) {
                pongReceived.set(true)
                Log.d(TAG, "Pong received from main service")
            }
        }
    }

    // ── Service lifecycle ──

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "GuardService created in process: ${getProcessName()}")

        isRunning.set(true)

        // Create notification channel (idempotent)
        createGuardChannel()

        // Initialize heartbeat file
        heartbeatFile = File(filesDir, HEARTBEAT_FILE)
        if (!heartbeatFile.exists()) {
            heartbeatFile.createNewFile()
        }

        // Register pong receiver
        val pongFilter = IntentFilter(ACTION_GUARD_PONG)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(pongReceiver, pongFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(pongReceiver, pongFilter)
        }

        // Request battery optimization exemption
        requestBatteryOptimizationExemption()

        // Acquire wake lock for health checks
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "GuardService starting, startId=$startId")

        // Start foreground notification
        val notification = buildGuardNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // Start health check loop
        startHealthChecks()

        // Start heartbeat writer
        startHeartbeatWriter()

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        Log.d(TAG, "GuardService destroying")
        isRunning.set(false)

        // Stop all coroutines
        healthCheckJob?.cancel()
        heartbeatJob?.cancel()
        scope.cancel()

        // Unregister broadcast receiver
        try {
            unregisterReceiver(pongReceiver)
        } catch (e: IllegalArgumentException) {
            // Receiver was already unregistered
        }

        // Release wake lock
        releaseWakeLock()

        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Schedule restart when the app task is removed from recents
        Log.d(TAG, "Task removed, scheduling restart via AlarmManager")
        scheduleRestart()
        stopSelf()
    }

    // ── Health check loop ──

    private fun startHealthChecks() {
        healthCheckJob = scope.launch {
            while (isActive && isRunning.get()) {
                try {
                    performHealthCheck()
                } catch (e: Exception) {
                    Log.e(TAG, "Health check error", e)
                }
                delay(CHECK_INTERVAL_MS)
            }
        }
    }

    /**
     * Perform a full health check cycle across all three layers.
     */
    private suspend fun performHealthCheck() {
        var mainServiceDead = false
        val reasons = mutableListOf<String>()

        // Layer 1: ActivityManager process check
        val amDead = checkActivityManagerProcesses()
        if (amDead) {
            mainServiceDead = true
            reasons.add("ActivityManager reports error condition")
        }

        // Layer 2: Heartbeat file check
        val hbDead = checkHeartbeat()
        if (hbDead) {
            mainServiceDead = true
            reasons.add("Heartbeat file stale")
        }

        // Layer 3: Broadcast ping/pong
        val pingDead = checkPingPong()
        if (pingDead) {
            mainServiceDead = true
            reasons.add("Ping timeout — no pong received")
        }

        if (mainServiceDead && consecutiveRestarts < maxConsecutiveRestarts) {
            Log.w(TAG, "Main service appears dead. Reasons: ${reasons.joinToString("; ")}")
            restartMainService()
        } else if (mainServiceDead) {
            Log.e(TAG, "Main service exceeded max restarts ($maxConsecutiveRestarts). " +
                "Reasons: ${reasons.joinToString("; ")}")
        } else {
            // Main service is healthy — reset restart counter
            consecutiveRestarts = 0
            Log.d(TAG, "Main service healthy (AM=${!amDead}, HB=${!hbDead}, Ping=${!pingDead})")
        }
    }

    // ── Layer 1: ActivityManager process checks ──

    /**
     * Check ActivityManager for processes in error condition.
     *
     * @return true if the main process is in an error condition.
     */
    private fun checkActivityManagerProcesses(): Boolean {
        return try {
            val manager = getSystemService(ACTIVITY_SERVICE) as ActivityManager

            // Check running app processes
            val runningProcesses = manager.runningAppProcesses ?: return false
            val mainProcessAlive = runningProcesses.any { info ->
                info.processName == packageName &&
                info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_SERVICE
            }

            // Check for processes in error condition (ANR, crash)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // Android 14+
                val errorProcesses = manager.processesInErrorCondition
                if (errorProcesses != null) {
                    val mainInError = errorProcesses.any { info ->
                        info.processName == packageName
                    }
                    if (mainInError) {
                        Log.w(TAG, "Main process reported in error condition")
                        return true
                    }
                }
            }

            // Process not running at all
            !mainProcessAlive
        } catch (e: Exception) {
            Log.e(TAG, "ActivityManager check failed", e)
            false
        }
    }

    // ── Layer 2: Heartbeat file check ──

    /**
     * Check if the main service's heartbeat is fresh.
     *
     * The main service writes its heartbeat timestamp to the shared file.
     * If the main service's entry is older than [HEARTBEAT_STALE_THRESHOLD_MS],
     * it's assumed dead.
     *
     * @return true if main heartbeat is stale/dead.
     */
    private fun checkHeartbeat(): Boolean {
        return try {
            if (!heartbeatFile.exists()) return true

            val content = heartbeatFile.readText().trim()
            val lines = content.split("\n").associate { line ->
                val parts = line.split("=", limit = 2)
                if (parts.size == 2) parts[0] to parts[1].toLongOrNull()
                else null to null
            }

            val mainTimestamp = lines[HB_KEY_MAIN]
            if (mainTimestamp == null) {
                Log.d(TAG, "Main heartbeat: no entry found")
                return true
            }

            val elapsed = SystemClock.elapsedRealtime() - mainTimestamp
            val stale = elapsed > HEARTBEAT_STALE_THRESHOLD_MS

            if (stale) {
                Log.w(TAG, "Main heartbeat stale: ${elapsed}ms (threshold: ${HEARTBEAT_STALE_THRESHOLD_MS}ms)")
            }

            stale
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat check error", e)
            false
        }
    }

    // ── Layer 3: Broadcast ping/pong ──

    /**
     * Send a ping broadcast and wait for the main service to pong back.
     *
     * @return true if no pong was received (main service is dead).
     */
    private suspend fun checkPingPong(): Boolean {
        pongReceived.set(false)

        val pingIntent = Intent(ACTION_GUARD_PING).apply {
            setPackage(packageName)
        }
        sendBroadcast(pingIntent)

        // Wait for pong
        val startTime = SystemClock.elapsedRealtime()
        while (SystemClock.elapsedRealtime() - startTime < PING_TIMEOUT_MS) {
            if (pongReceived.get()) return false
            delay(250)
        }

        Log.w(TAG, "Ping timeout: no pong received within ${PING_TIMEOUT_MS}ms")
        return true
    }

    // ── Heartbeat writer ──

    private fun startHeartbeatWriter() {
        heartbeatJob = scope.launch {
            while (isActive && isRunning.get()) {
                try {
                    writeGuardHeartbeat()
                } catch (e: Exception) {
                    Log.e(TAG, "Heartbeat write error", e)
                }
                delay(CHECK_INTERVAL_MS)
            }
        }
    }

    /**
     * Write the guard service's heartbeat timestamp to the shared file.
     */
    private fun writeGuardHeartbeat() {
        val timestamp = SystemClock.elapsedRealtime()
        val currentContent = try {
            heartbeatFile.readText().trim()
        } catch (e: Exception) {
            ""
        }

        val lines = currentContent.split("\n").filter { it.isNotBlank() }.toMutableList()
        val guardIndex = lines.indexOfFirst { it.startsWith("$HB_KEY_GUARD=") }

        val newLine = "$HB_KEY_GUARD=$timestamp"
        if (guardIndex >= 0) {
            lines[guardIndex] = newLine
        } else {
            // Keep only the latest entries, avoid growing too large
            if (lines.size >= 10) lines.removeAt(0)
            lines.add(newLine)
        }

        heartbeatFile.writeText(lines.joinToString("\n"))
    }

    // ── Main service restart ──

    /**
     * Restart the main BridgeForegroundService.
     */
    private fun restartMainService() {
        consecutiveRestarts++
        Log.w(TAG, "Restarting main service (attempt $consecutiveRestarts of $maxConsecutiveRestarts)")

        try {
            val serviceIntent = Intent().apply {
                setClassName(packageName, MAIN_SERVICE_CLASS)
                putExtra("restarted_by_guard", true)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }

            Log.d(TAG, "Main service restart command sent")

            // Give the main service time to start before next check
            // (handled naturally by the check interval)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to restart main service", e)
        }
    }

    /**
     * Schedule a restart of this guard service using AlarmManager
     * when the app task is removed from recents.
     */
    private fun scheduleRestart() {
        try {
            val alarmManager = getSystemService(ALARM_SERVICE) as android.app.AlarmManager
            val restartIntent = Intent(this, GuardService::class.java)
            val pendingIntent = PendingIntent.getService(
                this, 0, restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or
                    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
            )

            val triggerTime = SystemClock.elapsedRealtime() + 1000 // 1 second
            alarmManager.setExact(
                android.app.AlarmManager.ELAPSED_REALTIME_WAKEUP,
                triggerTime,
                pendingIntent,
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule restart via AlarmManager", e)
        }
    }

    // ── Battery optimization ──

    private fun requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = getSystemService(POWER_SERVICE) as PowerManager
            if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                try {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(intent)
                    Log.d(TAG, "Requested battery optimization exemption")
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to request battery optimization exemption: ${e.message}")
                }
            }
        }
    }

    // ── WakeLock management ──

    private fun acquireWakeLock() {
        try {
            val powerManager = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "$WAKELOCK_TAG:${getProcessName()}"
            ).apply {
                setReferenceCounted(false)
                acquire() // Held until service stops (released in onDestroy)
            }
            Log.d(TAG, "WakeLock acquired")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire WakeLock", e)
        }
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
                Log.d(TAG, "WakeLock released")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error releasing WakeLock", e)
        }
        wakeLock = null
    }

    // ── Foreground notification ──

    private fun buildGuardNotification(): Notification {
        val contentIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0),
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PhoneFarm Guard")
            .setContentText("Process watchdog active")
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(contentIntent)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    /**
     * Create the guard notification channel.
     */
    private fun createGuardChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                val channel = android.app.NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    android.app.NotificationManager.IMPORTANCE_MIN,
                ).apply {
                    description = "PhoneFarm process watchdog guard service"
                    setShowBadge(false)
                }
                manager.createNotificationChannel(channel)
            }
        }
    }

    /**
     * Get the current process name.
     */
    private fun getProcessName(): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            android.os.Process.myProcessName()
        } else {
            ":" + this::class.java.simpleName
        }
    }

    // ── Static heartbeat helpers (for use by BridgeForegroundService) ──

    /**
     * Write the main service's heartbeat from BridgeForegroundService context.
     * Call this periodically from the main service to keep the heartbeat fresh.
     */
    fun writeMainHeartbeat(context: Context) {
        try {
            val heartbeatFile = File(context.filesDir, HEARTBEAT_FILE)
            if (!heartbeatFile.exists()) heartbeatFile.createNewFile()

            val timestamp = SystemClock.elapsedRealtime()
            val currentContent = try {
                heartbeatFile.readText().trim()
            } catch (e: Exception) {
                ""
            }

            val lines = currentContent.split("\n").filter { it.isNotBlank() }.toMutableList()
            val mainIndex = lines.indexOfFirst { it.startsWith("$HB_KEY_MAIN=") }

            val newLine = "$HB_KEY_MAIN=$timestamp"
            if (mainIndex >= 0) {
                lines[mainIndex] = newLine
            } else {
                if (lines.size >= 10) lines.removeAt(0)
                lines.add(newLine)
            }

            heartbeatFile.writeText(lines.joinToString("\n"))
        } catch (e: Exception) {
            Log.e(TAG, "Error writing main heartbeat", e)
        }
    }

    /**
     * Handle a guard ping broadcast from the main process.
     * Should be called from BridgeForegroundService's broadcast receiver.
     */
    fun respondToPing(context: Context) {
        val pongIntent = Intent(ACTION_GUARD_PONG).apply {
            setPackage(context.packageName)
        }
        context.sendBroadcast(pongIntent)
    }
}
