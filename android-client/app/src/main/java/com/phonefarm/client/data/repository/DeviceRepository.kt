package com.phonefarm.client.data.repository

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.WindowManager
import com.phonefarm.client.network.ApiService
import com.phonefarm.client.network.DeviceHeartbeatRequest
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for device identity, hardware info, and heartbeat data.
 *
 * Collects static device properties (model, serial, screen size, Android version)
 * and dynamic state (battery, current app, memory, CPU usage) for reporting
 * to the control server via heartbeat messages.
 */
@Singleton
class DeviceRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
) {

    private val _deviceInfo = MutableStateFlow<DeviceInfo>(DeviceInfo())
    val deviceInfo: Flow<DeviceInfo> = _deviceInfo.asStateFlow()

    /**
     * TODO: Collect static and dynamic device information.
     *
     * Static (collected once):
     * - deviceId (Android ID or serial)
     * - model (Build.MODEL)
     * - manufacturer (Build.MANUFACTURER)
     * - brand (Build.BRAND)
     * - androidVersion (Build.VERSION.SDK_INT)
     * - screenWidth / screenHeight (from WindowManager)
     * - screenDensity (DPI)
     *
     * Dynamic (refreshed on each call):
     * - batteryLevel, batteryCharging (from BatteryManager)
     * - screenOn (from PowerManager)
     * - currentPackage (from UsageStatsManager or AccessibilityService)
     */
    suspend fun collectDeviceInfo(): DeviceInfo {
        val deviceId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID,
        ) ?: "unknown"

        val metrics = DisplayMetrics()
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)

        val info = DeviceInfo(
            deviceId = deviceId,
            model = Build.MODEL,
            manufacturer = Build.MANUFACTURER,
            brand = Build.BRAND,
            androidVersion = Build.VERSION.SDK_INT,
            screenWidth = metrics.widthPixels,
            screenHeight = metrics.heightPixels,
            screenDensity = metrics.densityDpi,
            // Dynamic fields populated below.
            batteryLevel = collectBatteryLevel(),
            batteryCharging = collectBatteryCharging(),
            screenOn = collectScreenOn(),
            currentPackage = collectCurrentPackage(),
        )

        _deviceInfo.value = info
        return info
    }

    /**
     * Send a heartbeat to the control server with current device state.
     * Called periodically (default: every 30 seconds).
     * Failures are silently logged; they are not critical for device operation.
     */
    suspend fun sendHeartbeat() {
        try {
            val info = collectDeviceInfo()
            val request = DeviceHeartbeatRequest(
                deviceId = info.deviceId,
                timestamp = System.currentTimeMillis(),
                batteryLevel = info.batteryLevel,
                batteryCharging = info.batteryCharging,
                screenOn = info.screenOn,
                currentPackage = info.currentPackage,
                activeTaskCount = info.activeTaskCount,
                memoryMb = collectMemoryMb(),
                cpuUsage = collectCpuUsage(),
            )
            apiService.reportDeviceHeartbeat(request)
        } catch (_: Exception) {
            // Heartbeat failures are non-critical; the WebSocket connection
            // already serves as an implicit liveness signal.
        }
    }

    /**
     * TODO: Return the device-tailscale IP (from Tailscale app or VpnService).
     */
    suspend fun getTailscaleIp(): String? {
        // TODO: Query Tailscale local API (http://100.100.100.100:8080) or read /proc/net/if_inet6.
        return null
    }

    // ---- dynamic data collectors ----

    private fun collectBatteryLevel(): Int {
        val intent = context.registerReceiver(
            null,
            android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED),
        )
        val level = intent?.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, 100) ?: 100
        return (level * 100 / scale)
    }

    private fun collectBatteryCharging(): Boolean {
        val intent = context.registerReceiver(
            null,
            android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED),
        )
        val status = intent?.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1) ?: -1
        return status == android.os.BatteryManager.BATTERY_STATUS_CHARGING ||
            status == android.os.BatteryManager.BATTERY_STATUS_FULL
    }

    private fun collectScreenOn(): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT_WATCH) {
            pm.isInteractive
        } else {
            @Suppress("DEPRECATION")
            pm.isScreenOn
        }
    }

    private fun collectCurrentPackage(): String? {
        // TODO: Use UsageStatsManager or AccessibilityService to get foreground package.
        return null
    }

    private fun collectMemoryMb(): Int {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
        val memInfo = android.app.ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)
        val totalMb = memInfo.totalMem / (1024 * 1024)
        val availMb = memInfo.availMem / (1024 * 1024)
        return ((totalMb - availMb) % Int.MAX_VALUE).toInt()
    }

    private fun collectCpuUsage(): Int {
        // TODO: Read /proc/stat to calculate CPU usage percentage.
        return 0
    }
}

/**
 * Complete snapshot of device hardware and runtime state.
 */
data class DeviceInfo(
    val deviceId: String = "",
    val model: String = "",
    val manufacturer: String = "",
    val brand: String = "",
    val androidVersion: Int = 0,
    val screenWidth: Int = 0,
    val screenHeight: Int = 0,
    val screenDensity: Int = 0,
    val batteryLevel: Int = 0,
    val batteryCharging: Boolean = false,
    val screenOn: Boolean = false,
    val currentPackage: String? = null,
    val activeTaskCount: Int = 0,
)
