package com.phonefarm.client.hardening.brandcompat

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Samsung OneUI special adaptation layer.
 *
 * Samsung OneUI (Android 13/14+) introduces several background restriction
 * mechanisms on top of stock Android:
 *  - "Put unused apps to sleep" (auto-disables permissions)
 *  - "Restrict background activity" per-app toggle
 *  - Knox security platform adds integrity verification layers
 *  - Game Booster may interfere with automation overlays
 *
 * This helper provides Intents for Samsung-specific settings pages.
 *
 * Required permissions on OneUI:
 *  1. Battery → "Unrestricted" (電池 → 不受限制)
 *  2. App → "Allow background activity"
 *  3. Notifications → categories all enabled
 *  4. Accessibility → installed service enabled
 *  5. (Optional) Knox SDK exemption for device admin features
 */
object OneUiCompat {

    private const val TAG = "OneUiCompat"

    /**
     * Check whether we are running on a Samsung device.
     */
    fun isOneUi(): Boolean {
        return BrandConfig.getBrand() == BrandConfig.Brand.SAMSUNG
    }

    /**
     * Get the OneUI major version number.
     * OneUI version can be derived from Build info on Samsung devices.
     */
    fun getOneUiVersion(): String {
        return getSystemProperty("ro.build.version.oneui")
    }

    /**
     * Check if Samsung Knox is available on this device.
     * Knox is Samsung's defense-grade security platform; some Knox features
     * may interfere with automation (e.g., container isolation).
     */
    fun isKnoxAvailable(): Boolean {
        return try {
            Class.forName("com.samsung.android.knox.SemPersonaManager")
            true
        } catch (_: ClassNotFoundException) {
            // Check for Knox package instead.
            val knoxPkg = "com.samsung.android.knox.containers"
            false // Can't check without context at this level.
        }
    }

    /**
     * Get Intent for the Samsung battery settings page.
     *
     * User should set PhoneFarm to "Unrestricted" so the system does not
     * put the app to sleep or revoke its permissions.
     */
    fun getBatteryOptimizationIntent(context: Context): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.samsung.android.lool",
                    "com.samsung.android.sm.ui.battery.BatteryActivity"
                )
            }
        } catch (_: Exception) {
            try {
                Intent().apply {
                    component = android.content.ComponentName(
                        "com.samsung.android.sm_cn",
                        "com.samsung.android.sm.ui.battery.BatteryActivity"
                    )
                }
            } catch (_: Exception) {
                Intent(
                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:${context.packageName}")
                )
            }
        }
    }

    /**
     * Get Intent for the Samsung "App power management" page.
     *
     * In OneUI 5+, there is an additional "Restrict background activity"
     * toggle per-app that is separate from battery optimization.
     */
    fun getAppPowerManagementIntent(): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.samsung.android.lool",
                    "com.samsung.android.sm.ui.battery.AppSleepListActivity"
                )
            }
        } catch (_: Exception) {
            try {
                Intent().apply {
                    component = android.content.ComponentName(
                        "com.samsung.android.sm_cn",
                        "com.samsung.android.sm.ui.battery.AppSleepListActivity"
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
     * Get Intent for the auto-start / device care page.
     *
     * Samsung does not have a direct "auto-start" toggle like Chinese OEMs,
     * but the Device Care → Memory page allows users to add apps to the
     * "never sleeping" list.
     */
    fun getDeviceCareIntent(): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.samsung.android.lool",
                    "com.samsung.android.sm.ui.memory.MemoryActivity"
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
     * Get Intent for the Samsung notification category settings.
     *
     * Samsung OneUI provides per-category notification settings, and new apps
     * may have certain categories disabled by default.
     */
    fun getNotificationSettingsIntent(context: Context): Intent {
        return Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        }
    }

    /**
     * Get Intent for the accessibility settings page.
     *
     * On Samsung devices, accessibility services are under
     * Settings → Accessibility → Installed apps.
     */
    fun getAccessibilitySettingsIntent(): Intent {
        return Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
    }

    /**
     * Get Intent for the Samsung "Special access" settings page.
     *
     * This covers overlay permission, usage stats, notification access,
     * and other special permissions on Samsung devices.
     */
    fun getSpecialAccessIntent(): Intent {
        return try {
            Intent().apply {
                component = android.content.ComponentName(
                    "com.android.settings",
                    "com.android.settings.Settings\$SpecialAccessSettingsActivity"
                )
            }
        } catch (_: Exception) {
            Intent(Settings.ACTION_SETTINGS)
        }
    }

    /**
     * Samsung Knox protection guidance.
     *
     * If the device is managed by a Knox MDM profile, certain automation
     * operations may be blocked. This method returns a human-readable
     * explanation for display in a permission guide UI.
     */
    fun getKnoxProtectionGuidance(): String {
        return """
            This Samsung device may have Knox security features enabled.

            If PhoneFarm is unable to run automation scripts:
            1. Check if your device is managed by a work profile or MDM.
            2. Go to Settings → Biometrics and security → Knox to review active protections.
            3. Some Knox features (e.g., Real-Time Kernel Protection) may block accessibility automation.
            4. For enterprise-managed devices, contact your IT administrator to whitelist PhoneFarm as a trusted automation tool.
        """.trimIndent()
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
