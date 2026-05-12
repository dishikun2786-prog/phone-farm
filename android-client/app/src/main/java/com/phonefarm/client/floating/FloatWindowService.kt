package com.phonefarm.client.floating

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.WindowManager
import androidx.compose.ui.platform.ComposeView
import dagger.hilt.android.AndroidEntryPoint
import com.phonefarm.client.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Floating window overlay service using WindowManager.
 *
 * Provides a persistent floating bubble/collapsed view that expands into
 * a full chat interface for VLM task execution and script save.
 *
 * 4 visual states:
 *   - **Collapsed**  : 56dp circle bubble, draggable, snaps to edges.
 *   - **Expanded**   : 280x400dp chat panel with message history + input.
 *   - **Executing**  : expanded panel with progress bar and step-by-step trace.
 *   - **SaveScript** : 280x240dp dialog for naming and saving the compiled script.
 *
 * Lifecycle:
 *   - Started via startService (foreground notification).
 *   - Requires SYSTEM_ALERT_WINDOW permission.
 *   - Runs independently from the main Activity; survives Activity destruction.
 */
@AndroidEntryPoint
class FloatWindowService : Service() {

    companion object {
        const val CHANNEL_ID = "phonefarm_float"
        const val CHANNEL_NAME = "PhoneFarm Float Window"
        const val NOTIFICATION_ID = 7001
        const val CHANNEL_PROGRESS_ID = "phonefarm_float_progress"
    }

    @Inject lateinit var floatChatViewModel: FloatChatViewModel

