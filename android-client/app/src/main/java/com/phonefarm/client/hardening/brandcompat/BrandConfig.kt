package com.phonefarm.client.hardening.brandcompat

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.net.toUri

/**
 * Brand-specific configuration and Intent routing.
 *
 * Identifies the device manufacturer (Xiaomi, Huawei, OPPO, VIVO, Samsung, or generic)
 * and returns the correct Intents for auto-start, battery optimization, and notification
 * settings — each brand buries these in different system activity paths.
 */
object BrandConfig {

    enum class Brand {
        XIAOMI,
        HUAWEI,
        OPPO,
        VIVO,
        SAMSUNG,
        GENERIC,
    }

    // ---- brand identification ----

    /**
     * Detect the device brand from [Build.MANUFACTURER] and [Build.BRAND].
     * Case-insensitive matching against known manufacturer strings.
     */
    fun getBrand(): Brand {
        val manufacturer = Build.MANUFACTURER.lowercase().trim()
        val brand = Build.BRAND.lowercase().trim()

        return when {
            manufacturer.contains("xiaomi") || brand.contains("xiaomi") ||
            manufacturer.contains("redmi") || brand.contains("redmi") ||
            manufacturer.contains("poco") || brand.contains("poco") -> Brand.XIAOMI

            manufacturer.contains("huawei") || brand.contains("huawei") ||
            manufacturer.contains("honor") || brand.contains("honor") ||
            manufacturer.contains("harmony") -> Brand.HUAWEI

            manufacturer.contains("oppo") || brand.contains("oppo") ||
            manufacturer.contains("realme") || brand.contains("realme") ||
            manufacturer.contains("oneplus") || brand.contains("oneplus") -> Brand.OPPO

            manufacturer.contains("vivo") || brand.contains("vivo") ||
            manufacturer.contains("iqoo") || brand.contains("iqoo") -> Brand.VIVO

            manufacturer.contains("samsung") || brand.contains("samsung") -> Brand.SAMSUNG

            else -> Brand.GENERIC
        }
    }

    // ---- auto-start Intent ----

