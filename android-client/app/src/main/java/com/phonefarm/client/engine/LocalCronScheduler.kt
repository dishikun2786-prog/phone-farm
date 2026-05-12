package com.phonefarm.client.engine

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkRequest
import com.phonefarm.client.data.local.dao.LocalCronJobDao
import com.phonefarm.client.data.local.entity.LocalCronJobEntity
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.Calendar
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * WorkManager PeriodicWorkRequest-based local cron scheduler.
 *
 * Manages local cron jobs stored in Room. Each job has a cron expression
 * (currently only simple interval-based scheduling is supported; full
 * cron parsing is TODO) and a target script name with optional config JSON.
 *
 * Jobs are persisted to survive reboots and can be enabled/disabled
 * without re-scheduling.
 *
 * This is separate from the server-side cron scheduler �?it provides
 * scheduling capability even when the device is offline.
 */
@Singleton
class LocalCronScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val workManager: WorkManager,
    private val localCronJobDao: LocalCronJobDao,
) {

    companion object {
        private const val TAG = "LocalCronScheduler"
        /** Minimum interval for periodic work (15 minutes �?Android's minimum). */
        const val MIN_INTERVAL_MINUTES = 15L
    }

    /**
     * Schedule or update a cron job.
     *
     * Creates a [PeriodicWorkRequestBuilder] that runs every [intervalMinutes]
     * minutes. The worker picks up the latest enabled jobs from Room and
     * executes any that are due.
     *
     * Note: Full cron expression parsing is deferred. Currently uses a
     * simple fixed-interval model. The worker itself checks which jobs
     * should run at each tick.
     *
     * @param jobId           Unique job identifier (UUID).
     * @param scriptName      Name of the DeekeScript to execute.
     * @param intervalMinutes How often to run. Must be >= 15 minutes.
     * @param scriptConfig    Optional JSON config for the script.
     */
    suspend fun schedule(
        jobId: String,
        scriptName: String,
        intervalMinutes: Long,
        scriptConfig: String? = null,
    ) {
        val effectiveInterval = intervalMinutes.coerceAtLeast(MIN_INTERVAL_MINUTES)
        val now = System.currentTimeMillis()

        // Persist to Room.
        localCronJobDao.upsert(
            LocalCronJobEntity(
                jobId = jobId,
                scriptName = scriptName,
                cronExpression = "*/$effectiveInterval * * * *",
                scriptConfig = scriptConfig,
                enabled = true,
                lastRunAt = null,
                nextRunAt = now + effectiveInterval * 60 * 1000,
                createdAt = now,
            )
        )

        // Schedule the WorkManager worker.
        val constraints = Constraints.Builder()
            .setRequiresBatteryNotLow(true)
            .build()

        val request = PeriodicWorkRequestBuilder<LocalCronWorker>(
            repeatInterval = effectiveInterval,
            repeatIntervalTimeUnit = TimeUnit.MINUTES,
        )
            .setConstraints(constraints)
            .addTag("cron_$jobId")
            .build()

        workManager.enqueueUniquePeriodicWork(
            "phonefarm_cron_$jobId",
            ExistingPeriodicWorkPolicy.REPLACE,
            request,
        )
    }

    /**
     * Cancel a single cron job by ID.
     */
    suspend fun cancel(jobId: String) {
        workManager.cancelUniqueWork("phonefarm_cron_$jobId")
        // Update Room: mark as disabled.
        val entity = localCronJobDao.get(jobId)
        if (entity != null) {
            localCronJobDao.upsert(entity.copy(enabled = false))
        }
    }

    /**
     * Cancel all cron jobs.
     */
    suspend fun cancelAll() {
        val allJobs = localCronJobDao.observeAll()
        // Cancel all tagged work.
        workManager.cancelAllWorkByTag("cron_")
    }

    /**
     * Run a cron job immediately (one-shot).
     *
     * @param jobId  The job to execute now.
     */
    suspend fun runNow(jobId: String) {
        val job = localCronJobDao.get(jobId) ?: return

        val request = OneTimeWorkRequestBuilder<LocalCronWorker>()
            .addTag("cron_manual_$jobId")
            .build()

        workManager.enqueue(request)
    }

    /**
     * Get the next scheduled run time for a job.
     *
     * @param jobId  The job ID.
     * @return Epoch millis of the next scheduled run, or null if not scheduled.
     */
    suspend fun getNextRunTime(jobId: String): Long? {
        return localCronJobDao.get(jobId)?.nextRunAt
    }

    /**
     * Check whether a cron expression is valid.
     *
     * Currently accepts only simple interval expressions like an every-N pattern.
     * Full cron support (0 3 * * SUN, etc.) is TODO.
     */
    fun isValidCronExpression(expr: String): Boolean {
        // TODO: Full cron parser (e.g., cron-utils library).
        return expr.matches(Regex("\\*/\\d+ .+"))
    }
}