    private lateinit var windowManager: WindowManager
    private var floatRootView: ComposeView? = null
    private var floatLayoutParams: WindowManager.LayoutParams? = null
    private var touchHandler: FloatTouchHandler? = null
    private var currentState: FloatState = FloatState.COLLAPSED

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // ---- Service lifecycle ----

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!canDrawOverlays()) {
            notifyPermissionRequired()
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(NOTIFICATION_ID, buildCollapsedNotification())

        if (floatRootView == null) {
            createFloatWindow()
            observeStateChanges()
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        removeFloatWindow()
        serviceScope.cancel()
        floatChatViewModel.onCleared()
        super.onDestroy()
    }

    // ---- Float window management ----

    private fun createFloatWindow() {
        val metrics = resources.displayMetrics

        val composeView = ComposeView(this).apply {
            setContent {
                FloatChatView(
                    viewModel = floatChatViewModel,
                    onDismiss = { setState(FloatState.COLLAPSED) },
                )
            }
        }

        val params = WindowManager.LayoutParams(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            val dims = getDimensionsForState(FloatState.COLLAPSED, metrics)
            width = dims.first
            height = dims.second
            gravity = Gravity.TOP or Gravity.START
            x = metrics.widthPixels - dims.first - dpToPx(16, metrics)
            y = metrics.heightPixels / 3
        }

        touchHandler = FloatTouchHandler(
            windowManager = windowManager,
            layoutParams = params,
            onTap = {
                setState(FloatState.EXPANDED)
                updateParamsFlags(params, focusable = true)
            },
            onLongPress = {
                showContextMenu()
            },
            getCurrentState = { currentState },
            onStateChange = { state -> setState(state) },
        )

        composeView.setOnTouchListener(touchHandler)

        windowManager.addView(composeView, params)
        floatRootView = composeView
        floatLayoutParams = params
    }

    private fun removeFloatWindow() {
        floatRootView?.let { view ->
            try {
                windowManager.removeView(view)
            } catch (e: IllegalArgumentException) {
                // View not attached 鈥?ignore
            }
        }
        floatRootView = null
        floatLayoutParams = null
        touchHandler = null
    }

    // ---- State management ----

    /**
     * Transition the float window to the given visual state.
     */
    fun setState(state: FloatState) {
        if (currentState == state) return
        currentState = state

        val view = floatRootView ?: return
        val params = floatLayoutParams ?: return
        val metrics = resources.displayMetrics
        val (width, height) = getDimensionsForState(state, metrics)

        // Update window dimensions
        params.width = width
        params.height = height

        // Adjust flags: focusable when expanded/executing, not focusable when collapsed
        updateParamsFlags(params, focusable = state != FloatState.COLLAPSED)

        // Re-center horizontally when transitioning from collapsed to expanded
        if (state != FloatState.COLLAPSED) {
            params.x = (metrics.widthPixels - width) / 2
        } else {
            // Snap to nearest edge when collapsing
            snapToNearestEdge(params.x, width, metrics.widthPixels)
        }

        // Enable touch handler only in collapsed state
        if (state == FloatState.COLLAPSED) {
            view.setOnTouchListener(touchHandler)
        } else {
            view.setOnTouchListener(null)
        }

        try {
            windowManager.updateViewLayout(view, params)
        } catch (e: IllegalArgumentException) {
            // View not attached 鈥?ignore
        }

        // Update notification content
        updateNotification(state)

        // Sync to ViewModel for UI rendering
        floatChatViewModel.setFloatState(state)
    }

    fun getCurrentState(): FloatState = currentState

    /**
     * Show the float window (if hidden). Re-adds view to WindowManager.
     */
    fun show() {
        if (floatRootView != null) return
        createFloatWindow()
        observeStateChanges()
    }

    /**
     * Hide the float window. Removes view from WindowManager.
     */
    fun hide() {
        removeFloatWindow()
    }

    /**
     * Toggle between collapsed and expanded states.
     */
    fun toggle() {
        setState(
            if (currentState == FloatState.COLLAPSED) FloatState.EXPANDED
            else FloatState.COLLAPSED
        )
    }

    // ---- Notification ----

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Persistent notification for PhoneFarm floating window"
            setShowBadge(false)
        }
        val progressChannel = NotificationChannel(
            CHANNEL_PROGRESS_ID,
            "PhoneFarm Task Progress",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "VLM task execution progress"
        }
        manager.createNotificationChannels(listOf(channel, progressChannel))
    }

    private fun buildCollapsedNotification(): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("PhoneFarm")
                .setContentText(getStateDescription(FloatState.COLLAPSED))
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setContentIntent(openIntent)
                .setOngoing(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("PhoneFarm")
                .setContentText(getStateDescription(FloatState.COLLAPSED))
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setContentIntent(openIntent)
                .setOngoing(true)
                .build()
        }
    }

    private fun updateNotification(state: FloatState) {
        val manager = getSystemService(NotificationManager::class.java)
        val notification = buildNotificationForState(state)
        manager.notify(NOTIFICATION_ID, notification)
    }

    private fun buildNotificationForState(state: FloatState): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Add expand/collapse action
        val toggleText = if (state == FloatState.COLLAPSED) "Expand" else "Collapse"
        val toggleIntent = PendingIntent.getBroadcast(
            this, 1,
            Intent("com.phonefarm.client.TOGGLE_FLOAT"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle("PhoneFarm")
            .setContentText(getStateDescription(state))
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(openIntent)
            .addAction(0, toggleText, toggleIntent)
            .setOngoing(true)
            .build()
    }

    private fun getStateDescription(state: FloatState): String = when (state) {
        FloatState.COLLAPSED -> "Tap to expand"
        FloatState.EXPANDED -> "Chat active"
        FloatState.EXECUTING -> "Task executing..."
        FloatState.SAVE_SCRIPT -> "Save script"
    }

    // ---- State observation ----

    private fun observeStateChanges() {
        serviceScope.launch {
            floatChatViewModel.floatState.collectLatest { floatState ->
                if (floatState != null && currentState != floatState) {
                    setState(floatState)
                }
            }
        }
    }

    // ---- Permission ----

    private fun canDrawOverlays(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(this)
        } else {
            true
        }
    }

    private fun notifyPermissionRequired() {
        // Post a notification directing user to grant overlay permission
        val manager = getSystemService(NotificationManager::class.java)
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName")
        )
        val pendingIntent = PendingIntent.getActivity(
            this, 2, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }.apply {
            setContentTitle("Permission Required")
            setContentText("Enable overlay permission for floating window")
            setSmallIcon(android.R.drawable.ic_dialog_alert)
            setContentIntent(pendingIntent)
            setAutoCancel(true)
        }.build()
        manager.notify(NOTIFICATION_ID + 1, notification)
    }

    // ---- Helper functions ----

    private fun getDimensionsForState(state: FloatState, metrics: DisplayMetrics): Pair<Int, Int> {
        return when (state) {
            FloatState.COLLAPSED -> {
                val size = dpToPx(56, metrics)
                Pair(size, size)
            }
            FloatState.EXPANDED, FloatState.EXECUTING -> {
                val width = dpToPx(280, metrics)
                val height = dpToPx(400, metrics)
                Pair(width, height)
            }
            FloatState.SAVE_SCRIPT -> {
                val width = dpToPx(280, metrics)
                val height = dpToPx(240, metrics)
                Pair(width, height)
            }
        }
    }

    private fun updateParamsFlags(
        params: WindowManager.LayoutParams,
        focusable: Boolean,
    ) {
        if (focusable) {
            params.flags = params.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
            params.flags = params.flags or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH
        } else {
            params.flags = params.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            params.flags = params.flags and WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH.inv()
        }
    }

    private fun snapToNearestEdge(currentX: Int, bubbleWidth: Int, screenWidth: Int) {
        val targetX = if (currentX < screenWidth / 2) {
            0
        } else {
            screenWidth - bubbleWidth
        }
        floatLayoutParams?.x = targetX
        floatRootView?.let { view ->
            floatLayoutParams?.let { params ->
                try {
                    windowManager.updateViewLayout(view, params)
                } catch (e: IllegalArgumentException) { }
            }
        }
    }

    private fun showContextMenu() {
        // Expand to show the full float window, which provides the action options
        setState(FloatState.EXPANDED)
    }

    private fun dpToPx(dp: Int, metrics: DisplayMetrics): Int =
        (dp * metrics.density + 0.5f).toInt()
}

/**
 * Visual states of the floating window.
 */
enum class FloatState {
    COLLAPSED,
    EXPANDED,
    EXECUTING,
    SAVE_SCRIPT,
}
