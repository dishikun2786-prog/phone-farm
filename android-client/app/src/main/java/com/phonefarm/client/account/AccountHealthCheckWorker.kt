package com.phonefarm.client.account

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * WorkManager Worker that delegates to [AccountHealthCheck.checkAll].
 *
 * Scheduled periodically by [AccountHealthCheck.schedule].
 */
@HiltWorker
class AccountHealthCheckWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val accountHealthCheck: AccountHealthCheck,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val results = accountHealthCheck.checkAll()
            val unhealthy = results.count { (_, status) ->
                status != AccountManager.AccountHealthStatus.HEALTHY &&
                    status != AccountManager.AccountHealthStatus.UNKNOWN
            }
            android.util.Log.i(
                "AccountHealthCheckWorker",
                "Checked ${results.size} accounts, $unhealthy unhealthy"
            )
            Result.success()
        } catch (e: Exception) {
            android.util.Log.e("AccountHealthCheckWorker", "Health check failed", e)
            Result.retry()
        }
    }
}
