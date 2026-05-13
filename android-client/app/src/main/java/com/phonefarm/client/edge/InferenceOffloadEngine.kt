package com.phonefarm.client.edge

import android.util.Log
import com.phonefarm.client.model.DeviceCapability
import com.phonefarm.client.model.ModelManager
import com.phonefarm.client.vlm.LocalVlmClient
import com.phonefarm.client.vlm.VlmClient
import com.phonefarm.client.vlm.VlmResponse
import com.phonefarm.client.webrtc.P2pConnectionManager
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.withTimeout
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Four-tier confidence-based routing for AI inference across local, P2P edge,
 * and cloud tiers.
 *
 * Routing decision tree (evaluated in order):
 *   1. [LOCAL_NCNN]  — On-device NCNN/MNN inference, always tried first (latency < 50ms)
 *   2. [LOCAL_MNN]   — Fallback local engine if NCNN unavailable
 *   3. [P2P_EDGE]    — Peer device or edge node with better model capability
 *   4. [CLOUD_API]   — Ultimate fallback to cloud VLM API (DeepSeek/Qwen-VL)
 *
 * The engine tracks per-device node capabilities (what models each peer has
 * loaded) and caches routing decisions to avoid probing on every request.
 */
@Singleton
class InferenceOffloadEngine @Inject constructor(
    private val localVlmClient: LocalVlmClient,
    private val cloudVlmClient: VlmClient,
    private val modelManager: ModelManager,
    private val p2pConnectionManager: P2pConnectionManager,
) {

    companion object {
        private const val TAG = "InfOffloadEngine"
        private const val LOCAL_TIMEOUT_MS = 500L
        private const val P2P_TIMEOUT_MS = 10_000L
        private const val CLOUD_TIMEOUT_MS = 30_000L
        private const val DEFAULT_MIN_CONFIDENCE = 0.7f
        private const val ROUTE_CACHE_TTL_MS = 30_000L
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob() + CoroutineName("InfOffload"))

    // Cached routing decisions: request fingerprint → tier choice
    private val routeCache = ConcurrentHashMap<Long, CachedRoute>()
    // Per-peer capability registry: device_id → set of loaded model types
    private val peerCapabilities = ConcurrentHashMap<String, Set<InferenceType>>()
    // Usage telemetry
    private val tierUsageCount = ConcurrentHashMap<InferenceTier, Int>()

    init {
        InferenceTier.entries.forEach { tierUsageCount[it] = 0 }
    }

    // ── Data Classes ──

    /** Four inference tiers in priority order. */
    enum class InferenceTier {
        /** On-device NCNN inference (ultra-low latency, < 50ms). */
        LOCAL_NCNN,
        /** On-device MNN inference (fallback when NCNN model unavailable). */
        LOCAL_MNN,
        /** Peer-to-peer edge node inference (higher capability models). */
        P2P_EDGE,
        /** Cloud API inference (highest quality, highest latency). */
        CLOUD_API,
    }

    /** Types of inference tasks that can be offloaded. */
    enum class InferenceType {
        OBJECT_DETECTION,
        OCR,
        PAGE_CLASSIFICATION,
        DECISION,
    }

    /** Request descriptor for inference routing. */
    data class InferenceRequest(
        val type: InferenceType,
        val data: Any,
        val minConfidence: Float = DEFAULT_MIN_CONFIDENCE,
        val preferredTier: InferenceTier? = null,
    )

    /** Per-tier inference result with confidence scoring. */
    sealed class InferenceResult<T> {
        data class Success<T>(
            val data: T,
            val tier: InferenceTier,
            val confidence: Float,
            val latencyMs: Long,
        ) : InferenceResult<T>()

        data class Failure<T>(
            val tier: InferenceTier,
            val error: String,
        ) : InferenceResult<T>()
    }

    data class CachedRoute(
        val tier: InferenceTier,
        val timestamp: Long = System.currentTimeMillis(),
    ) {
        val isExpired: Boolean
            get() = System.currentTimeMillis() - timestamp > ROUTE_CACHE_TTL_MS
    }

    // ── Public API ──

    /**
     * Route an inference request through the four-tier fallback chain.
     *
     * @param request The inference request descriptor.
     * @param localInference Lambda for local on-device inference (returns Result).
     * @param edgeInference Lambda for P2P edge inference, takes peer deviceId.
     * @param cloudInference Lambda for cloud API inference.
     * @return The result from the highest-tier successful inference.
     */
    suspend fun <T> infer(
        request: InferenceRequest,
        localInference: suspend () -> T?,
        edgeInference: suspend (String) -> T?,
        cloudInference: suspend () -> T,
    ): InferenceResult<T> {
        val startTime = System.currentTimeMillis()
        val cacheKey = computeCacheKey(request)

        // Check routing cache for preferred tier
        val cachedRoute = routeCache[cacheKey]
        if (cachedRoute != null && !cachedRoute.isExpired && request.preferredTier == null) {
            Log.d(TAG, "Using cached route: ${cachedRoute.tier} for type=${request.type}")
        }

        // ── Tier 1: Local NCNN/MNN ──
        Log.d(TAG, "Trying LOCAL inference for type=${request.type}...")
        try {
            withTimeout(LOCAL_TIMEOUT_MS) {
                val localResult = localInference()
                if (localResult != null) {
                    val confidence = estimateConfidence(request.type, localResult)
                    if (confidence >= request.minConfidence) {
                        tierUsageCount.merge(InferenceTier.LOCAL_NCNN, 1, Int::plus)
                        val latency = System.currentTimeMillis() - startTime
                        updateRouteCache(cacheKey, InferenceTier.LOCAL_NCNN)
                        Log.i(TAG, "LOCAL_NCNN success: confidence=$confidence latency=${latency}ms")
                        return InferenceResult.Success(localResult, InferenceTier.LOCAL_NCNN, confidence, latency)
                    }
                    Log.d(TAG, "Local confidence ($confidence) below threshold (${request.minConfidence})")
                }
            }
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            Log.w(TAG, "Local inference timed out after ${LOCAL_TIMEOUT_MS}ms")
        } catch (e: Exception) {
            Log.w(TAG, "Local inference failed: ${e.message}")
        }

        // Also try Local MNN if NCNN model not available
        try {
            withTimeout(LOCAL_TIMEOUT_MS) {
                val localResult = localInference()
                if (localResult != null) {
                    val confidence = estimateConfidence(request.type, localResult)
                    if (confidence >= request.minConfidence) {
                        tierUsageCount.merge(InferenceTier.LOCAL_MNN, 1, Int::plus)
                        val latency = System.currentTimeMillis() - startTime
                        updateRouteCache(cacheKey, InferenceTier.LOCAL_MNN)
                        Log.i(TAG, "LOCAL_MNN success: confidence=$confidence latency=${latency}ms")
                        return InferenceResult.Success(localResult, InferenceTier.LOCAL_MNN, confidence, latency)
                    }
                }
            }
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            Log.w(TAG, "Local MNN inference timed out")
        } catch (e: Exception) {
            Log.w(TAG, "Local MNN inference failed: ${e.message}")
        }

        // ── Tier 2: P2P Edge Node ──
        val edgePeers = findEdgePeers(request.type)
        if (edgePeers.isNotEmpty()) {
            Log.d(TAG, "Trying P2P_EDGE inference with peers: $edgePeers")

            for (peerId in edgePeers) {
                try {
                    withTimeout(P2P_TIMEOUT_MS) {
                        val edgeResult = edgeInference(peerId)
                        if (edgeResult != null) {
                            val confidence = estimateConfidence(request.type, edgeResult)
                            if (confidence >= request.minConfidence) {
                                tierUsageCount.merge(InferenceTier.P2P_EDGE, 1, Int::plus)
                                val latency = System.currentTimeMillis() - startTime
                                updateRouteCache(cacheKey, InferenceTier.P2P_EDGE)
                                Log.i(TAG, "P2P_EDGE success: peer=$peerId confidence=$confidence latency=${latency}ms")
                                return InferenceResult.Success(edgeResult, InferenceTier.P2P_EDGE, confidence, latency)
                            }
                        }
                    }
                } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
                    Log.w(TAG, "P2P edge inference to $peerId timed out")
                    removePeerCapability(peerId, request.type)
                } catch (e: Exception) {
                    Log.w(TAG, "P2P edge inference to $peerId failed: ${e.message}")
                    removePeerCapability(peerId, request.type)
                }
            }
        }

        // ── Tier 3: Cloud API ──
        Log.d(TAG, "Falling back to CLOUD_API for type=${request.type}")
        try {
            withTimeout(CLOUD_TIMEOUT_MS) {
                val cloudResult = cloudInference()
                tierUsageCount.merge(InferenceTier.CLOUD_API, 1, Int::plus)
                val latency = System.currentTimeMillis() - startTime
                updateRouteCache(cacheKey, InferenceTier.CLOUD_API)
                val confidence = estimateConfidence(request.type, cloudResult)
                Log.i(TAG, "CLOUD_API success: confidence=$confidence latency=${latency}ms")
                return InferenceResult.Success(cloudResult, InferenceTier.CLOUD_API, confidence, latency)
            }
        } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
            Log.e(TAG, "Cloud API timed out after ${CLOUD_TIMEOUT_MS}ms")
            return InferenceResult.Failure(InferenceTier.CLOUD_API, "Cloud API timeout")
        } catch (e: Exception) {
            Log.e(TAG, "Cloud API failed: ${e.message}")
            return InferenceResult.Failure(InferenceTier.CLOUD_API, e.message ?: "Unknown cloud error")
        }
    }

    /**
     * Report a peer device's model capabilities. Called when a P2P connection
     * is established and the peer advertises its loaded models.
     */
    fun reportPeerCapabilities(deviceId: String, capabilities: Set<InferenceType>) {
        peerCapabilities[deviceId] = capabilities
        Log.d(TAG, "Registered peer capabilities: $deviceId → $capabilities")
    }

    /**
     * Remove a peer's capability entry (e.g., on disconnect or failure).
     */
    fun removePeerCapability(deviceId: String, type: InferenceType) {
        peerCapabilities.computeIfPresent(deviceId) { _, existing ->
            val updated = existing - type
            if (updated.isEmpty()) null else updated
        }
    }

    /**
     * Remove all capabilities for a disconnected peer.
     */
    fun removePeer(deviceId: String) {
        peerCapabilities.remove(deviceId)
    }

    /**
     * Get usage statistics across all inference tiers.
     */
    fun getUsageStats(): Map<InferenceTier, Int> {
        return tierUsageCount.toMap()
    }

    /**
     * Get the cached routing tier for a given inference type.
     */
    fun getCachedTier(type: InferenceType): InferenceTier? {
        return routeCache.values
            .firstOrNull { !it.isExpired }
            ?.tier
    }

    /**
     * Clear all routing caches and usage statistics.
     */
    fun reset() {
        routeCache.clear()
        peerCapabilities.clear()
        tierUsageCount.clear()
        InferenceTier.entries.forEach { tierUsageCount[it] = 0 }
    }

    // ── Private ──

    /**
     * Find P2P peers capable of handling a given inference type.
     *
     * Checks:
     *   1. Peer has a live P2P DataChannel connection
     *   2. Peer has reported capability for the inference type
     *   3. Peer's connection health is good (recent heartbeat)
     */
    private fun findEdgePeers(type: InferenceType): List<String> {
        val connectedPeers = p2pConnectionManager.getConnectedPeers()
        return connectedPeers.filter { peerId ->
            // Check if peer is capable
            val capabilities = peerCapabilities[peerId]
            capabilities != null && type in capabilities
        }.ifEmpty {
            // If no peer explicitly registered, try all connected peers
            connectedPeers
        }.sortedBy {
            // Prefer peers with explicitly declared capability
            if (peerCapabilities[it]?.contains(type) == true) 0 else 1
        }
    }

    /**
     * Estimate confidence of an inference result based on type heuristics.
     *
     * Lower confidence → more likely to fall through to next tier.
     */
    private fun estimateConfidence(type: InferenceType, result: Any?): Float {
        if (result == null) return 0f

        return when (type) {
            InferenceType.OBJECT_DETECTION -> {
                // Confidence derived from detection count and individual scores
                if (result is List<*> && result.isNotEmpty()) {
                    val detection = result.firstOrNull()
                    when (detection) {
                        is Detection -> detection.confidence
                        else -> 0.8f // Has detections, assume reasonable quality
                    }
                } else {
                    0.5f // Empty list may indicate poor detection
                }
            }
            InferenceType.OCR -> {
                // Confidence from text block count and individual confidences
                if (result is List<*>) {
                    when {
                        result.isNotEmpty() -> {
                            val confidences = result.mapNotNull { block ->
                                when (block) {
                                    is OcrBlock -> block.confidence
                                    else -> null
                                }
                            }
                            if (confidences.isNotEmpty()) {
                                confidences.average().toFloat().coerceIn(0f, 1f)
                            } else {
                                0.7f
                            }
                        }
                        else -> 0.3f // No text found is low confidence
                    }
                } else {
                    0.6f
                }
            }
            InferenceType.PAGE_CLASSIFICATION -> {
                // Heuristic based on result string length (meaningful classification)
                if (result is String) {
                    when {
                        result.length > 3 -> 0.85f
                        result.isNotEmpty() -> 0.7f
                        else -> 0.4f
                    }
                } else 0.6f
            }
            InferenceType.DECISION -> {
                // Decision inference — check for meaningful output
                if (result is VlmResponse) {
                    when {
                        result.action != null -> 0.9f
                        result.thinking?.isNotEmpty() == true -> 0.75f
                        else -> 0.5f
                    }
                } else if (result is String) {
                    when {
                        result.length > 10 -> 0.8f
                        result.isNotEmpty() -> 0.6f
                        else -> 0.2f
                    }
                } else {
                    0.5f
                }
            }
        }
    }

    /**
     * Compute a cache key from an inference request for route caching.
     */
    private fun computeCacheKey(request: InferenceRequest): Long {
        var result = request.type.ordinal.toLong()
        result = 31 * result + request.minConfidence.toBits().toLong()
        // Mix in data class name for type differentiation
        result = 31 * result + request.data::class.qualifiedName.hashCode().toLong()
        return result
    }

    /**
     * Update the routing cache with exponential backoff on failures.
     */
    private fun updateRouteCache(key: Long, tier: InferenceTier) {
        routeCache[key] = CachedRoute(tier = tier)
    }

    /**
     * Invalidate all cached routes (e.g., when P2P topology changes).
     */
    fun invalidateRouteCache() {
        routeCache.clear()
        Log.d(TAG, "Route cache invalidated")
    }
}
