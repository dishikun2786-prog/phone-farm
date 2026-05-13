package com.phonefarm.client.swarm

import android.content.Context
import android.os.BatteryManager
import android.util.Log
import com.phonefarm.client.model.LocalModelInfo
import com.phonefarm.client.model.DeviceCapability
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Auction-based distributed task allocation for the device swarm.
 *
 * The leader (determined by [LeaderElection]) acts as the auctioneer:
 * 1. Leader broadcasts task availability.
 * 2. Members submit bids with their resource availability and price.
 * 3. Leader collects bids for a configurable window (default: 5s).
 * 4. Leader selects the lowest-cost bid that satisfies requirements.
 * 5. Leader assigns task to the winning bidder.
 *
 * Fallback: if no leader exists, tasks are distributed via round-robin
 * among available members.
 *
 * Pricing function considers:
 * - CPU available: more available = lower price
 * - RAM free: more free = lower price
 * - Battery level: higher = lower price (less risk of failure)
 * - Model cache hits: cached models = lower price (no download needed)
 * - Historical reliability score: higher reputation = slightly lower price
 *
 * Reputation system:
 * - Successful completions: increase reputation
 * - Failures: decrease reputation
 * - Starts at 0.5, converges toward actual reliability over time
 */
@Singleton
class ResourceMarket @Inject constructor(
    @ApplicationContext private val context: Context,
    private val leaderElection: LeaderElection,
    private val failureDetector: FailureDetector,
) {

    companion object {
        private const val TAG = "ResourceMarket"

        // Default bidding window (milliseconds)
        private const val DEFAULT_BID_WINDOW_MS = 5_000L

        // Reputation parameters
        private const val DEFAULT_REPUTATION = 0.5
        private const val REPUTATION_ALPHA = 0.1 // Smoothing factor for EMA
        private const val REPUTATION_SUCCESS_REWARD = 0.05
        private const val REPUTATION_FAILURE_PENALTY = 0.10

        // Pricing weights
        private const val WEIGHT_CPU = 0.25
        private const val WEIGHT_RAM = 0.25
        private const val WEIGHT_BATTERY = 0.20
        private const val WEIGHT_MODEL_CACHE = 0.15
        private const val WEIGHT_REPUTATION = 0.15

        // JSON
        private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    }

    // ---- Data Classes ----

    @Serializable
    data class MarketTask(
        val taskId: String,
        val scriptName: String,
        val requirements: ResourceRequirements,
        val reward: Double,
        val auctionRound: Long = 0L,
        val timestamp: Long = System.currentTimeMillis(),
    )

    @Serializable
    data class ResourceRequirements(
        val minRamMb: Int = 512,
        val minCpuCores: Int = 1,
        val requiredModels: List<String> = emptyList(),
        val minBatteryPercent: Int = 20,
        val estimatedDurationSeconds: Long = 60,
    )

    @Serializable
    data class Bid(
        val deviceId: String,
        val price: Double,
        val estimatedDuration: Long,
        val availableResources: DeviceResources,
        val reputation: Double = DEFAULT_REPUTATION,
        val timestamp: Long = System.currentTimeMillis(),
    )

    @Serializable
    data class DeviceResources(
        val cpuCores: Int,
        val cpuAvailablePercent: Double,
        val ramTotalMb: Int,
        val ramFreeMb: Int,
        val batteryLevel: Int,
        val cachedModels: List<String>,
        val networkQuality: Int,
    )

    @Serializable
    data class BidResult(
        val accepted: Boolean,
        val assignedTo: String?,
        val reason: String,
        val winningPrice: Double = 0.0,
    )

    // ---- State ----

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob() + CoroutineName("ResourceMarket"))

    private val _reputation = MutableStateFlow<Map<String, Double>>(emptyMap())
    val reputation: StateFlow<Map<String, Double>> = _reputation.asStateFlow()

    private val myDeviceId get() = leaderElection.myDeviceId

    // Active auctions: auctionRound -> bid collection
    private data class ActiveAuction(
        val task: MarketTask,
        val startTime: Long,
        val bids: MutableList<Bid>,
    )
    private val activeAuctions = ConcurrentHashMap<Long, ActiveAuction>()

    // Task assignment history for reputation tracking
    private val taskAssignments = ConcurrentHashMap<String, Bid>()
    private val auctionRoundCounter = AtomicLong(0)

    // Cached device models list (updated periodically)
    private val cachedModels = MutableStateFlow<List<String>>(emptyList())

    // ---- Public API ----

    /**
     * Submit a bid to participate in a task auction.
     * Called by worker devices when they receive a task broadcast from the leader.
     *
     * @param task The task to bid on
     * @return BidResult indicating if your bid was accepted
     */
    suspend fun submitBid(task: MarketTask): BidResult {
        val resources = collectDeviceResources()
        val myRep = _reputation.value[myDeviceId] ?: DEFAULT_REPUTATION

        // Check if we meet minimum requirements
        val reason = checkCapability(task.requirements, resources)
        if (reason != null) {
            return BidResult(
                accepted = false,
                assignedTo = null,
                reason = reason,
            )
        }

        // Calculate bid price
        val price = calculatePrice(resources, task.requirements, myRep)

        val bid = Bid(
            deviceId = myDeviceId,
            price = price,
            estimatedDuration = task.requirements.estimatedDurationSeconds * 1000,
            availableResources = resources,
            reputation = myRep,
        )

        Log.d(TAG, "Submitting bid for task ${task.taskId}: price=$price, cpuFree=${resources.cpuAvailablePercent}")

        // In current architecture, bids are published via NATS or collected
        // by the leader through the auction lifecycle.
        // When this device IS the leader, bids are collected internally.
        // When NOT the leader, bids are published for the leader to collect.

        if (leaderElection.isLeader.value) {
            // Leader self-bids — collected internally
            val auction = activeAuctions[task.auctionRound]
            auction?.bids?.add(bid)
            return BidResult(
                accepted = false,
                assignedTo = null,
                reason = "Awaiting auction conclusion",
            )
        }

        // Non-leader: bid is published — result is determined by leader response
        // In production this would be sent through NATS or P2P
        return BidResult(
            accepted = false,
            assignedTo = null,
            reason = "Bid submitted, awaiting leader decision",
        )
    }

    /**
     * Leader: Request bids from all swarm members for a given task.
     * Collects bids for the configured window, then selects the winner.
     *
     * @param task The task to auction
     * @return List of bids received
     */
    suspend fun requestBids(task: MarketTask): List<Bid> {
        val round = auctionRoundCounter.incrementAndGet()
        val auctionTask = task.copy(auctionRound = round)

        val auction = ActiveAuction(
            task = auctionTask,
            startTime = System.currentTimeMillis(),
            bids = mutableListOf(),
        )
        activeAuctions[round] = auction

        Log.i(TAG, "Auction started: round=$round task=${task.taskId} script=${task.scriptName}")

        // Broadcast task to all alive members
        broadcastTask(auctionTask)

        // Wait for bidding window
        delay(DEFAULT_BID_WINDOW_MS)

        val bids = auction.bids.toList()
        activeAuctions.remove(round)

        Log.i(TAG, "Auction round $round concluded: ${bids.size} bids received")

        return bids.sortedBy { it.price }
    }

    /**
     * Leader: Accept a winning bid and assign the task to the winner.
     *
     * @param bid The winning bid
     * @return true if assignment was accepted
     */
    suspend fun acceptBid(bid: Bid): Boolean {
        val currentRep = _reputation.value.toMutableMap()
        val deviceRep = currentRep[bid.deviceId] ?: DEFAULT_REPUTATION
        currentRep[bid.deviceId] = deviceRep
        _reputation.value = currentRep

        taskAssignments[bid.deviceId] = bid

        Log.i(TAG, "Task assigned to ${bid.deviceId} at price=${bid.price} (reputation=${"%.2f".format(deviceRep)})")

        return true
    }

    /**
     * Run a complete auction cycle: request bids, select winner, assign task.
     * Returns the winning bid or null if no valid bids.
     */
    suspend fun runAuction(task: MarketTask): Bid? {
        val bids = requestBids(task)

        if (bids.isEmpty()) {
            Log.w(TAG, "No bids received for task ${task.taskId}")
            return null
        }

        // Filter valid bids that meet requirements
        val validBids = bids.filter { bid ->
            checkCapability(task.requirements, bid.availableResources) == null
        }

        if (validBids.isEmpty()) {
            Log.w(TAG, "No valid bids meeting requirements for task ${task.taskId}")
            return null
        }

        // Select lowest price — prioritize VFM
        val winningBid = validBids.first()

        acceptBid(winningBid)

        Log.i(TAG, "Auction complete: winner=${winningBid.deviceId} price=${winningBid.price}")
        return winningBid
    }

    /**
     * Report the outcome of a task execution to update reputations.
     *
     * @param deviceId The device that executed the task
     * @param success Whether the task completed successfully
     */
    fun reportExecutionResult(deviceId: String, success: Boolean) {
        val currentRep = _reputation.value.toMutableMap()
        val oldRep = currentRep[deviceId] ?: DEFAULT_REPUTATION

        val delta = if (success) REPUTATION_SUCCESS_REWARD else -REPUTATION_FAILURE_PENALTY
        val newRep = (oldRep + REPUTATION_ALPHA * delta).coerceIn(0.0, 1.0)

        currentRep[deviceId] = newRep
        _reputation.value = currentRep

        Log.d(TAG, "Reputation updated: $deviceId ${"%.2f".format(oldRep)} -> ${"%.2f".format(newRep)} (${if (success) "success" else "failure"})")
    }

    /**
     * Fallback: distribute a task via round-robin when no leader is available.
     * Simple and deterministic — ensures task progress even during leader election.
     *
     * @param task The task to distribute
     * @return The device ID selected for this task
     */
    fun roundRobinDistribute(task: MarketTask): String? {
        val alivePeers = failureDetector.getAlivePeers()
        if (alivePeers.isEmpty()) {
            Log.w(TAG, "No alive peers for round-robin distribution")
            return null
        }

        // Simple round-robin based on task hash
        val index = kotlin.math.abs(task.taskId.hashCode()) % alivePeers.size
        val selected = alivePeers[index]

        Log.d(TAG, "Round-robin: task ${task.taskId} assigned to $selected (${alivePeers.size} peers)")

        return selected
    }

    /**
     * Calculate bid price for a task based on current device resources.
     *
     * Price is inversely proportional to available resources:
     * more resources = lower price = more competitive bid.
     * Price is normalized to 0.0-1.0 range representing relative cost.
     */
    fun calculatePrice(
        resources: DeviceResources,
        requirements: ResourceRequirements,
        reputation: Double,
    ): Double {
        // CPU factor: more available CPU = cheaper
        val cpuFactor = 1.0 - resources.cpuAvailablePercent.coerceIn(0.0, 1.0)

        // RAM factor: more free RAM = cheaper
        val ramFreeRatio = if (resources.ramTotalMb > 0) {
            resources.ramFreeMb.toDouble() / resources.ramTotalMb.toDouble()
        } else 0.0

        // Cache hit bonus: if we already have the required models, price is lower
        val requiredModels = requirements.requiredModels.toSet()
        val cachedModelHits = if (requiredModels.isEmpty()) {
            0
        } else {
            val hits = resources.cachedModels.count { it in requiredModels }
            hits.toDouble() / requiredModels.size.toDouble()
        }

        // Battery factor: more battery = cheaper (less risk of mid-task shutdown)
        val batteryFactor = 1.0 - (resources.batteryLevel.toDouble() / 100.0).coerceIn(0.0, 1.0)

        // Reputation factor: high reputation = slightly more expensive
        // (value-add makes them worth more, but still competitive)
        val repFactor = 1.0 - (reputation * 0.5) // reputation only affects 50% of price

        // Network quality: better network = slightly cheaper
        val networkFactor = resources.networkQuality.coerceIn(0, 100) / 100.0

        // Weighted composite price
        val composite = (WEIGHT_CPU * cpuFactor) +
            (WEIGHT_RAM * (1.0 - ramFreeRatio)) +
            (WEIGHT_BATTERY * batteryFactor) +
            (WEIGHT_MODEL_CACHE * (1.0 - cachedModelHits)) +
            (WEIGHT_REPUTATION * repFactor)

        // Normalize to 0.0-10.0 range (resource cost units)
        // Scale based on task reward for market efficiency
        val basePrice = (composite * 10.0).coerceIn(0.1, 9.9)

        // Round to 2 decimal places
        return kotlin.math.round(basePrice * 100.0) / 100.0
    }

    /**
     * Check if a device can handle the task requirements.
     * Returns null if capable, or a reason string if not.
     */
    fun checkCapability(requirements: ResourceRequirements, resources: DeviceResources): String? {
        if (resources.ramFreeMb < requirements.minRamMb) {
            return "Insufficient RAM: ${resources.ramFreeMb}MB < ${requirements.minRamMb}MB required"
        }
        if (resources.cpuCores < requirements.minCpuCores) {
            return "Insufficient CPU cores: ${resources.cpuCores} < ${requirements.minCpuCores} required"
        }
        if (resources.batteryLevel < requirements.minBatteryPercent) {
            return "Battery too low: ${resources.batteryLevel}% < ${requirements.minBatteryPercent}% required"
        }
        return null // Capable
    }

    /**
     * Collect current device resource state.
     */
    fun collectDeviceResources(): DeviceResources {
        val cpuCores = Runtime.getRuntime().availableProcessors()
        val cpuUsage = getCpuUsagePercent()
        val ramTotal = getTotalRamMb()
        val ramFree = getFreeRamMb()
        val batteryLevel = getBatteryLevel()
        val networkQuality = getNetworkQuality()

        return DeviceResources(
            cpuCores = cpuCores,
            cpuAvailablePercent = 1.0 - cpuUsage,
            ramTotalMb = ramTotal,
            ramFreeMb = ramFree,
            batteryLevel = batteryLevel,
            cachedModels = cachedModels.value,
            networkQuality = networkQuality,
        )
    }

    // ---- Internal ----

    private fun broadcastTask(task: MarketTask) {
        // In production, this would be broadcast via NATS or P2P
        val taskJson = json.encodeToString(task)
        Log.d(TAG, "Broadcasting task: ${task.taskId} (${taskJson.length} bytes)")
        // natsClient.publish("phonefarm.swarm.auction", taskJson.toByteArray())
    }

    /**
     * Set the cached models available on this device.
     */
    fun updateCachedModels(models: List<String>) {
        cachedModels.value = models
    }

    // ---- System State Queries ----

    private fun getCpuUsagePercent(): Double {
        return try {
            val reader = java.io.RandomAccessFile("/proc/stat", "r")
            val line = reader.readLine()
            reader.close()
            val parts = line.substringAfter("cpu  ").trim().split("\\s+".toRegex()).map { it.toLongOrNull() ?: 0L }
            if (parts.size >= 4) {
                val idle = parts[3]
                val total = parts.sum()
                if (total > 0) (total - idle).toDouble() / total.toDouble() else 0.5
            } else 0.5
        } catch (e: Exception) {
            0.5
        }
    }

    private fun getTotalRamMb(): Int {
        return try {
            val memInfo = android.app.ActivityManager.MemoryInfo()
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            activityManager.getMemoryInfo(memInfo)
            (memInfo.totalMem / (1024 * 1024)).toInt()
        } catch (e: Exception) {
            2048 // Default conservative estimate
        }
    }

    private fun getFreeRamMb(): Int {
        return try {
            val memInfo = android.app.ActivityManager.MemoryInfo()
            val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            activityManager.getMemoryInfo(memInfo)
            (memInfo.availMem / (1024 * 1024)).toInt()
        } catch (e: Exception) {
            512
        }
    }

    private fun getBatteryLevel(): Int {
        return try {
            val batteryIntent = context.registerReceiver(
                null,
                android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED)
            )
            val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level >= 0 && scale > 0) (level * 100 / scale) else 50
        } catch (e: Exception) {
            50
        }
    }

    private fun getNetworkQuality(): Int {
        return try {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
            val activeNetwork = connectivityManager?.activeNetwork
            val caps = activeNetwork?.let { connectivityManager.getNetworkCapabilities(it) }
            when {
                caps == null -> 0
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) -> 90
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET) -> 95
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                    if (caps.linkDownstreamBandwidthKbps >= 50_000) 80
                    else if (caps.linkDownstreamBandwidthKbps >= 10_000) 60
                    else 40
                }
                else -> 50
            }
        } catch (e: Exception) {
            50
        }
    }
}
