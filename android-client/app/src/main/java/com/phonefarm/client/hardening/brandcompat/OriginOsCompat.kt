package com.phonefarm.client.hardening.brandcompat

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * VIVO OriginOS / FuntouchOS special adaptation layer.
 *
 * VIVO devices run OriginOS (Chinese market) or FuntouchOS (international).
 * Both variants implement aggressive process management especially for apps
 * not distributed through the V-Appstore.
 *
 * Required permissions on VIVO:
 *  1. Auto-start / Background startup (自启动 / 后台启动)
 *  2. Background pop-up (后台弹出界面)
 *  3. Battery optimization / High background power consumption (高耗电)
 *  4. Floating window / Display over other apps (悬浮窗)
 *  5. Notification management (通知管理)
 *  6. Accessibility service (辅助功能) — VIVO adds an extra verification step
 */
object OriginOsCompat {

    private const val TAG = "OriginOsCompat"

    /**
     * Check whether we are running on a VIVO or iQOO device.
     */
    fun isOriginOs(): Boolean {
        return BrandConfig.getBrand() == BrandConfig.Brand.VIVO
    }

    /**
     * Check if this is a iQOO sub-brand device.
     */
    fun isIqoo(): Boolean {
        return Build.BRAND.equals("iqoo", ignoreCase = true) ||
                Build.MANUFACTURER.equals("iqoo", ignoreCase = true)
    }

    /**
     * Get Intent for the VIVO auto-start / background startup management page.
     *
     * VIVO separates auto-start and background startup into two toggles
     * on the same page.
     */
    fun getAutoStartManagerIntent(): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
                )
            }
        } catch (_: Exception) {
            try {
                Intent().apply {
                    component = android.content.ComponentName(
                        "com.iqoo.secure",
                        "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"
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
     * Get Intent for the background pop-up permission.
     *
     * On VIVO, apps are not allowed to start activities from the background
     * unless this permission is explicitly granted. This is critical for
     * task initiation and UI automation.
     */
    fun getBackgroundPopupIntent(): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.SoftPermissionDetailActivity"
                )
                putExtra("packagename", "com.phonefarm.client")
            }
        } catch (_: Exception) {
            Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:com.phonefarm.client")
            )
        }
    }

    /**
     * Get Intent for the high battery consumption whitelist.
     *
     * VIVO uses a specific "High background power consumption" permission
     * rather than the standard AOSP battery optimization exception.
     */
    fun getBatteryOptimizationIntent(context: Context): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.SoftPermissionDetailActivity"
                )
                putExtra("packagename", context.packageName)
                putExtra("permission_type", "power")
            }
        } catch (_: Exception) {
            Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:${context.packageName}")
            )
        }
    }

    /**
     * Get Intent for the floating window permission.
     */
    fun getFloatingWindowIntent(): Intent {
        return Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:com.phonefarm.client")
        )
    }

    /**
     * Get Intent for the notification management page.
     *
     * VIVO defaults to blocking notifications for new apps. The user must
     * explicitly enable them for the foreground service.
     */
    fun getNotificationSettingsIntent(): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.android.settings",
                    "com.vivo.notificationmanager.NotificationManagerActivity"
                )
                putExtra("navigation_bar_package_name", "com.phonefarm.client")
            }
        } catch (_: Exception) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, "com.phonefarm.client")
            }
        }
    }

    /**
     * Get Intent for the accessibility service settings.
     *
     * VIVO adds an additional confirmation dialog on top of the standard
     * accessibility service toggle.
     */
    fun getAccessibilitySettingsIntent(): Intent {
        return Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
    }

    /**
     * Get the FuntouchOS / OriginOS version string.
     */
    fun getFuntouchOsVersion(): String {
        return getSystemProperty("ro.vivo.os.version")
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
