package com.phonefarm.client.update

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * WorkManager Worker that delegates to [AppUpdateChecker.checkNow].
 */
@HiltWorker
class UpdateCheckWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val appUpdateChecker: AppUpdateChecker,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val updateInfo = appUpdateChecker.checkNow()
            if (updateInfo != null) {
                android.util.Log.i(
                    "UpdateCheckWorker",
                    "Update available: ${updateInfo.versionName} (${updateInfo.versionCode})"
                )
                // TODO: Post a notification via NotificationHelper.
                //       If force update, block the main UI until update is installed.
            }
            Result.success()
        } catch (e: Exception) {
            android.util.Log.e("UpdateCheckWorker", "Update check failed", e)
            Result.retry()
        }
    }
}
