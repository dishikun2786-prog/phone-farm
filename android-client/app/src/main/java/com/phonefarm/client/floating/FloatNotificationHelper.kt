package com.phonefarm.client.floating

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.phonefarm.client.MainActivity

/**
 * Helper object for building float window foreground notifications.
 *
 * Android requires a persistent notification for foreground services.
 * The notification content adapts to the current [FloatState]:
 *   - COLLAPSED  : "PhoneFarm -- Tap to expand"
 *   - EXPANDED   : "PhoneFarm -- Active chat"
 *   - EXECUTING  : "Executing task (Step N/M)"
 *   - SAVE_SCRIPT: "Save compiled script"
 *
 * Notifications are built using NotificationCompat for compatibility
 * across Android API levels 24-35.
 */
object FloatNotificationHelper {

    /**
     * Create a foreground notification for the given float window state.
     *
     * @param context Application context.
     * @param state   Current visual state of the float window.
     * @return A [Notification] ready for startForeground.
     */
    fun createFloatNotification(context: Context, state: FloatState): Notification {
        val openIntent = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val (title, text) = when (state) {
            FloatState.COLLAPSED -> "PhoneFarm" to "Tap to expand"
            FloatState.EXPANDED -> "PhoneFarm" to "Active chat"
            FloatState.EXECUTING -> "PhoneFarm" to "Task executing..."
            FloatState.SAVE_SCRIPT -> "PhoneFarm" to "Save compiled script"
        }

        return NotificationCompat.Builder(context, FloatWindowService.CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setShowWhen(false)
            .build()
    }

    /**
     * Create a progress notification showing VLM execution progress.
     *
     * @param context    Application context.
     * @param step       Current step number (1-indexed).
     * @param totalSteps Total expected steps (0 means indeterminate).
     * @param progress   Progress fraction [0.0, 1.0].
     * @return A [Notification] with progress bar.
     */
    fun createProgressNotification(
        context: Context,
        step: Int,
        totalSteps: Int,
        progress: Float,
    ): Notification {
        val openIntent = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val pauseIntent = PendingIntent.getBroadcast(
            context, 10,
            Intent("com.phonefarm.client.PAUSE_EXECUTION"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = PendingIntent.getBroadcast(
            context, 11,
            Intent("com.phonefarm.client.STOP_EXECUTION"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, FloatWindowService.CHANNEL_PROGRESS_ID)
            .setContentTitle("PhoneFarm -- Executing")
            .setContentText("Step $step / $totalSteps")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)

        // Set progress bar
        if (totalSteps > 0) {
            builder.setProgress(totalSteps, step, false)
        } else {
            builder.setProgress(0, 0, true) // indeterminate
        }

        // Add action buttons
        builder.addAction(0, "Pause", pauseIntent)
        builder.addAction(0, "Stop", stopIntent)

        return builder.build()
    }

    /**
     * Update the foreground notification to reflect a new state.
     * Convenience method that rebuilds and posts the notification.
     */
    fun updateNotification(context: Context, state: FloatState) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        val notification = createFloatNotification(context, state)
        manager.notify(FloatWindowService.NOTIFICATION_ID, notification)
    }
}
