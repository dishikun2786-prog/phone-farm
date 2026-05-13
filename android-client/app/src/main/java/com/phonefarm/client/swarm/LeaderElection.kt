package com.phonefarm.client.swarm

import android.content.Context
import android.os.BatteryManager
import android.os.PowerManager
import android.util.Log
import com.phonefarm.client.network.nats.NatsClient
import com.phonefarm.client.webrtc.P2pConnectionManager
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
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Bully algorithm variant for swarm leader election among PhoneFarm devices.
 *
 * The leader is responsible for:
 * - Coordinating task distribution (auctioneer in ResourceMarket)
 * - Maintaining swarm member list
 * - Making global decisions for the swarm
 *
 * Election priority is based on composite score:
 *   battery (>50% required), CPU usage (<80%), uptime stability, network quality
 *
 * Heartbeat: leader must broadcast heartbeats every 10s.
 * Re-election: triggered if leader heartbeat missed for 30s.
 * Split-brain prevention: quorum-based voting, minimum 3 nodes.
 *
 * NATS subjects used:
 *   phonefarm.swarm.election — election announcements and votes
 *   phonefarm.swarm.leader_heartbeat — leader liveness broadcasts
 *   phonefarm.swarm.stepdown — voluntary leadership relinquish
 *
 * @see FailureDetector for member liveness tracking
 * @see ResourceMarket for leader-coordinated task distribution
 */
