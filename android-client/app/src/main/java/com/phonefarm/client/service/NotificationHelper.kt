package com.phonefarm.client.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat

/**
 * Centralized notification channel creation and notification builder utilities.
 *
 * Manages 3 notification channels:
 * - **tasks** (IMPORTANCE_HIGH): task start/stop/status notifications.
 * - **system** (IMPORTANCE_DEFAULT): connection state, sync, activation.
 * - **marketing** (IMPORTANCE_LOW): non-critical updates.
 */
object NotificationHelper {

    const val CHANNEL_TASKS = "phonefarm_tasks"
    const val CHANNEL_SYSTEM = "phonefarm_system"
    const val CHANNEL_MARKETING = "phonefarm_marketing"

    /**
     * TODO: Create all 3 notification channels.
     * Idempotent — safe to call on every app start.
     * Must be called before posting any notifications on API 26+.
     */
    fun createNotificationChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val tasksChannel = NotificationChannel(
            CHANNEL_TASKS,
            "Tasks",
            android.app.NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Task execution notifications (start, progress, completion)"
            // TODO: Configure vibration pattern, LED color, lock screen visibility.
        }

        val systemChannel = NotificationChannel(
            CHANNEL_SYSTEM,
            "System",
            android.app.NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Connection state, sync status, activation info"
        }

        val marketingChannel = NotificationChannel(
            CHANNEL_MARKETING,
            "Updates",
            android.app.NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "App updates, tips, non-critical alerts"
        }

        manager.createNotificationChannels(listOf(tasksChannel, systemChannel, marketingChannel))
    }

    /**
     * TODO: Build a foreground service notification showing connection state, device name, and active task count.
     * Uses CHANNEL_SYSTEM as the notification channel.
     */
    fun buildForegroundNotification(
        context: Context,
        connectionState: String, // "connected", "connecting", "disconnected"
        deviceName: String?,
        taskCount: Int,
    ): Notification {
        // TODO: Use NotificationCompat.Builder with CHANNEL_SYSTEM.
        // TODO: Set content title to "PhoneFarm Bridge — $connectionState".
        // TODO: Set content text to "$deviceName · $taskCount task(s)".
        // TODO: Add "Stop Bridge" action button via PendingIntent.
        return NotificationCompat.Builder(context, CHANNEL_SYSTEM)
            .setContentTitle("PhoneFarm Bridge — $connectionState")
            .setContentText("$deviceName · $taskCount active task(s)")
            .setSmallIcon(android.R.drawable.ic_menu_share) // placeholder
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
    }

    /**
     * TODO: Post a task-completion notification on the CHANNEL_TASKS channel.
     */
    fun notifyTaskCompleted(context: Context, taskName: String, resultSummary: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notification = NotificationCompat.Builder(context, CHANNEL_TASKS)
            .setContentTitle("Task completed: $taskName")
            .setContentText(resultSummary)
            .setSmallIcon(android.R.drawable.ic_menu_share) // placeholder
            .setAutoCancel(true)
            .build()
        manager.notify(taskName.hashCode(), notification)
    }

    /**
     * TODO: Post a system alert notification (connection lost, activation expired, etc.).
     */
    fun notifySystemAlert(context: Context, title: String, message: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notification = NotificationCompat.Builder(context, CHANNEL_SYSTEM)
            .setContentTitle(title)
            .setContentText(message)
            .setSmallIcon(android.R.drawable.ic_dialog_alert) // placeholder
            .setAutoCancel(true)
            .build()
        manager.notify(title.hashCode(), notification)
    }
}
