package com.phonefarm.client.vlm

import android.graphics.Bitmap
import com.phonefarm.client.model.ModelManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Dual-mode inference router with automatic cloud/local fallback.
 *
 * Decision logic:
 *   [VlmMode.CLOUD]  → always use [VlmClient] (cloud).
 *   [VlmMode.LOCAL]  → always use [LocalVlmClient] (on-device).
 *   [VlmMode.AUTO]   → try local first; on failure fall back to cloud.
 *
 * When [VlmProviderConfig.fallbackMode] is set, failure in the primary
 * mode cascades to the fallback mode transparently.
 */
@Singleton
class InferenceRouter @Inject constructor(
    private val cloudClient: VlmClient,
    private val localClient: LocalVlmClient,
    private val modelManager: ModelManager,
) {

    private val _activeMode = MutableStateFlow(VlmMode.AUTO)
    val activeMode: StateFlow<VlmMode> = _activeMode.asStateFlow()

    /** Track fallback events for telemetry. */
    private var fallbackCount = 0
    private var localSuccessCount = 0
    private var cloudSuccessCount = 0

    /**
     * Route a VLM inference request to the appropriate backend.
     *
     * @param screenshot   Current device screenshot.
     * @param taskContext  User's NL task description.
     * @param memoryHints  Relevant memory facts.
     * @param config       VLM provider configuration.
     * @param history      Conversation history entries.
     * @return [VlmResponse] from whichever backend succeeded.
     */
    suspend fun route(
        screenshot: Bitmap,
        taskContext: String,
        memoryHints: String,
        config: VlmProviderConfig,
        history: List<VlmHistoryEntry>,
    ): VlmResponse {
        return when (config.mode) {
            VlmMode.CLOUD -> {
                _activeMode.value = VlmMode.CLOUD
                routeToCloud(screenshot, taskContext, memoryHints, config, history)
            }

            VlmMode.LOCAL -> {
                _activeMode.value = VlmMode.LOCAL
                routeToLocal(screenshot, taskContext, memoryHints, config, history)
            }

            VlmMode.AUTO -> {
                _activeMode.value = VlmMode.LOCAL
                try {
                    routeToLocal(screenshot, taskContext, memoryHints, config, history)
                } catch (localError: Exception) {
                    // Local inference failed — fall back to cloud
                    fallbackCount++
                    android.util.Log.w(
                        "InferenceRouter",
                        "Local inference failed, falling back to cloud: ${localError.message}"
                    )

                    // Only fall back if cloud config is available
                    val cloudConfig = config.cloudConfig
                    if (cloudConfig != null) {
                        _activeMode.value = VlmMode.CLOUD
                        try {
                            routeToCloud(screenshot, taskContext, memoryHints, config, history)
                        } catch (cloudError: Exception) {
                            _activeMode.value = VlmMode.AUTO
                            throw RuntimeException(
                                "Both local and cloud inference failed. Local: ${localError.message}, Cloud: ${cloudError.message}"
                            )
                        }
                    } else {
                        _activeMode.value = VlmMode.AUTO
                        throw RuntimeException(
                            "Local inference failed and no cloud config available: ${localError.message}"
                        )
                    }
                }
            }
        }
    }

    private suspend fun routeToCloud(
        screenshot: Bitmap,
        taskContext: String,
        memoryHints: String,
        config: VlmProviderConfig,
        history: List<VlmHistoryEntry>,
    ): VlmResponse {
        val cloudConfig = config.cloudConfig
            ?: throw IllegalArgumentException("Cloud mode selected but no cloud config provided")

        val response = cloudClient.execute(
            screenshot = screenshot,
            taskContext = taskContext,
            memoryHints = memoryHints,
            config = cloudConfig,
            history = history.takeLast(config.historyLength),
        )
        cloudSuccessCount++
        return response
    }

    private suspend fun routeToLocal(
        screenshot: Bitmap,
        taskContext: String,
        memoryHints: String,
        config: VlmProviderConfig,
        history: List<VlmHistoryEntry>,
    ): VlmResponse {
        val modelId = config.localModelId
            ?: throw IllegalArgumentException("Local mode selected but no localModelId provided")

        // Check model availability
        val modelRegistry = modelManager.installedModels.value
        val model = modelRegistry.find { it.modelId == modelId }
        if (model == null) {
            throw IllegalStateException(
                "Local model '$modelId' is not installed. Available: ${modelRegistry.map { it.modelId }}"
            )
        }
        if (model.status != "ready" && model.status != "loaded") {
            throw IllegalStateException(
                "Local model '$modelId' is not ready (status: ${model.status})"
            )
        }

        val response = localClient.execute(
            screenshot = screenshot,
            taskContext = taskContext,
            memoryHints = memoryHints,
            modelId = modelId,
        )
        localSuccessCount++
        return response
    }

    /**
     * Get routing statistics for telemetry.
     */
    fun getTelemetry(): RoutingTelemetry {
        return RoutingTelemetry(
            activeMode = _activeMode.value,
            fallbackCount = fallbackCount,
            localSuccessCount = localSuccessCount,
            cloudSuccessCount = cloudSuccessCount,
        )
    }

    /**
     * Reset all telemetry counters.
     */
    fun resetTelemetry() {
        fallbackCount = 0
        localSuccessCount = 0
        cloudSuccessCount = 0
    }
}

/**
 * Telemetry data for VLM routing decisions.
 */
data class RoutingTelemetry(
    val activeMode: VlmMode,
    val fallbackCount: Int,
    val localSuccessCount: Int,
    val cloudSuccessCount: Int,
)
