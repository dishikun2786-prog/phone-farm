package com.phonefarm.client.maintenance

import android.content.Context
import android.os.Environment
import android.os.StatFs
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Disk space monitoring with threshold-based alert levels.
 *
 * Polls available storage periodically (every 60 seconds) and exposes
 * a [StateFlow] of the current [StorageState].
 *
 * Alert thresholds:
 *  - < 1 GB  → YELLOW (warning — reduce logging frequency)
 *  - < 500 MB → ORANGE (degraded — pause screenshots/recording/downloads)
 *  - < 200 MB → RED (critical — pause all non-essential operations)
 */
@Singleton
class StorageMonitor @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    enum class StorageLevel {
        /** More than 1 GB available — normal operation. */
        NORMAL,
        /** Less than 1 GB — reduce non-critical disk writes. */
        YELLOW,
        /** Less than 500 MB — pause screenshots, recordings, downloads. */
        ORANGE,
        /** Less than 200 MB — pause all automated tasks. */
        RED,
    }

    data class StorageState(
        val totalBytes: Long,
        val availableBytes: Long,
        val usedBytes: Long,
        val level: StorageLevel,
        val storagePath: String,
    ) {
        val availableMb: Long get() = availableBytes / (1024 * 1024)
        val usedPercent: Float get() = if (totalBytes > 0) {
            usedBytes.toFloat() / totalBytes.toFloat() * 100f
        } else 0f
    }

    private val _storageState = MutableStateFlow(
        StorageState(
            totalBytes = 0L,
            availableBytes = 0L,
            usedBytes = 0L,
            level = StorageLevel.NORMAL,
            storagePath = "",
        )
    )
    val storageState: StateFlow<StorageState> = _storageState.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var monitorJob: Job? = null

    // ---- public API ----

    /**
     * Start periodic storage monitoring. Safe to call multiple times.
     */
    fun start() {
        if (monitorJob?.isActive == true) return
        monitorJob = scope.launch {
            while (true) {
                update()
                delay(60_000L)
            }
        }
    }

    /**
     * Stop periodic monitoring.
     */
    fun stop() {
        monitorJob?.cancel()
        monitorJob = null
    }

    /**
     * Force an immediate storage state update. Useful for reacting to
     * a download completion or file deletion event.
     *
     * @return The updated [StorageState].
     */
    suspend fun update(): StorageState {
        return withContext(Dispatchers.IO) {
            val state = computeStorageState()
            _storageState.value = state
            state
        }
    }

    /**
     * Get the current storage state synchronously (returns cached value).
     */
    fun getCurrentState(): StorageState = _storageState.value

    // ---- internal ----

    private fun computeStorageState(): StorageState {
        val dataDir = Environment.getDataDirectory()
        val stat = StatFs(dataDir.absolutePath)

        val blockSize = stat.blockSizeLong
        val totalBytes = stat.blockCountLong * blockSize
        val availableBytes = stat.availableBlocksLong * blockSize
        val usedBytes = totalBytes - availableBytes

        val level = when {
            availableBytes < 200L * 1024 * 1024 -> StorageLevel.RED
            availableBytes < 500L * 1024 * 1024 -> StorageLevel.ORANGE
            availableBytes < 1024L * 1024 * 1024 -> StorageLevel.YELLOW
            else -> StorageLevel.NORMAL
        }

        return StorageState(
            totalBytes = totalBytes,
            availableBytes = availableBytes,
            usedBytes = usedBytes,
            level = level,
            storagePath = dataDir.absolutePath,
        )
    }
}
