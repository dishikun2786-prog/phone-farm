package com.phonefarm.client.account

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Periodic account login state verification via WorkManager.
 *
 * Checks each saved platform account's login validity on a configurable
 * interval (default: every 6 hours). Accounts that have expired or been
 * locked/banned are flagged with a notification and reported to the
 * control server.
 *
 * The check uses lightweight HTTP requests to the platform's user-info
 * endpoint with the stored session cookies, avoiding full WebView login
 * flows for routine verification.
 */
@Singleton
class AccountHealthCheck @Inject constructor(
    @ApplicationContext private val context: Context,
    private val workManager: WorkManager,
    private val accountManager: AccountManager,
) {

    companion object {
        private const val TAG = "AccountHealthCheck"
        private const val WORK_NAME = "phonefarm_account_health_check"

        /** Default interval between health checks. */
        private const val DEFAULT_INTERVAL_HOURS = 6L
    }

    /**
     * Schedule periodic account health checks.
     *
     * Only runs when the device has an unmetered network connection
     * (WiFi) to avoid consuming mobile data with background HTTP calls.
     */
    suspend fun schedule(intervalHours: Long = DEFAULT_INTERVAL_HOURS) {
        val constraints = Constraints.Builder()
            .setRequiresBatteryNotLow(true)
            .setRequiredNetworkType(NetworkType.UNMETERED)
            .build()

        val request = PeriodicWorkRequestBuilder<AccountHealthCheckWorker>(
            repeatInterval = intervalHours,
            repeatIntervalTimeUnit = TimeUnit.HOURS,
        )
            .setConstraints(constraints)
            .addTag(WORK_NAME)
            .build()

        workManager.enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    /**
     * Run a manual health check for all accounts immediately.
     *
     * @return Map of accountId → AccountManager.AccountHealthStatus with results.
     */
    suspend fun checkAll(): Map<String, AccountManager.AccountHealthStatus> {
        val results = mutableMapOf<String, AccountManager.AccountHealthStatus>()

        for (account in accountManager.accounts.value) {
            try {
                val status = accountManager.checkAccountHealth(account.id)
                results[account.id] = status
            } catch (e: Exception) {
                results[account.id] = AccountManager.AccountHealthStatus.ERROR
            }
        }

        return results
    }

    /**
     * Cancel scheduled periodic health checks.
     */
    fun cancel() {
        workManager.cancelUniqueWork(WORK_NAME)
    }
}
