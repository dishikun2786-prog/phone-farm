package com.phonefarm.client.maintenance

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import javax.inject.Inject

/**
 * WorkManager Worker that delegates to [CacheCleaner.cleanNow].
 *
 * Scheduled periodically by [CacheCleaner.scheduleCleanup].
 */
@HiltWorker
class CacheCleanupWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val cacheCleaner: CacheCleaner,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val result = cacheCleaner.cleanNow()
            android.util.Log.i(
                "CacheCleanupWorker",
                "Cleaned ${result.deletedFiles} files, freed ${result.freedMb} MB"
            )
            Result.success()
        } catch (e: Exception) {
            android.util.Log.e("CacheCleanupWorker", "Cleanup failed", e)
            Result.retry()
        }
    }
}
