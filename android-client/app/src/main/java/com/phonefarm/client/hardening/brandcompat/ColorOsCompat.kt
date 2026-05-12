package com.phonefarm.client.hardening.brandcompat

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * OPPO ColorOS special adaptation layer.
 *
 * ColorOS (and RealmeUI on Realme devices) employs aggressive app freezing
 * ("Smart Power Save") that kills background processes after only a few minutes
 * of inactivity. This helper navigates the user through the OPPO-specific
 * permission pages needed for long-running automation.
 *
 * Required permissions on ColorOS:
 *  1. Auto-start / Startup manager (自启动管理)
 *  2. Floating window (悬浮窗)
 *  3. Background running (后台运行)
 *  4. Battery optimization exclusion (耗电管理)
 *  5. Notification management
 */
object ColorOsCompat {

    const val TAG = "ColorOsCompat"

    /**
     * Check whether we are running on an OPPO or Realme device.
     */
    fun isColorOs(): Boolean {
        return BrandConfig.getBrand() == BrandConfig.Brand.OPPO
    }

    /**
     * Check if the device is a Realme (uses RealmeUI which is a ColorOS fork).
     */
    fun isRealme(): Boolean {
        return Build.BRAND.equals("realme", ignoreCase = true) ||
                Build.MANUFACTURER.equals("realme", ignoreCase = true)
    }

    /**
     * Get Intent for the ColorOS auto-start manager.
     *
     * User must enable PhoneFarm in the startup list so the app can be
     * restarted after reboot and re-launched when terminated by the system.
     */
    fun getAutoStartManagerIntent(): Intent {
        return try {
            if (isRealme()) {
                Intent().apply {
                    component = android.content.ComponentName(
                        "com.coloros.safecenter",
                        "com.coloros.safecenter.permission.startup.StartupAppListActivity"
                    )
                }
            } else {
                Intent().apply {
                    component = android.content.ComponentName(
                        "com.coloros.safecenter",
                        "com.coloros.safecenter.permission.startup.StartupAppListActivity"
                    )
                }
            }
        } catch (_: Exception) {
            try {
                Intent().apply {
                    component = android.content.ComponentName(
                        "com.oppo.safe",
                        "com.oppo.safe.permission.startup.StartupAppListActivity"
                    )
                }
            } catch (_: Exception) {
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:com.phonefarm.client")
                )
            }
        }
    }

    /**
     * Get Intent for enabling floating window permission.
     *
     * ColorOS requires explicit user consent for overlay windows (TYPE_APPLICATION_OVERLAY).
     * This is needed for the floating UI controls and accessibility overlays.
     */
    fun getFloatingWindowIntent(): Intent {
        return Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:com.phonefarm.client")
        )
    }

    /**
     * Get Intent for the background running permission.
     *
     * On ColorOS 13+ (Android 13+), there is a separate "Background running"
     * toggle that must be enabled. This is different from battery optimization.
     */
    fun getBackgroundRunningIntent(): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.permission.PermissionAppsActivity"
                )
            }
        } catch (_: Exception) {
            Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:com.phonefarm.client")
            )
        }
    }

    /**
     * Get Intent for the battery optimization exception settings.
     *
     * User should set PhoneFarm to "Allow background running" or
     * "No power saving restrictions".
     */
    fun getBatteryOptimizationIntent(context: Context): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.permission.singlepage.PermissionSinglePageActivity"
                )
                putExtra("packageName", context.packageName)
            }
        } catch (_: Exception) {
            Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:${context.packageName}")
            )
        }
    }

    /**
     * Get Intent for notification management.
     *
     * OPPO enables "Smart Notification Filtering" by default which silences
     * new apps. The user must explicitly allow notifications.
     */
    fun getNotificationSettingsIntent(): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.coloros.notificationmanager",
                    "com.coloros.notificationmanager.NotificationSettingsActivity"
                )
                putExtra("packageName", "com.phonefarm.client")
            }
        } catch (_: Exception) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, "com.phonefarm.client")
            }
        }
    }

    /**
     * Get the ColorOS version string for diagnostics.
     */
    fun getColorOsVersion(): String {
        return getSystemProperty("ro.build.version.opporom")
    }

    private fun getSystemProperty(key: String): String {
        return try {
            val clazz = Class.forName("android.os.SystemProperties")
            val method = clazz.getMethod("get", String::class.java)
            method.invoke(null, key) as? String ?: ""
        } catch (_: Exception) {
            ""
        }
    }
}
