package com.phonefarm.client.maintenance

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.roundToLong

/**
 * Periodic cache and temporary file cleanup via WorkManager.
 *
 * Scheduled for Sunday 3:00 AM by default. Cleans up:
 *  - Screenshots older than 7 days and/or exceeding 500 MB total
 *  - Episode recordings older than 30 days and/or exceeding 1 GB total
 *  - Log files older than 14 days and/or exceeding 50 MB total
 */
@Singleton
class CacheCleaner @Inject constructor(
    @ApplicationContext private val context: Context,
    private val workManager: WorkManager,
) {

    data class CleanupResult(
        val freedMb: Long,
        val deletedFiles: Long,
    )

    companion object {
        private const val TAG = "CacheCleaner"
        private const val WORK_NAME = "phonefarm_cache_cleanup"

        // Thresholds
        private const val SCREENSHOTS_MAX_AGE_DAYS = 7L
        private const val SCREENSHOTS_MAX_SIZE_MB = 500L
        private const val EPISODES_MAX_AGE_DAYS = 30L
        private const val EPISODES_MAX_SIZE_MB = 1024L
        private const val LOGS_MAX_AGE_DAYS = 14L
        private const val LOGS_MAX_SIZE_MB = 50L
    }

    /**
     * Schedule periodic cache cleanup via WorkManager.
     *
     * Runs every Sunday around 3:00 AM. Only executes when the device is
     * connected to WiFi (unmetered network) to avoid consuming mobile data
     * quota for cache management.
     */
    suspend fun scheduleCleanup() {
        val constraints = Constraints.Builder()
            .setRequiresBatteryNotLow(true)
            .setRequiredNetworkType(NetworkType.UNMETERED)
            .build()

        val request = PeriodicWorkRequestBuilder<CacheCleanupWorker>(
            repeatInterval = 7, // days
            repeatIntervalTimeUnit = TimeUnit.DAYS
        )
            .setConstraints(constraints)
            .addTag(WORK_NAME)
            .setInitialDelay(computeInitialDelayToNextSunday3am(), TimeUnit.MILLISECONDS)
            .build()

        workManager.enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    /**
     * Run cleanup immediately and return the amount freed.
     *
     * This is the synchronous version called from the WorkManager Worker
     * or from a coroutine context.
     */
    suspend fun cleanNow(): CleanupResult {
        var totalFreedBytes = 0L
        var totalDeletedFiles = 0L

        // Screenshots: >7 days old or total >500MB
        val screenshotDir = File(context.cacheDir, "screenshots")
        val screenshotResult = cleanDirectory(
            screenshotDir,
            maxAgeDays = SCREENSHOTS_MAX_AGE_DAYS,
            maxTotalSizeMb = SCREENSHOTS_MAX_SIZE_MB
        )
        totalFreedBytes += screenshotResult.first
        totalDeletedFiles += screenshotResult.second

        // Episodes: >30 days old or total >1GB
        val episodeDir = File(context.filesDir, "episodes")
        val episodeResult = cleanDirectory(
            episodeDir,
            maxAgeDays = EPISODES_MAX_AGE_DAYS,
            maxTotalSizeMb = EPISODES_MAX_SIZE_MB
        )
        totalFreedBytes += episodeResult.first
        totalDeletedFiles += episodeResult.second

        // Logs: >14 days old or total >50MB
        val logDir = File(context.filesDir, "logs")
        val logResult = cleanDirectory(
            logDir,
            maxAgeDays = LOGS_MAX_AGE_DAYS,
            maxTotalSizeMb = LOGS_MAX_SIZE_MB
        )
        totalFreedBytes += logResult.first
        totalDeletedFiles += logResult.second

        // General cache
        val cacheDir = context.cacheDir
        val cacheResult = cleanGeneralCache(cacheDir)
        totalFreedBytes += cacheResult.first
        totalDeletedFiles += cacheResult.second

        return CleanupResult(
            freedMb = totalFreedBytes / (1024 * 1024),
            deletedFiles = totalDeletedFiles,
        )
    }

    /**
     * Clean a directory by age and/or total size thresholds.
     *
     * @return Pair of (bytesFreed, filesDeleted).
     */
    private fun cleanDirectory(
        dir: File,
        maxAgeDays: Long,
        maxTotalSizeMb: Long,
    ): Pair<Long, Long> {
        if (!dir.exists() || !dir.isDirectory) return Pair(0L, 0L)

        val files = dir.listFiles()?.toList() ?: return Pair(0L, 0L)
        if (files.isEmpty()) return Pair(0L, 0L)

        val now = System.currentTimeMillis()
        val maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000L
        var totalSize = files.sumOf { it.length() }
        val maxSizeBytes = maxTotalSizeMb * 1024 * 1024
        var bytesFreed = 0L
        var deletedCount = 0

        // Sort by last modified ascending (oldest first)
        val sorted = files.sortedBy { it.lastModified() }

        for (file in sorted) {
            if (!file.isFile) continue

            val ageMs = now - file.lastModified()
            val shouldDelete = ageMs > maxAgeMs || totalSize > maxSizeBytes

            if (shouldDelete) {
                val size = file.length()
                if (file.delete()) {
                    bytesFreed += size
                    totalSize -= size
                    deletedCount++
                }
            }
        }

        return Pair(bytesFreed, deletedCount.toLong())
    }

    /**
     * Clean the general cache directory (files not in named subdirectories).
     */
    private fun cleanGeneralCache(cacheDir: File): Pair<Long, Long> {
        var bytesFreed = 0L
        var deletedCount = 0

        val files = cacheDir.listFiles() ?: return Pair(0L, 0L)
        for (file in files) {
            if (file.isFile) {
                val size = file.length()
                if (file.delete()) {
                    bytesFreed += size
                    deletedCount++
                }
            }
        }

        return Pair(bytesFreed, deletedCount.toLong())
    }

    /**
     * Compute the milliseconds until next Sunday 3:00 AM.
     */
    private fun computeInitialDelayToNextSunday3am(): Long {
        val now = java.util.Calendar.getInstance()
        val target = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.DAY_OF_WEEK, java.util.Calendar.SUNDAY)
            set(java.util.Calendar.HOUR_OF_DAY, 3)
            set(java.util.Calendar.MINUTE, 0)
            set(java.util.Calendar.SECOND, 0)
            set(java.util.Calendar.MILLISECOND, 0)
            // If we've already passed today's 3 AM, schedule for next week.
            if (timeInMillis <= now.timeInMillis) {
                add(java.util.Calendar.WEEK_OF_YEAR, 1)
            }
        }
        return target.timeInMillis - now.timeInMillis
    }
}
