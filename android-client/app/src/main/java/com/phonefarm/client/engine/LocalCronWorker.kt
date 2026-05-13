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
            val now = System.currentTimeMillis()
            val allJobs = kotlinx.coroutines.flow.first { localCronJobDao.observeAll() }
            val dueJobs = allJobs.filter { job ->
                job.enabled && job.nextRunAt != null && job.nextRunAt <= now
            }

            if (dueJobs.isEmpty()) {
                android.util.Log.d("LocalCronWorker", "No due jobs")
                return Result.success()
            }

            for (job in dueJobs) {
                try {
                    android.util.Log.i("LocalCronWorker", "Executing cron job: ${job.jobId} (${job.scriptName})")
                    // Update execution timestamps
                    val updatedJob = job.copy(
                        lastRunAt = now,
                        nextRunAt = computeNextRun(job.cronExpression, now),
                    )
                    localCronJobDao.upsert(updatedJob)

                    // Launch script via JsAutomation if available
                    triggerScriptExecution(job.scriptName, job.scriptConfig)
                } catch (e: Exception) {
                    android.util.Log.e("LocalCronWorker", "Failed job ${job.jobId}", e)
                }
            }

            android.util.Log.d("LocalCronWorker", "Cron tick complete: ${dueJobs.size} jobs executed")
            Result.success()
        } catch (e: Exception) {
            android.util.Log.e("LocalCronWorker", "Cron tick failed", e)
            Result.retry()
        }
    }

    private fun triggerScriptExecution(scriptName: String, config: String?) {
        // Delegate to JsAutomation bridge for script execution
        // The script engine picks this up and runs it in Rhino
        try {
            val intent = android.content.Intent("com.phonefarm.client.action.RUN_SCRIPT").apply {
                putExtra("scriptName", scriptName)
                if (config != null) putExtra("config", config)
                addFlags(android.content.Intent.FLAG_INCLUDE_STOPPED_PACKAGES)
            }
            applicationContext.sendBroadcast(intent)
        } catch (e: Exception) {
            android.util.Log.w("LocalCronWorker", "Broadcast trigger failed for $scriptName: ${e.message}")
        }
    }

    /**
     * Compute the next run time from a cron expression.
     * Supports simple 5-field cron: minute hour day-of-month month day-of-week.
     */
    private fun computeNextRun(cronExpression: String, fromTime: Long): Long? {
        return try {
            val fields = cronExpression.trim().split("\\s+".toRegex())
            if (fields.size != 5) return null

            val calendar = java.util.Calendar.getInstance().apply { timeInMillis = fromTime }
            calendar.set(java.util.Calendar.SECOND, 0)
            calendar.set(java.util.Calendar.MILLISECOND, 0)
            calendar.add(java.util.Calendar.MINUTE, 1) // at least 1 min in future

            val minuteField = fields[0]
            val hourField = fields[1]

            if (minuteField == "*" && hourField == "*") {
                // Every minute — next minute
                calendar.timeInMillis
            } else {
                val minute = parseCronField(minuteField, calendar.get(java.util.Calendar.MINUTE))
                val hour = parseCronField(hourField, calendar.get(java.util.Calendar.HOUR_OF_DAY))
                val effectiveMin = minute ?: calendar.get(java.util.Calendar.MINUTE)
                val effectiveHour = hour ?: calendar.get(java.util.Calendar.HOUR_OF_DAY)
                calendar.set(java.util.Calendar.MINUTE, effectiveMin)
                calendar.set(java.util.Calendar.HOUR_OF_DAY, effectiveHour)
                if (calendar.timeInMillis <= fromTime) {
                    calendar.add(java.util.Calendar.DAY_OF_MONTH, 1)
                }
                calendar.timeInMillis
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun parseCronField(field: String, current: Int): Int? {
        if (field == "*") return null
        if (field.contains("/")) {
            val parts = field.split("/")
            val interval = parts[1].toIntOrNull() ?: return null
            return ((current / interval) + 1) * interval
        }
        if (field.contains(",")) {
            val values = field.split(",").mapNotNull { it.toIntOrNull() }
            return values.firstOrNull { it >= current } ?: values.firstOrNull()
        }
        return field.toIntOrNull()
    }
}
