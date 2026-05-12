package com.phonefarm.client.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.phonefarm.client.MainActivity
import com.phonefarm.client.R
import com.phonefarm.client.network.WebSocketClient
import com.phonefarm.client.network.ConnectionState
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class BridgeForegroundService : Service() {

    @Inject lateinit var webSocketClient: WebSocketClient

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var isConnected = false
    private var deviceName = ""
    private var activeTaskCount = 0

    companion object {
        const val TAG = "BridgeFgService"
        const val NOTIFICATION_ID = 1001
        const val CHANNEL_ID = NotificationHelper.CHANNEL_SYSTEM
        const val ACTION_STOP = "com.phonefarm.client.action.STOP_BRIDGE"
        const val EXTRA_DEVICE_NAME = "device_name"
    }

    override fun onCreate() {
        super.onCreate()
        NotificationHelper.createNotificationChannels(this)

        scope.launch {
            webSocketClient.connectionState.collectLatest { state ->
                isConnected = state == ConnectionState.CONNECTED ||
                    state == ConnectionState.AUTHENTICATED
                updateNotification()
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        deviceName = intent?.getStringExtra(EXTRA_DEVICE_NAME) ?: "PhoneFarm"

        val notification = buildNotification()
        startForeground(NOTIFICATION_ID, notification)

        scope.launch {
            try {
                // TODO: Read server URL and token from SecurePreferences
                // webSocketClient.connect(serverUrl, token)
                Log.d(TAG, "Service started — WebSocket connect deferred to CloudConfigSyncer")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to connect WebSocket", e)
            }
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        scope.cancel()
        webSocketClient.disconnect()
        super.onDestroy()
    }

    fun updateTaskCount(count: Int) {
        activeTaskCount = count
        updateNotification()
    }

    private fun updateNotification() {
        val notification = buildNotification()
        val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
        nm.notify(NOTIFICATION_ID, notification)
    }

    private fun buildNotification(): Notification {
        val stateText = when {
            !isConnected -> "未连接"
            activeTaskCount > 0 -> "运行中 · $activeTaskCount 个任务"
            else -> "已连接 · 就绪"
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(deviceName)
            .setContentText(stateText)
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(createContentIntent())
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "断开",
                createStopIntent()
            )
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun createContentIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        return PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        )
    }

    private fun createStopIntent(): PendingIntent {
        val intent = Intent(this, BridgeForegroundService::class.java).apply {
            action = ACTION_STOP
        }
        return PendingIntent.getService(
            this, 1, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        )
    }
}