    /**
     * Return the Intent that opens the system auto-start / background-run
     * management settings page for the current brand.
     *
     * This is where users grant "auto-start" or "run in background" permission,
     * critical for PhoneFarm to survive app switches and device reboots.
     *
     * @param context Android Context used to build ComponentName references.
     * @return Intent that resolves to the auto-start settings page, or a generic
     *         application details settings Intent as fallback.
     */
    fun getAutoStartIntent(context: Context): Intent {
        val packageName = context.packageName
        val brand = getBrand()

        // Brand-specific intents — each OEM has their own hidden activity path.
        val intent: Intent? = when (brand) {
            Brand.XIAOMI -> {
                // MIUI: Security Center → Manage apps → Auto-start
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.miui.securitycenter",
                            "com.miui.permcenter.autostart.AutoStartManagementActivity"
                        )
                    }
                } catch (_: Exception) {
                    null
                }
            }
            Brand.HUAWEI -> {
                // HarmonyOS / EMUI: Phone Manager → App launch
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.huawei.systemmanager",
                            "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
                        )
                    }
                } catch (_: Exception) {
                    try {
                        Intent().apply {
                            component = ComponentName(
                                "com.huawei.systemmanager",
                                "com.huawei.systemmanager.optimize.process.ProtectActivity"
                            )
                        }
                    } catch (_: Exception) {
                        null
                    }
                }
            }
            Brand.OPPO -> {
                // ColorOS: Security Center → Privacy Permissions → Auto-start
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.coloros.safecenter",
                            "com.coloros.safecenter.permission.startup.StartupAppListActivity"
                        )
                    }
                } catch (_: Exception) {
                    try {
                        Intent().apply {
                            component = ComponentName(
                                "com.oppo.safe",
                                "com.oppo.safe.permission.startup.StartupAppListActivity"
                            )
                        }
                    } catch (_: Exception) {
                        null
                    }
                }
            }
            Brand.VIVO -> {
                // OriginOS / FuntouchOS: i Manager → App manager → Auto-start
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.vivo.permissionmanager",
                            "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
                        )
                    }
                } catch (_: Exception) {
                    try {
                        Intent().apply {
                            component = ComponentName(
                                "com.iqoo.secure",
                                "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"
                            )
                        }
                    } catch (_: Exception) {
                        null
                    }
                }
            }
            Brand.SAMSUNG -> {
                // OneUI: Device Care → Battery → App power management
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.samsung.android.lool",
                            "com.samsung.android.sm.ui.battery.BatteryActivity"
                        )
                    }
                } catch (_: Exception) {
                    try {
                        Intent().apply {
                            component = ComponentName(
                                "com.samsung.android.sm_cn",
                                "com.samsung.android.sm.ui.battery.BatteryActivity"
                            )
                        }
                    } catch (_: Exception) {
                        null
                    }
                }
            }
            Brand.GENERIC -> {
                // Stock Android / unknown: fall back to app info page.
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    "package:$packageName".toUri()
                )
            }
        }

        return intent ?: Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            "package:$packageName".toUri()
        )
    }

    // ---- battery optimization Intent ----

    /**
     * Return the Intent that opens the battery optimization / power-saving
     * whitelist settings for the app.
     *
     * On Android 6+ this is normally accessible via
     * [Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS], but several
     * Chinese OEMs ignore this standard API and require their own activity.
     *
     * @param context Android Context.
     * @return Intent for the battery optimization settings page.
     */
    fun getBatteryOptimizationIntent(context: Context): Intent {
        val packageName = context.packageName
        val brand = getBrand()

        return when (brand) {
            Brand.XIAOMI -> {
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.miui.securitycenter",
                            "com.miui.powercenter.PowerSettings"
                        )
                    }
                } catch (_: Exception) {
                    standardBatteryOptimizationIntent(packageName)
                }
            }
            Brand.HUAWEI -> {
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.huawei.systemmanager",
                            "com.huawei.systemmanager.power.ui.HwPowerManagerActivity"
                        )
                    }
                } catch (_: Exception) {
                    standardBatteryOptimizationIntent(packageName)
                }
            }
            Brand.OPPO -> {
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.coloros.safecenter",
                            "com.coloros.safecenter.permission.PermissionAppsActivity"
                        )
                    }
                } catch (_: Exception) {
                    standardBatteryOptimizationIntent(packageName)
                }
            }
            Brand.VIVO -> {
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.vivo.permissionmanager",
                            "com.vivo.permissionmanager.activity.SoftPermissionDetailActivity"
                        )
                    }
                } catch (_: Exception) {
                    standardBatteryOptimizationIntent(packageName)
                }
            }
            Brand.SAMSUNG -> {
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.samsung.android.sm_cn",
                            "com.samsung.android.sm.ui.battery.AppSleepListActivity"
                        )
                    }
                } catch (_: Exception) {
                    standardBatteryOptimizationIntent(packageName)
                }
            }
            Brand.GENERIC -> standardBatteryOptimizationIntent(packageName)
        }
    }

    private fun standardBatteryOptimizationIntent(packageName: String): Intent {
        return Intent(
            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            "package:$packageName".toUri()
        )
    }

    // ---- notification settings Intent ----

    /**
     * Return the Intent that opens the notification settings page for this app,
     * or the brand-specific notification management page.
     *
     * Many Chinese ROMs additionally require enabling "floating notifications",
     * "lock screen notifications", and "notification badges" separately.
     *
     * @param context Android Context.
     * @return Intent for notification settings.
     */
    fun getNotificationSettingsIntent(context: Context): Intent {
        val packageName = context.packageName
        val brand = getBrand()

        val intent: Intent? = when (brand) {
            Brand.XIAOMI -> {
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.android.settings",
                            "com.android.settings.Settings\$NotificationFilterActivity"
                        )
                        putExtra("app_name", "PhoneFarm")
                    }
                } catch (_: Exception) {
                    null
                }
            }
            Brand.HUAWEI -> {
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.android.settings",
                            "com.android.settings.Settings\$NotificationAndStatusbarSettingsActivity"
                        )
                    }
                } catch (_: Exception) {
                    null
                }
            }
            Brand.OPPO -> {
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.coloros.notificationmanager",
                            "com.coloros.notificationmanager.NotificationSettingsActivity"
                        )
                    }
                } catch (_: Exception) {
                    null
                }
            }
            Brand.VIVO -> {
                try {
                    Intent().apply {
                        component = ComponentName(
                            "com.android.settings",
                            "com.vivo.notificationmanager.NotificationManagerActivity"
                        )
                    }
                } catch (_: Exception) {
                    null
                }
            }
            else -> null
        }

        return intent ?: Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
        }
    }
}
