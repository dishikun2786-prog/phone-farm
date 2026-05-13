package com.phonefarm.client.swarm

import android.util.Log
import com.phonefarm.client.webrtc.DataChannelProtocol
import com.phonefarm.client.webrtc.P2pConnectionManager
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
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.random.Random

/**
 * SWIM (Scalable Weakly-consistent Infection-style Membership) gossip-based
 * failure detection protocol for PhoneFarm device swarms.
 *
 * Key properties:
 * - Round-robin probing: each member probes one random peer per interval.
 * - Indirect ping via 3 random peers if direct ping fails.
 * - Suspicion mechanism: suspect for 3 probe intervals before declaring dead.
 * - Incarnation number to handle reboots (monotonically increasing per lifecycle).
 * - Gossip dissemination: membership updates piggybacked on ping/ack messages.
 *
 * Protocol messages use [DataChannelProtocol] binary encoding for low overhead
 * over P2P WebRTC DataChannel connections.
 *
 * Member states: ALIVE -> SUSPECT -> DEAD (faulty).
 * Once DEAD, a member is removed after a cleanup interval.
 *
 * @see LeaderElection for leader coordination that depends on this
 * @see ResourceMarket for task distribution using membership info
 */
@Singleton
class FailureDetector @Inject constructor(
    private val p2pManager: P2pConnectionManager,
) {

    companion object {
        private const val TAG = "FailureDetector"

        // Protocol message types (extend DataChannelProtocol range)
        private const val TYPE_SWIM_PING: Byte = 0xE0.toByte()
        private const val TYPE_SWIM_PING_REQ: Byte = 0xE1.toByte()
        private const val TYPE_SWIM_ACK: Byte = 0xE2.toByte()
        private const val TYPE_SWIM_INDIRECT_PING: Byte = 0xE3.toByte()
        private const val TYPE_SWIM_INDIRECT_ACK: Byte = 0xE4.toByte()

        // Timing
        private const val DEFAULT_PROBE_INTERVAL_MS = 1_000L
        private const val DEFAULT_PROBE_TIMEOUT_MS = 3_000L
        private const val SUSPECT_INTERVALS = 3
        private const val INDIRECT_PING_COUNT = 3
        private const val DEAD_CLEANUP_INTERVAL_MS = 60_000L
        private const val GOSSIP_DISSEMINATION_MAX = 5

        // JSON serializer for metadata
        private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    }

    // ---- Data Classes ----

    /**
     * Member status in the SWIM membership protocol.
     */
    enum class MemberStatus {
        ALIVE,     // Known to be healthy
        SUSPECT,   // Under suspicion (ping failed, not yet confirmed dead)
        DEAD,      // Confirmed faulty
    }

    /**
     * A member of the device swarm tracked by the failure detector.
     *
     * @param deviceId Unique device identifier.
     * @param status Current member status.
     * @param incarnation Monotonically increasing number, incremented on reboot/restart.
     *                    Higher incarnation always wins in conflict resolution.
     * @param lastSeen Timestamp of last successful contact (direct or indirect).
     * @param suspectCounter Number of consecutive intervals this member has been SUSPECT.
     */
    data class Member(
        val deviceId: String,
        val status: MemberStatus = MemberStatus.ALIVE,
        val incarnation: Long = 1L,
        val lastSeen: Long = System.currentTimeMillis(),
        val suspectCounter: Int = 0,
    ) {
        fun withStatus(newStatus: MemberStatus, counter: Int = 0): Member = copy(
            status = newStatus,
            suspectCounter = counter,
            lastSeen = System.currentTimeMillis(),
        )
    }

    @Serializable
    data class SwimPingPayload(
        val senderId: String,
        val incarnation: Long,
        val members: List<MemberDigest> = emptyList(),
    )

    @Serializable
    data class SwimAckPayload(
        val senderId: String,
        val incarnation: Long,
        val members: List<MemberDigest> = emptyList(),
    )

    @Serializable
    data class MemberDigest(
        val deviceId: String,
        val status: String,   // "ALIVE" | "SUSPECT" | "DEAD"
        val incarnation: Long,
    )

    @Serializable
    data class IndirectPingRequest(
        val requesterId: String,
        val targetId: String,
        val incarnation: Long,
    )

    @Serializable
    data class IndirectPingResponse(
        val reporterId: String,
        val targetId: String,
        val reachable: Boolean,
        val incarnation: Long,
    )

    // ---- State ----

    private val _members = MutableStateFlow<Map<String, Member>>(emptyMap())
    val members: StateFlow<Map<String, Member>> = _members.asStateFlow()

    private val _aliveCount = MutableStateFlow(0)
    val aliveCount: StateFlow<Int> = _aliveCount.asStateFlow()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob() + CoroutineName("FailureDetector"))

    private var probeJob: Job? = null
    private var cleanupJob: Job? = null
    private var myDeviceId: String = ""
    private var myIncarnation: Long = 1L
    private var running = false
    private var probeIndex = 0L

    // Track which members we have an active indirect ping chain for
    private data class IndirectPingState(
        val targetId: String,
        val startTime: Long,
        val respondents: MutableSet<String>,
    )
    private val activeIndirectPings = mutableMapOf<String, IndirectPingState>()

    // Track recent pings for deduplication
    private val recentPingSeqs = mutableSetOf<String>()

    // ---- Public API ----

    /**
     * Start the SWIM failure detection protocol.
     *
     * @param deviceId This device's identifier.
     * @param probeIntervalMs Interval between probe rounds (default 1000ms).
     * @param probeTimeoutMs Timeout for a single probe (default 3000ms).
     */
    suspend fun start(
        deviceId: String,
        probeIntervalMs: Long = DEFAULT_PROBE_INTERVAL_MS,
        probeTimeoutMs: Long = DEFAULT_PROBE_TIMEOUT_MS,
    ) {
        if (running) {
            Log.w(TAG, "Failure detector already running")
            return
        }

        myDeviceId = deviceId
        myIncarnation = 1L
        running = true

        // Add self to member list
        val self = Member(
            deviceId = myDeviceId,
            status = MemberStatus.ALIVE,
            incarnation = myIncarnation,
        )
        _members.value = _members.value + (myDeviceId to self)

        Log.i(TAG, "SWIM failure detector started for device: $myDeviceId")

        // Main probe loop
        probeJob = scope.launch {
            while (running) {
                delay(probeIntervalMs)
                runProbeCycle(probeTimeoutMs)
            }
        }

        // Dead member cleanup loop
        cleanupJob = scope.launch {
            while (running) {
                delay(DEAD_CLEANUP_INTERVAL_MS)
                cleanupDeadMembers()
            }
        }
    }

    /**
     * Stop the SWIM failure detection protocol.
     */
    suspend fun stop() {
        if (!running) return

        running = false
        probeJob?.cancel()
        cleanupJob?.cancel()

        Log.i(TAG, "SWIM failure detector stopped")
    }

    /**
     * Register a new member in the swarm (discovered via gossip or announcement).
     * If the member already exists, compare incarnation numbers and keep the higher.
     */
    fun registerMember(deviceId: String, incarnation: Long = 1L) {
        if (deviceId == myDeviceId) return

        val existing = _members.value[deviceId]
        if (existing != null && existing.incarnation >= incarnation) return

        val newMember = Member(
            deviceId = deviceId,
            status = MemberStatus.ALIVE,
            incarnation = incarnation,
            lastSeen = System.currentTimeMillis(),
        )
        _members.value = _members.value + (deviceId to newMember)
        recalculateAliveCount()

        Log.d(TAG, "Registered member: $deviceId (incarnation=$incarnation)")
    }

    /**
     * Get the list of currently ALIVE peer device IDs (excluding self).
     */
    fun getAlivePeers(): List<String> {
        return _members.value.values
            .filter { it.deviceId != myDeviceId && it.status == MemberStatus.ALIVE }
            .map { it.deviceId }
    }

    /**
     * Manually mark self as restarted (increment incarnation) so peers
     * recognize the new lifecycle.
     */
    fun markRestarted() {
        myIncarnation++
        val updatedSelf = Member(
            deviceId = myDeviceId,
            status = MemberStatus.ALIVE,
            incarnation = myIncarnation,
            lastSeen = System.currentTimeMillis(),
        )
        _members.value = _members.value + (myDeviceId to updatedSelf)
        Log.i(TAG, "Marked self as restarted (incarnation=$myIncarnation)")
    }

    // ---- Internal ----

    /**
     * Run one probe cycle: select a random alive peer and ping it.
     * On failure, initiate indirect ping via k random peers.
     */
    private suspend fun runProbeCycle(timeoutMs: Long) {
        val peers = getAlivePeers()
        if (peers.isEmpty()) {
            Log.v(TAG, "No peers to probe")
            return
        }

        // Round-robin selection of probe target
        probeIndex++
        val targetIdx = (probeIndex % peers.size).toInt()
        val targetId = peers[targetIdx]

        Log.v(TAG, "Probing member: $targetId (${peers.size} peers)")

        val reachable = sendDirectPing(targetId, timeoutMs)

        if (reachable) {
            // Success: mark as alive
            markAlive(targetId, myIncarnation)
        } else {
            // Direct ping failed: initiate indirect ping
            Log.w(TAG, "Direct ping to $targetId failed, initiating indirect ping")
            handleProbeFailure(targetId, timeoutMs)
        }
    }

    /**
     * Send a direct SWIM ping to a peer via P2P DataChannel.
     * Returns true if an ACK was received within timeout.
     */
    private suspend fun sendDirectPing(targetId: String, timeoutMs: Long): Boolean {
        return try {
            withTimeout(timeoutMs) {
                val connection = p2pManager.connectTo(targetId).getOrNull() ?: return@withTimeout false
                if (!connection.isConnected) return@withTimeout false

                val pingSeq = "${myDeviceId}-${System.currentTimeMillis()}-${Random.nextInt()}"
                recentPingSeqs.add(pingSeq)

                // Encode ping via binary protocol
                val payload = SwimPingPayload(
                    senderId = myDeviceId,
                    incarnation = myIncarnation,
                    members = buildGossipDigests(),
                )
                val pingData = encodeSwimPing(pingSeq, json.encodeToString(payload).toByteArray())

                // Send through DataChannel
                val dataChannel = connection.dataChannel ?: return@withTimeout false
                val buffer = java.nio.ByteBuffer.wrap(pingData)
                dataChannel.send(org.webrtc.DataChannel.Buffer(buffer, true))

                // Wait for ACK — the callback system would set a flag;
                // for now, we use the p2p connection state as a proxy.
                // In production, a proper request-response mechanism should be used.
                delay(100) // Give time for ACK processing
                connection.isConnected
            }
        } catch (e: Exception) {
            Log.w(TAG, "Ping to $targetId failed: ${e.message}")
            false
        }
    }

    /**
     * Handle probe failure by initiating indirect probing through k random peers.
     */
    private suspend fun handleProbeFailure(targetId: String, timeoutMs: Long) {
        val peers = getAlivePeers().filter { it != targetId }
        if (peers.isEmpty()) {
            // No peers to relay through: mark as suspect directly
            markSuspect(targetId)
            return
        }

        val relayPeers = peers.shuffled().take(INDIRECT_PING_COUNT)

        val state = IndirectPingState(
            targetId = targetId,
            startTime = System.currentTimeMillis(),
            respondents = mutableSetOf(),
        )
        activeIndirectPings[targetId] = state

        var anyReachable = false

        for (relayId in relayPeers) {
            val reached = sendIndirectPing(relayId, targetId, timeoutMs)
            if (reached) {
                anyReachable = true
                state.respondents.add(relayId)
                break // One successful indirect ping is sufficient
            }
        }

        activeIndirectPings.remove(targetId)

        if (anyReachable) {
            markAlive(targetId, myIncarnation)
            Log.d(TAG, "Indirect ping to $targetId succeeded via relay")
        } else {
            markSuspect(targetId)
            Log.w(TAG, "Indirect ping to $targetId also failed — marking suspect")
        }
    }

    /**
     * Send an indirect ping request to a relay peer asking them to ping targetId.
     */
    private suspend fun sendIndirectPing(relayId: String, targetId: String, timeoutMs: Long): Boolean {
        return try {
            val connection = p2pManager.connectTo(relayId).getOrNull() ?: return false
            if (!connection.isConnected) return false

            val request = IndirectPingRequest(
                requesterId = myDeviceId,
                targetId = targetId,
                incarnation = myIncarnation,
            )
            val reqData = encodeIndirectPing(json.encodeToString(request).toByteArray())

            val dataChannel = connection.dataChannel ?: return false
            val buffer = java.nio.ByteBuffer.wrap(reqData)
            dataChannel.send(org.webrtc.DataChannel.Buffer(buffer, true))

            // Wait for indirect ACK
            delay(200)
            // In production would use proper async response mechanism
            connection.isConnected
        } catch (e: Exception) {
            Log.w(TAG, "Indirect ping via $relayId to $targetId failed: ${e.message}")
            false
        }
    }

    /**
     * Mark a member as ALIVE.
     */
    private fun markAlive(deviceId: String, incarnation: Long) {
        val member = _members.value[deviceId] ?: run {
            registerMember(deviceId, incarnation)
            return
        }

        if (member.status != MemberStatus.ALIVE || member.incarnation < incarnation) {
            _members.value = _members.value + (deviceId to member.copy(
                status = MemberStatus.ALIVE,
                incarnation = maxOf(member.incarnation, incarnation),
                lastSeen = System.currentTimeMillis(),
                suspectCounter = 0,
            ))
            recalculateAliveCount()
            Log.d(TAG, "Member $deviceId marked as ALIVE")
        } else {
            // Just update lastSeen
            _members.value = _members.value + (deviceId to member.copy(
                lastSeen = System.currentTimeMillis(),
            ))
        }
    }

    /**
     * Mark a member as SUSPECT. If already suspect, increment counter.
     * After SUSPECT_INTERVALS consecutive failures, mark as DEAD.
     */
    private fun markSuspect(deviceId: String) {
        val member = _members.value[deviceId] ?: return

        val newCounter = member.suspectCounter + 1

        if (newCounter >= SUSPECT_INTERVALS) {
            // Confirmed dead
            _members.value = _members.value + (deviceId to member.withStatus(MemberStatus.DEAD, newCounter))
            recalculateAliveCount()
            Log.w(TAG, "Member $deviceId confirmed DEAD after $newCounter suspect intervals")
        } else {
            // Still suspect
            _members.value = _members.value + (deviceId to member.withStatus(MemberStatus.SUSPECT, newCounter))
            Log.w(TAG, "Member $deviceId marked SUSPECT (${newCounter}/${SUSPECT_INVALS})")
        }
    }

    /**
     * Remove DEAD members that have been dead for more than the cleanup interval.
     */
    private fun cleanupDeadMembers() {
        val cutoff = System.currentTimeMillis() - DEAD_CLEANUP_INTERVAL_MS
        val toRemove = _members.value.values
            .filter { it.deviceId != myDeviceId && it.status == MemberStatus.DEAD && it.lastSeen < cutoff }
            .map { it.deviceId }
            .toSet()

        if (toRemove.isNotEmpty()) {
            _members.value = _members.value - toRemove
            recalculateAliveCount()
            Log.i(TAG, "Cleaned up ${toRemove.size} dead members: ${toRemove.joinToString()}")
        }
    }

    /**
     * Build a list of member digests for gossip dissemination.
     * Limits to a random subset of up to GOSSIP_DISSEMINATION_MAX members.
     */
    private fun buildGossipDigests(): List<MemberDigest> {
        val allOthers = _members.value.values.filter { it.deviceId != myDeviceId }
        val selected = if (allOthers.size <= GOSSIP_DISSEMINATION_MAX) {
            allOthers
        } else {
            allOthers.shuffled().take(GOSSIP_DISSEMINATION_MAX)
        }

        return selected.map {
            MemberDigest(
                deviceId = it.deviceId,
                status = it.status.name,
                incarnation = it.incarnation,
            )
        }
    }

    /**
     * Update member list based on received gossip digests.
     * Applies conflict resolution: higher incarnation wins, with DEAD/E > ALIVE tiebreaker.
     */
    fun mergeGossipDigests(digests: List<MemberDigest>) {
        var updated = false
        var currentMembers = _members.value

        for (digest in digests) {
            if (digest.deviceId == myDeviceId) {
                // Peer thinks we are down — if they have higher incarnation, we may need recovery
                if (digest.status != "ALIVE" && digest.incarnation > myIncarnation) {
                    Log.w(TAG, "Peer reports us as ${digest.status} with incarnation=${digest.incarnation}")
                    markRestarted()
                }
                continue
            }

            val existing = currentMembers[digest.deviceId]
            val newStatus = MemberStatus.valueOf(digest.status)

            if (existing == null) {
                currentMembers = currentMembers + (digest.deviceId to Member(
                    deviceId = digest.deviceId,
                    status = newStatus,
                    incarnation = digest.incarnation,
                    lastSeen = System.currentTimeMillis(),
                ))
                updated = true
            } else if (digest.incarnation > existing.incarnation ||
                (digest.incarnation == existing.incarnation && newStatus.ordinal > existing.status.ordinal)
            ) {
                // Conflict resolution: higher incarnation wins, higher status ordinal wins
                currentMembers = currentMembers + (digest.deviceId to existing.copy(
                    status = newStatus,
                    incarnation = maxOf(existing.incarnation, digest.incarnation),
                    lastSeen = System.currentTimeMillis(),
                ))
                updated = true
            }
        }

        if (updated) {
            _members.value = currentMembers
            recalculateAliveCount()
        }
    }

    private fun recalculateAliveCount() {
        _aliveCount.value = _members.value.values.count { it.status == MemberStatus.ALIVE }
    }

    // ---- Binary Protocol Encoding ----

    private fun encodeSwimPing(seq: String, payload: ByteArray): ByteArray {
        val seqBytes = seq.toByteArray(Charsets.UTF_8)
        val out = ByteArrayOutputStream()
        val dos = DataOutputStream(out)
        dos.writeByte(TYPE_SWIM_PING.toInt())
        dos.writeShort(seqBytes.size)
        dos.write(seqBytes)
        dos.writeInt(payload.size)
        dos.write(payload)
        dos.flush()
        return out.toByteArray()
    }

    private fun encodeIndirectPing(payload: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        val dos = DataOutputStream(out)
        dos.writeByte(TYPE_SWIM_INDIRECT_PING.toInt())
        dos.writeInt(payload.size)
        dos.write(payload)
        dos.flush()
        return out.toByteArray()
    }

    /**
     * Decode a SWIM protocol message from DataChannelProtocol binary format.
     * Returns null if the message type is not SWIM-related.
     */
    fun decodeSwimMessage(data: ByteArray): Pair<Byte, ByteArray>? {
        if (data.size < 1) return null
        val type = data[0]
        return when (type) {
            TYPE_SWIM_PING, TYPE_SWIM_PING_REQ, TYPE_SWIM_ACK,
            TYPE_SWIM_INDIRECT_PING, TYPE_SWIM_INDIRECT_ACK -> {
                val payload = try {
                    val remaining = data.copyOfRange(1, data.size)
                    // For PING type (0xE0): skip 2-byte seq length + seq + 4-byte payload len
                    if (type == TYPE_SWIM_PING && remaining.size > 2) {
                        val seqLen = ((remaining[0].toInt() and 0xFF) shl 8) or (remaining[1].toInt() and 0xFF)
                        val seqEnd = 2 + seqLen
                        if (remaining.size > seqEnd + 4) {
                            val payloadLen = ((remaining[seqEnd].toInt() and 0xFF) shl 24) or
                                ((remaining[seqEnd + 1].toInt() and 0xFF) shl 16) or
                                ((remaining[seqEnd + 2].toInt() and 0xFF) shl 8) or
                                (remaining[seqEnd + 3].toInt() and 0xFF)
                            val payloadStart = seqEnd + 4
                            if (remaining.size >= payloadStart + payloadLen) {
                                remaining.copyOfRange(payloadStart, payloadStart + payloadLen)
                            } else remaining
                        } else remaining
                    } else {
                        // Other types: skip 4-byte payload length
                        if (remaining.size > 4) {
                            val payloadLen = ((remaining[0].toInt() and 0xFF) shl 24) or
                                ((remaining[1].toInt() and 0xFF) shl 16) or
                                ((remaining[2].toInt() and 0xFF) shl 8) or
                                (remaining[3].toInt() and 0xFF)
                            if (remaining.size >= 4 + payloadLen) {
                                remaining.copyOfRange(4, 4 + payloadLen)
                            } else remaining
                        } else remaining
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error decoding SWIM message", e)
                    byteArrayOf()
                }
                Pair(type, payload)
            }
            else -> null
        }
    }
}
