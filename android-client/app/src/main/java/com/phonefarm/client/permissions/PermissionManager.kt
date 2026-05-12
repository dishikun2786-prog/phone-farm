package com.phonefarm.client.permissions

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.pm.PackageManager
import android.provider.Settings.Secure
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Central permission state manager for PhoneFarm Android client.
 *
 * Required permissions for full functionality:
 *   - **SYSTEM_ALERT_WINDOW** — float window overlay
 *   - **BIND_ACCESSIBILITY_SERVICE** — UI automation (gestures, node inspection)
 *   - **REQUEST_IGNORE_BATTERY_OPTIMIZATIONS** — keep bridge service alive
 *   - **POST_NOTIFICATIONS** (API 33+) — foreground service notification
 *   - **RECORD_AUDIO** — float window voice input
 *   - **READ_EXTERNAL_STORAGE** / **MANAGE_EXTERNAL_STORAGE** — file operations
 *
 * Each permission can be:
 *   - GRANTED: ready to use
 *   - DENIED: not granted, needs user action
 *   - NOT_APPLICABLE: not required on this Android version
 */
@Singleton
class PermissionManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private val _permissionStates = MutableStateFlow<Map<String, PermissionState>>(emptyMap())
    val permissionStates: StateFlow<Map<String, PermissionState>> = _permissionStates.asStateFlow()

    /**
     * Check all PhoneFarm-required permissions.
     *
     * @return Map of permission key → granted boolean.
     */
    fun checkAll(): Map<String, Boolean> {
        val results = mutableMapOf<String, Boolean>()
        results["SYSTEM_ALERT_WINDOW"] = isOverlayEnabled()
        results["ACCESSIBILITY"] = isAccessibilityEnabled()
        results["BATTERY_OPTIMIZATION"] = isBatteryOptimizationDisabled()
        results["NOTIFICATIONS"] = areNotificationsEnabled()
        results["RECORD_AUDIO"] = isPermissionGranted(android.Manifest.permission.RECORD_AUDIO)
        // Storage: API 30+ uses scoped storage (MANAGE_EXTERNAL_STORAGE), older uses READ_EXTERNAL_STORAGE
        results["STORAGE"] = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            android.os.Environment.isExternalStorageManager()
        } else {
            isPermissionGranted(android.Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        return results
    }

    /** Check if the PhoneFarm accessibility service is enabled. */
    fun isAccessibilityEnabled(): Boolean {
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        // The enabled services string uses format: package/classname
        // e.g. "com.phonefarm.client/com.phonefarm.client.service.PhoneFarmAccessibilityService"
        return enabledServices.lowercase().contains(context.packageName.lowercase())
                && enabledServices.contains("PhoneFarmAccessibilityService", ignoreCase = true)
    }

    /** Check if overlay permission (SYSTEM_ALERT_WINDOW) is granted. */
    fun isOverlayEnabled(): Boolean {
        return Settings.canDrawOverlays(context)
    }

    /** Check if battery optimization is disabled (allowing long-running background service). */
    fun isBatteryOptimizationDisabled(): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    /** Check if notifications are enabled. */
    fun areNotificationsEnabled(): Boolean {
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    // ---- Settings intents ----

    /** Open accessibility settings. */
    fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    /** Open overlay permission settings. */
    fun openOverlaySettings() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${context.packageName}")
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        context.startActivity(intent)
    }

    /** Open battery optimization settings. */
    fun openBatterySettings() {
        val intent = Intent(
            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:${context.packageName}")
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        context.startActivity(intent)
    }

    /** Open notification settings. */
    fun openNotificationSettings() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            }
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
            }
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    /** Check if the given runtime permission is granted. */
    fun isPermissionGranted(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    }
}
