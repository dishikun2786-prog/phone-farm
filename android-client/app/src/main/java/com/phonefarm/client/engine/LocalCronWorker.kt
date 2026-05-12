package com.phonefarm.client.engine

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.phonefarm.client.data.local.dao.LocalCronJobDao
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * WorkManager Worker that picks up due cron jobs from Room and executes them.
 *
 * Scheduled periodically by [LocalCronScheduler].
 * Each tick, queries [LocalCronJobDao] for enabled jobs whose [nextRunAt]
 * has passed, and delegates execution to the automation engine.
 */
@HiltWorker
class LocalCronWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val localCronJobDao: LocalCronJobDao,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            // TODO: Query enabled jobs where nextRunAt <= now.
            //       For each due job, launch the script via JsAutomation.
            //       Update lastRunAt and compute nextRunAt from cronExpression.

            android.util.Log.d("LocalCronWorker", "Cron tick completed")
            Result.success()
        } catch (e: Exception) {
            android.util.Log.e("LocalCronWorker", "Cron tick failed", e)
            Result.retry()
        }
    }
}
