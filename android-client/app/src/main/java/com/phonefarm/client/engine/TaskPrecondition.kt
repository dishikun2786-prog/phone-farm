package com.phonefarm.client.engine

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Environment
import android.os.StatFs
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.Calendar
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pre-execution environment checks for automation tasks.
 *
 * Before starting a task, validates:
 *  1. Battery level >= minimum threshold (default 15%)
 *  2. Network connectivity (WiFi or cellular)
 *  3. Required platform app is installed
 *  4. Sufficient free storage (>= 200 MB)
 *  5. (Optional) Task is within quiet hours (configurable time window)
 *
 * Preconditions can be configured per-task to allow flexibility for
 * critical tasks that should run even under degraded conditions.
 */
@Singleton
class TaskPrecondition @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    data class PreconditionResult(
        val allPassed: Boolean,
        val batteryPassed: Boolean,
        val networkPassed: Boolean,
        val appInstalledPassed: Boolean,
        val storagePassed: Boolean,
        val quietHoursPassed: Boolean,
        val details: String,
    )

    data class PreconditionConfig(
        val minBatteryPercent: Int = 15,
        val requireNetwork: Boolean = true,
        val requiredAppPackage: String? = null,  // e.g., "com.ss.android.ugc.aweme" (Douyin)
        val minFreeStorageMb: Long = 200,
        val quietHoursStartHour: Int = -1,  // -1 = disabled
        val quietHoursEndHour: Int = -1,
    )

    // ---- public API ----

    /**
     * Run all configured preconditions.
     *
     * @param config  Environment requirements for this task.
     * @return [PreconditionResult] with individual check results.
     */
    fun check(config: PreconditionConfig): PreconditionResult {
        val batteryOk = checkBattery(config.minBatteryPercent)
        val networkOk = if (config.requireNetwork) checkNetwork() else true
        val appInstalledOk = if (config.requiredAppPackage != null) {
            checkAppInstalled(config.requiredAppPackage)
        } else true
        val storageOk = checkStorage(config.minFreeStorageMb)
        val quietOk = if (config.quietHoursStartHour >= 0 && config.quietHoursEndHour >= 0) {
            checkQuietHours(config.quietHoursStartHour, config.quietHoursEndHour)
        } else true

        val allPassed = batteryOk && networkOk && appInstalledOk && storageOk && quietOk

        val details = buildString {
            if (!allPassed) {
                append("Precondition failures: ")
                val failures = mutableListOf<String>()
                if (!batteryOk) failures.add("battery")
                if (!networkOk) failures.add("network")
                if (!appInstalledOk) failures.add("app_installed")
                if (!storageOk) failures.add("storage")
                if (!quietOk) failures.add("quiet_hours")
                append(failures.joinToString(", "))
            } else {
                append("All preconditions passed")
            }
        }

        return PreconditionResult(
            allPassed = allPassed,
            batteryPassed = batteryOk,
            networkPassed = networkOk,
            appInstalledPassed = appInstalledOk,
            storagePassed = storageOk,
            quietHoursPassed = quietOk,
            details = details,
        )
    }

    // ---- individual checks ----

    /**
     * Check battery level and charging state.
     * If the device is charging, the battery threshold is relaxed to 5%.
     */
    private fun checkBattery(minPercent: Int): Boolean {
        return try {
            val intent = context.registerReceiver(
                null,
                IntentFilter(Intent.ACTION_BATTERY_CHANGED),
            ) ?: return true // Can't read battery — assume OK.

            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)

            if (level < 0 || scale <= 0) return true

            val percent = (level * 100) / scale
            val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                    status == BatteryManager.BATTERY_STATUS_FULL

            // Relax limit when charging.
            val effectiveMin = if (isCharging) {
                minOf(minPercent, 5)
            } else {
                minPercent
            }

            percent >= effectiveMin
        } catch (_: Exception) {
            true // Assume OK if battery can't be read.
        }
    }

    /**
     * Check whether any network (WiFi or cellular) is available.
     */
    private fun checkNetwork(): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE)
                    as? ConnectivityManager ?: return true
            val network = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } catch (_: Exception) {
            true // Assume OK on error.
        }
    }

    /**
     * Check whether a specific package is installed.
     */
    private fun checkAppInstalled(packageName: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (_: android.content.pm.PackageManager.NameNotFoundException) {
            false
        }
    }

    /**
     * Check available storage.
     */
    private fun checkStorage(minFreeMb: Long): Boolean {
        return try {
            val stat = StatFs(Environment.getDataDirectory().absolutePath)
            val availableBytes = stat.availableBlocksLong * stat.blockSizeLong
            availableBytes >= minFreeMb * 1024 * 1024
        } catch (_: Exception) {
            true // Assume OK on error.
        }
    }

    /**
     * Check if the current time is outside quiet hours.
     *
     * Quiet hours are when automation should NOT run (e.g., 23:00–07:00)
     * to avoid disrupting the device owner.
     */
    private fun checkQuietHours(startHour: Int, endHour: Int): Boolean {
        val now = Calendar.getInstance()
        val currentHour = now.get(Calendar.HOUR_OF_DAY)

        return if (startHour <= endHour) {
            // e.g., 23:00–07:00 → currentHour < 23 || currentHour >= 7
            currentHour < startHour || currentHour >= endHour
        } else {
            // Wrapped around midnight: e.g., 23:00–07:00.
            currentHour < startHour || currentHour >= endHour
        }
    }
}
