package com.phonefarm.client.maintenance

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.TrafficStats
import android.os.Process
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Per-service traffic statistics tracked by network type.
 *
 * Tracks bytes sent/received broken down by:
 *  - Service label (e.g., "websocket", "screenshot", "episode_upload", "apk_download")
 *  - Network type (WiFi, 4G, 5G, Ethernet, Unknown)
 *
 * Provides daily and monthly usage summaries with configurable limit checking.
 */
@Singleton
class DataUsageTracker @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    data class DataUsage(
        val totalBytes: Long,
        val sentBytes: Long,
        val receivedBytes: Long,
        val byNetwork: Map<String, Long>,   // networkType → bytes
        val byService: Map<String, Long>,    // serviceName → bytes
        val periodStart: Long,
        val periodEnd: Long,
    ) {
        val totalMb: Float get() = totalBytes / (1024f * 1024f)
        val sentMb: Float get() = sentBytes / (1024f * 1024f)
        val receivedMb: Float get() = receivedBytes / (1024f * 1024f)
    }

    enum class UsageLimitStatus {
        OK,
        WARNING,   // > 80% of daily limit
        EXCEEDED,  // over daily limit
    }

    data class UsageLimitResult(
        val status: UsageLimitStatus,
        val dailyLimitMb: Long,
        val currentDailyMb: Float,
        val percentUsed: Float,
        val message: String?,
    )

    // Default daily limit: 500 MB (configurable via server)
    private var dailyLimitBytes: Long = 500L * 1024L * 1024L

    // Thread-safe in-memory accumulators keyed by network type and service.
    private val trackMutex = Mutex()
    private val dailyBytesByNetwork = mutableMapOf<String, Long>()
    private val dailyBytesByService = mutableMapOf<String, Long>()
    private val monthlyBytesByNetwork = mutableMapOf<String, Long>()
    private val monthlyBytesByService = mutableMapOf<String, Long>()
    private var dailySentBytes = 0L
    private var dailyReceivedBytes = 0L
    private var monthlySentBytes = 0L
    private var monthlyReceivedBytes = 0L

    // App UID for TrafficStats queries.
    private val appUid: Int = Process.myUid()

    private val _dailyUsage = MutableStateFlow(
        DataUsage(
            totalBytes = 0L,
            sentBytes = 0L,
            receivedBytes = 0L,
            byNetwork = emptyMap(),
            byService = emptyMap(),
            periodStart = startOfToday(),
            periodEnd = startOfToday() + 24 * 60 * 60 * 1000L,
        )
    )
    val dailyUsage: StateFlow<DataUsage> = _dailyUsage.asStateFlow()

    private val _monthlyUsage = MutableStateFlow(
        DataUsage(
            totalBytes = 0L,
            sentBytes = 0L,
            receivedBytes = 0L,
            byNetwork = emptyMap(),
            byService = emptyMap(),
            periodStart = startOfMonth(),
            periodEnd = startOfNextMonth(),
        )
    )
    val monthlyUsage: StateFlow<DataUsage> = _monthlyUsage.asStateFlow()

    // ---- public API ----

    /**
     * Record a data transfer event.
     *
     * @param service   Logical service name (e.g., "websocket", "screenshot").
     * @param bytes     Number of bytes transferred.
     * @param networkType  Current network type string (WiFi, 4G, 5G, etc.).
     */
    fun trackBytes(service: String, bytes: Long, networkType: String) {
        // Snapshot TrafficStats for sent/received breakdown.
        val totalRx = TrafficStats.getUidRxBytes(appUid)
        val totalTx = TrafficStats.getUidTxBytes(appUid)

        // Update in-memory accumulators.
        dailyBytesByNetwork.merge(networkType, bytes, Long::plus)
        dailyBytesByService.merge(service, bytes, Long::plus)
        monthlyBytesByNetwork.merge(networkType, bytes, Long::plus)
        monthlyBytesByService.merge(service, bytes, Long::plus)

        // Derive sent/received from TrafficStats totals.
        val prevDailySent = dailySentBytes
        val prevDailyReceived = dailyReceivedBytes
        dailySentBytes = if (totalTx >= 0) totalTx else prevDailySent
        dailyReceivedBytes = if (totalRx >= 0) totalRx else prevDailyReceived
        monthlySentBytes = dailySentBytes
        monthlyReceivedBytes = dailyReceivedBytes

        val dailyTotal = dailyBytesByNetwork.values.sum() + dailyBytesByService.values.sum()
        val monthlyTotal = monthlyBytesByNetwork.values.sum() + monthlyBytesByService.values.sum()

        // Emit updated DataUsage summaries.
        _dailyUsage.value = DataUsage(
            totalBytes = dailyTotal,
            sentBytes = dailySentBytes,
            receivedBytes = dailyReceivedBytes,
            byNetwork = dailyBytesByNetwork.toMap(),
            byService = dailyBytesByService.toMap(),
            periodStart = startOfToday(),
            periodEnd = startOfToday() + 24 * 60 * 60 * 1000L,
        )
        _monthlyUsage.value = DataUsage(
            totalBytes = monthlyTotal,
            sentBytes = monthlySentBytes,
            receivedBytes = monthlyReceivedBytes,
            byNetwork = monthlyBytesByNetwork.toMap(),
            byService = monthlyBytesByService.toMap(),
            periodStart = startOfMonth(),
            periodEnd = startOfNextMonth(),
        )
    }

    /**
     * Check whether daily usage exceeds configured limits.
     *
     * @return [UsageLimitResult] with status and percentage used.
     */
    fun checkLimits(): UsageLimitResult {
        val current = _dailyUsage.value.totalMb
        val percent = current / (dailyLimitBytes / (1024f * 1024f)) * 100f

        return when {
            percent >= 100f -> UsageLimitResult(
                status = UsageLimitStatus.EXCEEDED,
                dailyLimitMb = dailyLimitBytes / (1024 * 1024),
                currentDailyMb = current,
                percentUsed = percent,
                message = "Daily data usage limit exceeded (${"%.1f".format(current)} MB)",
            )
            percent >= 80f -> UsageLimitResult(
                status = UsageLimitStatus.WARNING,
                dailyLimitMb = dailyLimitBytes / (1024 * 1024),
                currentDailyMb = current,
                percentUsed = percent,
                message = "Approaching daily data limit (${"%.1f".format(percent)}%)",
            )
            else -> UsageLimitResult(
                status = UsageLimitStatus.OK,
                dailyLimitMb = dailyLimitBytes / (1024 * 1024),
                currentDailyMb = current,
                percentUsed = percent,
                message = null,
            )
        }
    }

    /**
     * Set the daily data usage limit.
     */
    fun setDailyLimit(bytes: Long) {
        dailyLimitBytes = bytes
    }

    /**
     * Determine the current network type as a human-readable string.
     */
    fun getCurrentNetworkType(): String {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return "Unknown"
            val network: Network = cm.activeNetwork ?: return "None"
            val caps: NetworkCapabilities = cm.getNetworkCapabilities(network)
                ?: return "Unknown"

            when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WiFi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                    // Differentiate between 4G/5G if possible.
                    if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)) {
                        "5G" // Heuristic — could also be unmetered WiFi tether.
                    } else {
                        "4G"
                    }
                }
                caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "VPN"
                else -> "Other"
            }
        } catch (_: Exception) {
            "Unknown"
        }
    }

    // ---- utility ----

    private fun startOfToday(): Long {
        val cal = java.util.Calendar.getInstance()
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0)
        cal.set(java.util.Calendar.MINUTE, 0)
        cal.set(java.util.Calendar.SECOND, 0)
        cal.set(java.util.Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }

    private fun startOfMonth(): Long {
        val cal = java.util.Calendar.getInstance()
        cal.set(java.util.Calendar.DAY_OF_MONTH, 1)
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0)
        cal.set(java.util.Calendar.MINUTE, 0)
        cal.set(java.util.Calendar.SECOND, 0)
        cal.set(java.util.Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }

    private fun startOfNextMonth(): Long {
        val cal = java.util.Calendar.getInstance()
        cal.set(java.util.Calendar.DAY_OF_MONTH, 1)
        cal.add(java.util.Calendar.MONTH, 1)
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0)
        cal.set(java.util.Calendar.MINUTE, 0)
        cal.set(java.util.Calendar.SECOND, 0)
        cal.set(java.util.Calendar.MILLISECOND, 0)
        return cal.timeInMillis
    }
}