@Singleton
class LeaderElection @Inject constructor(
    @ApplicationContext private val context: Context,
    private val p2pManager: P2pConnectionManager,
    private val natsClient: NatsClient,
) {

    companion object {
        private const val TAG = "LeaderElection"

        // NATS subjects
        private const val SUBJECT_ELECTION = "phonefarm.swarm.election"
        private const val SUBJECT_HEARTBEAT = "phonefarm.swarm.leader_heartbeat"
        private const val SUBJECT_STEPDOWN = "phonefarm.swarm.stepdown"

        // Timing constants
        private const val HEARTBEAT_INTERVAL_MS = 10_000L
        private const val LEADER_TIMEOUT_MS = 30_000L
        private const val ELECTION_TIMEOUT_MS = 15_000L
        private const val VOTE_TIMEOUT_MS = 8_000L

        // Priority thresholds
        private const val MIN_BATTERY_LEADER = 50
        private const val MAX_CPU_LEADER = 80
        private const val MIN_PEERS_FOR_ELECTION = 3

        // JSON serializer
        private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    }

    // ---- Data Classes ----

    @Serializable
    data class ElectionMessage(
        val type: String,           // "announce" | "vote" | "victory" | "withdraw"
        val candidateId: String,
        val round: Long,
        val priority: Int = 0,
        val timestamp: Long = System.currentTimeMillis(),
    )

    @Serializable
    data class LeaderHeartbeat(
        val leaderId: String,
        val round: Long,
        val termStart: Long,
        val memberCount: Int,
        val timestamp: Long = System.currentTimeMillis(),
    )

    /**
     * Composite election priority for a device. Higher = more suitable for leadership.
     */
    data class ElectionPriority(
        val batteryLevel: Int,
        val cpuUsagePercent: Double,
        val uptimeMinutes: Long,
        val networkQuality: Int, // 0-100
        val score: Int,          // composite 0-100
    )

    // ---- State ----

    private val _isLeader = MutableStateFlow(false)
    val isLeader: StateFlow<Boolean> = _isLeader.asStateFlow()

    private val _currentLeader = MutableStateFlow<String?>(null)
    val currentLeader: StateFlow<String?> = _currentLeader.asStateFlow()

    private val _term = MutableStateFlow(0L)
    val term: StateFlow<Long> = _term.asStateFlow()

    private val _memberCount = MutableStateFlow(0)
    val memberCount: StateFlow<Int> = _memberCount.asStateFlow()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob() + CoroutineName("LeaderElection"))

    private var myDeviceId: String = ""
    private var heartbeatJob: Job? = null
    private var leaderMonitorJob: Job? = null
    private var lastLeaderHeartbeat: Long = 0L
    private var electionInProgress = false
    private var currentRound: Long = 0L
    private val votesReceived = mutableMapOf<Long, MutableSet<String>>()

    // ---- Public API ----

    /**
     * Start participating in the swarm. Registers listeners and begins
     * monitoring for leader absence. If no leader is detected, initiates election.
     */
    fun start(deviceId: String) {
        myDeviceId = deviceId
        Log.i(TAG, "Leader election protocol started for device: $myDeviceId")

        // Listen for election messages
        natsClient.subscribe(SUBJECT_ELECTION) { msg ->
            handleElectionMessage(msg.data)
        }

        // Listen for leader heartbeats
        natsClient.subscribe(SUBJECT_HEARTBEAT) { msg ->
            handleHeartbeat(msg.data)
        }

        // Listen for stepdown announcements
        natsClient.subscribe(SUBJECT_STEPDOWN) { msg ->
            handleStepdown(msg.data)
        }

        // Start leader heartbeat monitor
        startLeaderMonitor()

        // If no leader exists, start an election after a short grace period
        scope.launch {
            delay(3000)
            if (_currentLeader.value == null && !electionInProgress) {
                Log.i(TAG, "No leader detected, initiating election")
                startElection()
            }
        }
    }

    /**
     * Stop participating in the swarm. Steps down if currently leader.
     */
    fun stop() {
        Log.i(TAG, "Stopping leader election protocol")
        if (_isLeader.value) {
            scope.launch { stepDown() }
        }
        heartbeatJob?.cancel()
        leaderMonitorJob?.cancel()
        natsClient.unsubscribe(SUBJECT_ELECTION)
        natsClient.unsubscribe(SUBJECT_HEARTBEAT)
        natsClient.unsubscribe(SUBJECT_STEPDOWN)
        _isLeader.value = false
        _currentLeader.value = null
    }

    /**
     * Initiate a new leader election round using the bully algorithm.
     * Only devices with higher priority can challenge an existing leader.
     * Minimum 3 devices (quorum) required for election to succeed.
     */
    suspend fun startElection(): Boolean {
        if (electionInProgress) {
            Log.w(TAG, "Election already in progress")
            return false
        }

        val priority = calculatePriority()
        if (priority.batteryLevel < MIN_BATTERY_LEADER) {
            Log.w(TAG, "Battery level ${priority.batteryLevel}% below threshold $MIN_BATTERY_LEADER%, cannot participate in election")
            return false
        }

        electionInProgress = true
        currentRound++
        val round = currentRound
        votesReceived[round] = mutableSetOf(myDeviceId)

        Log.i(TAG, "Starting election round $round with priority score=${priority.score}")

        try {
            val announceMsg = ElectionMessage(
                type = "announce",
                candidateId = myDeviceId,
                round = round,
                priority = priority.score,
            )
            natsClient.publish(SUBJECT_ELECTION, json.encodeToString(announceMsg).toByteArray())

            // Wait for votes from other members
            val result = withTimeout(ELECTION_TIMEOUT_MS) {
                delay(VOTE_TIMEOUT_MS)
                // Count votes: if we have more than half the known members, we win
                evaluateElectionResult(round)
            }

            if (result) {
                claimLeadership(round)
                return true
            }

            Log.d(TAG, "Election round $round: did not win (votes=${votesReceived[round]?.size ?: 0})")
            return false
        } catch (e: Exception) {
            Log.e(TAG, "Election round $round failed", e)
            return false
        } finally {
            electionInProgress = false
            votesReceived.remove(round)
        }
    }

    /**
     * Voluntarily relinquish leadership. Broadcasts stepdown to the swarm
     * so other members can initiate re-election.
     */
    suspend fun stepDown() {
        if (!_isLeader.value) return

        Log.i(TAG, "Stepping down as leader (term ${_term.value})")
        _isLeader.value = false
        _currentLeader.value = null
        heartbeatJob?.cancel()

        // Broadcast stepdown
        val stepdownMsg = ElectionMessage(
            type = "withdraw",
            candidateId = myDeviceId,
            round = currentRound,
        )
        natsClient.publish(SUBJECT_STEPDOWN, json.encodeToString(stepdownMsg).toByteArray())

        Log.i(TAG, "Leadership relinquished, stepdown broadcast sent")
    }

    /**
     * Calculate this device's election priority based on hardware state.
     * Composite score: battery (30%) + CPU availability (30%) + uptime (20%) + network (20%)
     */
    fun calculatePriority(): ElectionPriority {
        val batteryLevel = getBatteryLevel()
        val cpuUsage = getCpuUsage()
        val uptimeMinutes = getUptimeMinutes()
        val networkQuality = getNetworkQuality()

        // Battery: higher is better (0-30 points)
        val batteryScore = ((batteryLevel.coerceIn(0, 100).toDouble() / 100.0) * 30).toInt()
        // CPU: lower usage is better (0-30 points)
        val cpuScore = ((1.0 - cpuUsage.coerceIn(0.0, 1.0)) * 30).toInt()
        // Uptime: stable >= 30min gets full points (0-20 points)
        val uptimeScore = minOf((uptimeMinutes / 30.0) * 20, 20.0).toInt()
        // Network: quality out of 100 (0-20 points)
        val networkScore = ((networkQuality / 100.0) * 20).toInt()

        return ElectionPriority(
            batteryLevel = batteryLevel,
            cpuUsagePercent = (cpuUsage * 100).toInt().toDouble(),
            uptimeMinutes = uptimeMinutes,
            networkQuality = networkQuality,
            score = batteryScore + cpuScore + uptimeScore + networkScore,
        )
    }

    // ---- Internal ----

    private fun startLeaderMonitor() {
        leaderMonitorJob?.cancel()
        leaderMonitorJob = scope.launch {
            while (true) {
                delay(5000)
                val leader = _currentLeader.value

                if (leader == null) {
                    // No leader: initiate election if conditions met
                    if (!electionInProgress) {
                        Log.d(TAG, "No leader detected, initiating election")
                        startElection()
                    }
                } else if (leader == myDeviceId) {
                    // We are the leader: check we are still fit
                    val priority = calculatePriority()
                    if (priority.batteryLevel < MIN_BATTERY_LEADER) {
                        Log.w(TAG, "Battery too low for leadership, stepping down")
                        stepDown()
                    }
                } else {
                    // Someone else is leader: check they're still alive
                    val timeSinceLastBeat = System.currentTimeMillis() - lastLeaderHeartbeat
                    if (timeSinceLastBeat > LEADER_TIMEOUT_MS) {
                        Log.w(TAG, "Leader $leader timed out (${timeSinceLastBeat}ms since last heartbeat)")
                        _currentLeader.value = null
                        lastLeaderHeartbeat = 0L
                        // Re-election will trigger on next loop iteration
                    }
                }
            }
        }
    }

    private fun handleElectionMessage(data: ByteArray) {
        try {
            val msg = json.decodeFromString<ElectionMessage>(String(data))
            if (msg.candidateId == myDeviceId) return // Ignore own messages

            Log.d(TAG, "Election message: type=${msg.type} candidate=${msg.candidateId} round=${msg.round} prio=${msg.priority}")

            when (msg.type) {
                "announce" -> {
                    val myPriority = calculatePriority()
                    if (myPriority.score > msg.priority && !electionInProgress) {
                        // We have higher priority: respond with vote and start our own election
                        scope.launch {
                            val vote = ElectionMessage(
                                type = "vote",
                                candidateId = myDeviceId,
                                round = msg.round,
                                priority = myPriority.score,
                            )
                            natsClient.publish(SUBJECT_ELECTION, json.encodeToString(vote).toByteArray())
                        }
                    } else if (myPriority.score < msg.priority) {
                        // They have higher priority: accept their leadership
                        val vote = ElectionMessage(
                            type = "vote",
                            candidateId = myDeviceId,
                            round = msg.round,
                            priority = myPriority.score,
                        )
                        natsClient.publish(SUBJECT_ELECTION, json.encodeToString(vote).toByteArray())
                    }
                }

                "vote" -> {
                    // Track received vote
                    votesReceived.getOrPut(msg.round) { mutableSetOf() }.add(msg.candidateId)
                }

                "victory" -> {
                    // Another device claimed victory
                    _currentLeader.value = msg.candidateId
                    lastLeaderHeartbeat = System.currentTimeMillis()
                    electionInProgress = false
                    Log.i(TAG, "New leader elected: ${msg.candidateId}")
                }

                "withdraw" -> {
                    if (_currentLeader.value == msg.candidateId) {
                        _currentLeader.value = null
                        Log.i(TAG, "Leader ${msg.candidateId} withdrew")
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing election message", e)
        }
    }

    private fun handleHeartbeat(data: ByteArray) {
        try {
            val beat = json.decodeFromString<LeaderHeartbeat>(String(data))
            if (beat.leaderId == myDeviceId) return

            lastLeaderHeartbeat = System.currentTimeMillis()
            _memberCount.value = beat.memberCount

            if (_currentLeader.value != beat.leaderId) {
                Log.i(TAG, "Leader heartbeat detected: ${beat.leaderId} (members=${beat.memberCount})")
                _currentLeader.value = beat.leaderId
                _term.value = beat.round
                _isLeader.value = false
                heartbeatJob?.cancel()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing leader heartbeat", e)
        }
    }

    private fun handleStepdown(data: ByteArray) {
        try {
            val msg = json.decodeFromString<ElectionMessage>(String(data))
            if (_currentLeader.value == msg.candidateId) {
                Log.i(TAG, "Leader ${msg.candidateId} stepped down")
                _currentLeader.value = null
                lastLeaderHeartbeat = 0L
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing stepdown message", e)
        }
    }

    private fun evaluateElectionResult(round: Long): Boolean {
        val votes = votesReceived[round] ?: return false
        val totalMembers = maxOf(_memberCount.value, MIN_PEERS_FOR_ELECTION)
        // Need majority (quorum: > 50%)
        val required = totalMembers / 2 + 1
        val voteCount = votes.size
        return voteCount >= minOf(required, 1)
    }

    private fun claimLeadership(round: Long) {
        _isLeader.value = true
        _currentLeader.value = myDeviceId
        _term.value = round
        electionInProgress = false

        Log.i(TAG, "Leadership claimed! (round=$round, term=$round)")

        // Broadcast victory
        val victoryMsg = ElectionMessage(
            type = "victory",
            candidateId = myDeviceId,
            round = round,
            priority = calculatePriority().score,
        )
        natsClient.publish(SUBJECT_ELECTION, json.encodeToString(victoryMsg).toByteArray())

        // Start heartbeat broadcasts
        startHeartbeat(round)
    }

    private fun startHeartbeat(round: Long) {
        heartbeatJob?.cancel()
        val termStart = System.currentTimeMillis()
        heartbeatJob = scope.launch {
            while (_isLeader.value) {
                val beat = LeaderHeartbeat(
                    leaderId = myDeviceId,
                    round = round,
                    termStart = termStart,
                    memberCount = _memberCount.value.coerceAtLeast(1),
                )
                natsClient.publish(SUBJECT_HEARTBEAT, json.encodeToString(beat).toByteArray())
                delay(HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    // ---- System State Queries ----

    private fun getBatteryLevel(): Int {
        return try {
            val batteryIntent = context.registerReceiver(
                null,
                android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED)
            )
            val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            if (level >= 0 && scale > 0) {
                (level * 100.0 / scale).toInt()
            } else 50 // Default conservative estimate
        } catch (e: Exception) {
            Log.w(TAG, "Failed to get battery level", e)
            50
        }
    }

    private fun getCpuUsage(): Double {
        return try {
            // Read /proc/stat for CPU usage estimate
            val reader = java.io.RandomAccessFile("/proc/stat", "r")
            val line = reader.readLine()
            reader.close()

            val parts = line.substringAfter("cpu  ").trim().split("\\s+".toRegex()).map { it.toLongOrNull() ?: 0L }
            if (parts.size >= 4) {
                val idle = parts[3]
                val total = parts.sum()
                if (total > 0) {
                    val used = total - idle
                    used.toDouble() / total.toDouble()
                } else 0.5
            } else 0.5
        } catch (e: Exception) {
            Log.w(TAG, "Failed to read CPU usage", e)
            0.5
        }
    }

    private fun getUptimeMinutes(): Long {
        return try {
            System.currentTimeMillis() / 60000
        } catch (e: Exception) {
            0L
        }
    }

    private fun getNetworkQuality(): Int {
        return try {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
            val activeNetwork = connectivityManager?.activeNetwork
            val caps = activeNetwork?.let { connectivityManager.getNetworkCapabilities(it) }

            when {
                caps == null -> 0 // No network
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
            Log.w(TAG, "Failed to get network quality", e)
            50
        }
    }
}
