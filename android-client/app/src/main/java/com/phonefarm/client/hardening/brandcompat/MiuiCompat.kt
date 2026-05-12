package com.phonefarm.client.hardening.brandcompat

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

/**
 * Xiaomi MIUI / HyperOS special adaptation layer.
 *
 * MIUI imposes the strictest background process restrictions among Android
 * OEMs. This helper provides step-by-step guidance Intents and utility checks
 * for enabling the permissions PhoneFarm needs to run long-term.
 *
 * Required permissions on MIUI:
 *  1. Auto-start (自启动管理)
 *  2. Background pop-up / display pop-up while running in background (后台弹出界面)
 *  3. Battery saver whitelist (省电策略 → 无限制)
 *  4. Notification display (通知管理)
 *  5. Lock-screen display
 */
object MiuiCompat {

    private const val MIUI_SYSTEM_MANAGER = "com.miui.securitycenter"

    /**
     * Check whether we are running on a Xiaomi device (MIUI or HyperOS).
     */
    fun isMiui(): Boolean {
        return BrandConfig.getBrand() == BrandConfig.Brand.XIAOMI
    }

    /**
     * Check whether MIUI's "MIUI Optimizations" toggle is enabled.
     * When disabled, some permissions pages are inaccessible — the user
     * needs to re-enable it via Developer Options.
     */
    fun isMiuiOptimizationEnabled(context: Context): Boolean {
        return try {
            val value = Settings.Secure.getInt(
                context.contentResolver,
                "miui_optimization"
            )
            value == 1
        } catch (_: Exception) {
            // Default to true if we can't read the setting.
            true
        }
    }

    /**
     * Get Intent for the MIUI auto-start management page.
     *
     * User must find and enable PhoneFarm in the auto-start list
     * so the app can start after reboot and be re-launched by the system.
     */
    fun getAutoStartGuideIntent(): Intent {
        return Intent().apply {
            component = android.content.ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"
            )
        }
    }

    /**
     * Get Intent for enabling "background pop-up" permission.
     *
     * This is arguably the most important MIUI permission for PhoneFarm:
     * without it the accessibility service cannot display overlays or
     * start activities from the background.
     */
    fun getBackgroundPopupIntent(): Intent {
        return Intent().apply {
            component = android.content.ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.permissions.PermissionsEditorActivity"
            )
            putExtra("extra_pkgname", "com.phonefarm.client")
        }
    }

    /**
     * Get Intent for the MIUI battery saver settings page.
     *
     * User should set PhoneFarm to "No restrictions" (无限制) so the system
     * does not kill the process during long-running script execution.
     */
    fun getBatteryOptimizationIntent(): Intent {
        return Intent().apply {
            component = android.content.ComponentName(
                "com.miui.securitycenter",
                "com.miui.powercenter.PowerSettings"
            )
        }
    }

    /**
     * Get Intent for the MIUI notification management page.
     *
     * User should enable "Floating notifications", "Lock screen notifications",
     * and "Badge" for the persistent foreground service notification.
     */
    fun getNotificationSettingsIntent(context: Context): Intent {
        return Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        }
    }

    /**
     * Get Intent for the MIUI "lock screen display" permission.
     *
     * Allows the foreground service notification to show on the lock screen,
     * which helps Android not kill the service.
     */
    fun getLockScreenDisplayIntent(): Intent {
        return Intent().apply {
            component = android.content.ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.permissions.SystemAppPermissionActivity"
            )
        }
    }

    /**
     * Convenience: check if a Xiaomi-specific system app is installed
     * that indicates MIUI version capabilities.
     */
    fun getMiuiVersionName(): String {
        return getSystemProperty("ro.miui.ui.version.name")
    }

    /**
     * Check whether the device runs HyperOS (MIUI 15+ successor).
     */
    fun isHyperOs(): Boolean {
        val version = getMiuiVersionName()
        return version.isNotEmpty() && (
            version.startsWith("HyperOS") ||
            version.startsWith("OS") && !version.startsWith("V")
        )
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
