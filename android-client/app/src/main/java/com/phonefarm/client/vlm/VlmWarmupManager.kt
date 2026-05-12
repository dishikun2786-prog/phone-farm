package com.phonefarm.client.vlm

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import com.phonefarm.client.model.ModelManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Cold start optimization manager for local VLM inference.
 *
 * Loading a VLM model into memory (especially 7B+ parameters) can take
 * 2-10 seconds on mobile hardware. [VlmWarmupManager] pre-warms the
 * model when the user is likely to start a VLM task, reducing perceived
 * latency from seconds to near-instant.
 */
@Singleton
class VlmWarmupManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val modelManager: ModelManager,
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var warmupJob: Job? = null
    private var autoUnloadJob: Job? = null
    private var warmupModelId: String? = null

    /** Duration to keep model cached after warmup (milliseconds). */
    private val cacheDurationMs = 5 * 60 * 1000L // 5 minutes

    /**
     * Pre-warm the local VLM model if conditions are suitable.
     */
    suspend fun warmupIfNeeded() {
        // Skip if local inference is not available
        if (!com.phonefarm.client.vlm.LocalVlmClient.isNativeAvailable) return

        // Check battery level — skip warmup below 20%
        val batteryLevel = getBatteryLevel()
        if (batteryLevel in 1..19) {
            android.util.Log.d("VlmWarmupManager", "Skipping warmup: battery level $batteryLevel% too low")
            return
        }

        // Find recommended model from installed models
        val installedModels = modelManager.installedModels.value
        if (installedModels.isEmpty()) return

        // Prefer recommended model, fall back to first ready model
        val model = installedModels.firstOrNull { it.isRecommended && it.status == "ready" }
            ?: installedModels.firstOrNull { it.status == "ready" }
            ?: return

        warmupModelId = model.modelId

        try {
            // Load model into memory
            android.util.Log.d("VlmWarmupManager", "Warming up model: ${model.modelId}")
            modelManager.loadModel(model.modelId)

            // Schedule auto-unload after cache duration
            cancelAutoUnload()
            autoUnloadJob = scope.launch {
                delay(cacheDurationMs)
                releaseWarmup()
            }
        } catch (e: Exception) {
            android.util.Log.w("VlmWarmupManager", "Warmup failed: ${e.message}")
        }
    }

    /**
     * Release the warmup hold so the model can be unloaded.
     */
    suspend fun releaseWarmup() {
        cancelAutoUnload()
        warmupModelId?.let { modelId ->
            try {
                modelManager.unloadModel(modelId)
                android.util.Log.d("VlmWarmupManager", "Released warmup for model: $modelId")
            } catch (e: Exception) {
                android.util.Log.w("VlmWarmupManager", "Error releasing warmup: ${e.message}")
            }
        }
        warmupModelId = null
    }

    /**
     * Extend the auto-unload timer (e.g., user re-engaged with VLM features).
     */
    fun extendWarmup() {
        cancelAutoUnload()
        autoUnloadJob = scope.launch {
            delay(cacheDurationMs)
            releaseWarmup()
        }
    }

    private fun cancelAutoUnload() {
        autoUnloadJob?.cancel()
        autoUnloadJob = null
    }

    /**
     * Get battery level as percentage [0, 100], or -1 if unavailable.
     */
    private fun getBatteryLevel(): Int {
        val intent = context.registerReceiver(
            null,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        ) ?: return -1

        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        return if (level >= 0 && scale > 0) {
            (level * 100 / scale)
        } else {
            -1
        }
    }

    /**
     * Clean up resources on app teardown.
     */
    fun destroy() {
        scope.cancel()
        warmupModelId = null
    }
}
