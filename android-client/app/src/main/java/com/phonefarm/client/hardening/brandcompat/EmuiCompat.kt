package com.phonefarm.client.hardening.brandcompat

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

/**
 * Huawei EMUI / HarmonyOS special adaptation layer.
 *
 * Huawei devices (especially those running HarmonyOS Next) add extra layers
 * of app launch management and power saving beyond stock Android. This helper
 * provides the correct Intents to guide users through granting the necessary
 * permissions.
 *
 * Required permissions on EMUI / HarmonyOS:
 *  1. App launch (应用启动管理) — set to "Manage manually" with all three toggles on
 *  2. Battery optimization (省电管理)
 *  3. Protected apps (受保护应用) — screen lock / keep-alive
 *  4. Notification management
 *  5. Accessibility service trust (HarmonyOS prompts extra confirmation)
 */
object EmuiCompat {

    private const val TAG = "EmuiCompat"

    /**
     * Check whether we are running on a Huawei or Honor device.
     */
    fun isHuawei(): Boolean {
        return BrandConfig.getBrand() == BrandConfig.Brand.HUAWEI
    }

    /**
     * Check whether the device runs HarmonyOS (vs. older EMUI based on AOSP).
     */
    fun isHarmonyOs(): Boolean {
        val osName = getSystemProperty("ro.os.name")
        return osName.contains("HarmonyOS", ignoreCase = true) ||
                Build.DISPLAY.contains("HarmonyOS", ignoreCase = true)
    }

    /**
     * Get Intent for the Huawei "App Launch" (应用启动管理) management page.
     *
     * This is the most critical permission on Huawei devices. The user must
     * find PhoneFarm and set it to "Manage manually" (手动管理), then enable
     * all three sub-toggles:
     *  - Auto-launch (自启动)
     *  - Associated launch (关联启动)
     *  - Run in background (后台活动)
     */
    fun getAppLaunchManagerIntent(): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
                )
            }
        } catch (_: Exception) {
            // Fallback: open the general app details page.
            Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.parse("package:com.phonefarm.client")
            )
        }
    }

    /**
     * Get Intent for the Huawei "Protected Apps" (受保护应用) page.
     *
     * Protected apps are allowed to keep running after the screen is locked,
     * which is essential for long-running automation tasks.
     */
    fun getProtectedAppsIntent(): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.optimize.process.ProtectActivity"
                )
            }
        } catch (_: Exception) {
            Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.parse("package:com.phonefarm.client")
            )
        }
    }

    /**
     * Get Intent for the Huawei battery optimization settings.
     */
    fun getBatteryOptimizationIntent(context: Context): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.power.ui.HwPowerManagerActivity"
                )
            }
        } catch (_: Exception) {
            Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                android.net.Uri.parse("package:${context.packageName}")
            )
        }
    }

    /**
     * Get Intent for the Huawei notification management page.
     *
     * EMUI / HarmonyOS sometimes suppresses notifications from newly installed
     * apps by default. The user needs to enable notifications for the foreground
     * service to remain stable.
     */
    fun getNotificationSettingsIntent(context: Context): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.android.settings",
                    "com.android.settings.Settings\$NotificationAndStatusbarSettingsActivity"
                )
            }
        } catch (_: Exception) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            }
        }
    }

    /**
     * Get the HarmonyOS / EMUI version string for logging.
     */
    fun getEmuiVersion(): String {
        return getSystemProperty("ro.build.version.emui")
    }

    /**
     * Check if this is a Honor-branded device (subsidiary of Huawei).
     * Honor devices use the same system apps but with different package names
     * post-split.
     */
    fun isHonor(): Boolean {
        return Build.BRAND.equals("honor", ignoreCase = true) ||
                Build.MANUFACTURER.equals("honor", ignoreCase = true)
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
