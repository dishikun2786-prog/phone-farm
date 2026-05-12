package com.phonefarm.client.update

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Server version check and force-update enforcement.
 *
 * Queries the control server for the latest APK version on a configurable
 * interval (default: every 12 hours). Supports force-update mode where
 * the app must be updated before it can be used again.
 *
 * When an update is available:
 *  1. Optional update: Shows a non-blocking notification + banner in the app.
 *  2. Force update: Shows a full-screen dialog that blocks app usage until
 *     the update is installed.
 */
@Singleton
class AppUpdateChecker @Inject constructor(
    @ApplicationContext private val context: Context,
    private val workManager: WorkManager,
    private val selfUpdater: SelfUpdater,
) {

    companion object {
        private const val TAG = "AppUpdateChecker"
        private const val PERIODIC_WORK_NAME = "phonefarm_update_check"
        private const val DEFAULT_INTERVAL_HOURS = 12L
    }

    /**
     * Schedule periodic version checks via WorkManager.
     *
     * Only performs checks on WiFi to avoid consuming mobile data for
     * potentially large APK downloads.
     */
    suspend fun schedule(intervalHours: Long = DEFAULT_INTERVAL_HOURS) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.UNMETERED)
            .setRequiresBatteryNotLow(true)
            .build()

        val request = PeriodicWorkRequestBuilder<UpdateCheckWorker>(
            repeatInterval = intervalHours,
            repeatIntervalTimeUnit = TimeUnit.HOURS,
        )
            .setConstraints(constraints)
            .addTag(PERIODIC_WORK_NAME)
            .build()

        workManager.enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    /**
     * Run a one-time immediate version check.
     *
     * @return [SelfUpdater.UpdateInfo] if update available, null otherwise.
     */
    suspend fun checkNow(): SelfUpdater.UpdateInfo? {
        return selfUpdater.checkForUpdate()
    }

    /**
     * Download and install the latest update.
     *
     * Delegates to [SelfUpdater.downloadUpdate] + [SelfUpdater.installUpdate].
     *
     * @param info  The [SelfUpdater.UpdateInfo] from [checkForUpdate].
     */
    suspend fun downloadAndInstall(info: SelfUpdater.UpdateInfo) {
        val apkFile = selfUpdater.downloadUpdate(info.downloadUrl) { progress ->
            // UpdateState is already updated inside SelfUpdater.
        }
        selfUpdater.installUpdate(apkFile, info.sha256)
    }

    /**
     * Cancel scheduled periodic checks.
     */
    fun cancel() {
        workManager.cancelUniqueWork(PERIODIC_WORK_NAME)
    }
}
