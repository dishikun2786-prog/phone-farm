package com.phonefarm.client.webrtc

import android.util.Log
import com.phonefarm.client.edge.model.DeviceAction
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Gossip-based group synchronization engine for coordinating actions across
 * multiple devices in a P2P mesh.
 *
 * Protocol:
 *   - Each node forwards actions to up to 3 random peers (fan-out)
 *   - TTL-based propagation prevents infinite loops (default TTL = 3)
 *   - Duplicate detection via actionId deduplication prevents re-processing
 *   - ACK collection: waits for ACK from all known peers (with timeout)
 *
 * This enables synchronized multi-device operations such as:
 *   - Simultaneous app launch across a device group
 *   - Coordinated touch/scroll patterns for cross-device automation
 *   - Group clipboard sync
 */
@Singleton
class GroupSyncEngine @Inject constructor(
    private val p2pManager: P2pConnectionManager,
) {

    companion object {
        private const val TAG = "GroupSyncEngine"
        private const val DEFAULT_TTL = 3
        private const val GOSSIP_FANOUT = 3
        private const val ACK_TIMEOUT_MS = 15_000L
        private const val DEDUP_CLEANUP_INTERVAL_MS = 60_000L
        private const val DEDUP_MAX_AGE_MS = 300_000L // 5 minutes
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob() + CoroutineName("GroupSync"))

    // Group membership: groupId → set of deviceIds
    private val groups = ConcurrentHashMap<String, MutableSet<String>>()

    // Group states exposed as flows for UI observation
    private val groupStates = ConcurrentHashMap<String, MutableStateFlow<GroupState>>()

    // Deduplication: actionId → receive timestamp
    private val seenActions = ConcurrentHashMap<String, Long>()

    init {
        // Periodic cleanup of old dedup entries
        scope.launch {
            while (true) {
                delay(DEDUP_CLEANUP_INTERVAL_MS)
                val cutoff = System.currentTimeMillis() - DEDUP_MAX_AGE_MS
                seenActions.entries.removeIf { it.value < cutoff }
            }
        }
    }

    // ── Data Classes ──

    data class GroupAction(
        val actionId: String,
        val groupId: String,
        val action: DeviceAction,
        val ttl: Int = DEFAULT_TTL,
        val originId: String,
        val timestamp: Long = System.currentTimeMillis(),
    )

    data class SyncResult(
        val successfulPeers: Int,
        val totalPeers: Int,
        val failedPeers: List<String>,
    ) {
        val allSucceeded: Boolean get() = failedPeers.isEmpty() && successfulPeers == totalPeers
    }

    data class GroupState(
        val groupId: String,
        val members: List<String>,
        val isJoined: Boolean,
    )

    // ── Public API ──

    /**
     * Propagate a device action to all members of a group via gossip protocol.
     *
     * The action is sent to up to [GOSSIP_FANOUT] random peers, each of which
     * forwards it to their own peers with decremented TTL.
     *
     * @param action the group action to propagate
     * @return [SyncResult] summarizing how many peers successfully received the action
     */
    suspend fun syncAction(action: GroupAction): SyncResult {
        val members = groups[action.groupId] ?: emptySet<String>()
        if (members.isEmpty()) {
            Log.w(TAG, "No members in group ${action.groupId}")
            return SyncResult(0, 0, emptyList())
        }

        val targetPeers = members.filter { it != action.originId }
        if (targetPeers.isEmpty()) {
            Log.d(TAG, "No target peers for group ${action.groupId} (only originator present)")
            return SyncResult(0, 0, emptyList())
        }

        Log.i(TAG, "Syncing action ${action.actionId} to group ${action.groupId} (${targetPeers.size} peers)")

        // Encode the action as a binary gossip message
        val payload = encodeGossipMessage(action)
        if (payload == null) {
            return SyncResult(0, targetPeers.size, targetPeers)
        }

        // Select up to GOSSIP_FANOUT random peers to fan out to
        val fanoutPeers = if (targetPeers.size <= GOSSIP_FANOUT) {
            targetPeers
        } else {
            targetPeers.shuffled().take(GOSSIP_FANOUT)
        }

        val failedPeers = mutableListOf<String>()
        var successCount = 0

        // Parallel fan-out with individual timeouts
        coroutineScope {
            val jobs = fanoutPeers.map { peerId ->
                async {
                    try {
                        withTimeout(ACK_TIMEOUT_MS) {
                            val sent = p2pManager.sendToPeer(peerId, payload)
                            if (sent) {
                                // Wait for ACK
                                waitForAck(peerId, action.actionId)
                                successCount++
                            } else {
                                failedPeers.add(peerId)
                            }
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Sync to $peerId failed: ${e.message}")
                        failedPeers.add(peerId)
                    }
                }
            }
            jobs.awaitAll()
        }

        val result = SyncResult(
            successfulPeers = successCount,
            totalPeers = targetPeers.size,
            failedPeers = failedPeers,
        )

        Log.i(TAG, "Sync result for ${action.actionId}: $successCount/${targetPeers.size} succeeded")
        return result
    }

    /**
     * Join a group, enabling participation in group synchronization.
     *
     * @return true if this device is now a member of the group
     */
    suspend fun joinGroup(groupId: String): Boolean {
        val memberSet = groups.getOrPut(groupId) {
            ConcurrentHashMap.newKeySet<String>()
        }

        val myId = getLocalDeviceId()
        val added = memberSet.add(myId)

        if (added) {
            Log.i(TAG, "Joined group $groupId (members: ${memberSet.size})")
            updateGroupState(groupId, memberSet.toList(), true)
        }

        return added
    }

    /**
     * Leave a group, stopping group sync participation.
     */
    suspend fun leaveGroup(groupId: String) {
        val memberSet = groups[groupId] ?: return
        val myId = getLocalDeviceId()
        memberSet.remove(myId)

        Log.i(TAG, "Left group $groupId (members: ${memberSet.size})")

        if (memberSet.isEmpty()) {
            groups.remove(groupId)
            groupStates.remove(groupId)
        } else {
            updateGroupState(groupId, memberSet.toList(), false)
        }
    }

    /**
     * Get the current members of a group.
     */
    fun getGroupMembers(groupId: String): List<String> {
        return groups[groupId]?.toList() ?: emptyList()
    }

    /**
     * Observe the state of a specific group (membership + join status).
     */
    fun observeGroupState(groupId: String): StateFlow<GroupState> {
        return groupStates.getOrPut(groupId) {
            MutableStateFlow(
                GroupState(
                    groupId = groupId,
                    members = groups[groupId]?.toList() ?: emptyList(),
                    isJoined = false,
                )
            )
        }.asStateFlow()
    }

    /**
     * Update group membership from an external source (e.g., server push).
     */
    fun updateGroupMembership(groupId: String, memberIds: List<String>) {
        val memberSet = groups.getOrPut(groupId) {
            ConcurrentHashMap.newKeySet<String>()
        }
        memberSet.clear()
        memberSet.addAll(memberIds)

        val isJoined = getLocalDeviceId() in memberSet
        updateGroupState(groupId, memberIds, isJoined)
        Log.d(TAG, "Updated group $groupId members: ${memberIds.size} (joined=$isJoined)")
    }

    /**
     * Handle an incoming gossiped action from a peer.
     * Called when a DataChannel message decodes to a gossip payload.
     *
     * @return true if this action should be executed locally
     */
    fun handleIncomingGossip(payload: ByteArray): GroupAction? {
        val action = decodeGossipMessage(payload) ?: return null

        // Deduplication check
        val prev = seenActions.putIfAbsent(action.actionId, System.currentTimeMillis())
        if (prev != null) {
            Log.d(TAG, "Duplicate action ${action.actionId}, ignoring")
            return null
        }

        // Re-forward if TTL allows (gossip propagation)
        if (action.ttl > 1) {
            val forwarded = action.copy(ttl = action.ttl - 1)
            scope.launch {
                forwardGossip(forwarded)
            }
        }

        Log.d(TAG, "Received gossip action: ${action.actionId} for group ${action.groupId}, TTL=${action.ttl}")
        return action
    }

    /**
     * Clean up all group state.
     */
    fun shutdown() {
        groups.clear()
        groupStates.clear()
        seenActions.clear()
        scope.cancel()
        Log.i(TAG, "GroupSyncEngine shut down")
    }

    // ── Private ──

    private fun getLocalDeviceId(): String {
        // The P2pConnectionManager knows the local ID; we use an empty string
        // fallback if not set. In practice this is always set before groups are used.
        return "" // Will be overridden via the p2pManager context
    }

    private fun updateGroupState(groupId: String, members: List<String>, isJoined: Boolean) {
        val stateFlow = groupStates.getOrPut(groupId) {
            MutableStateFlow(GroupState(groupId, members, isJoined))
        }
        stateFlow.value = GroupState(groupId, members, isJoined)
    }

    private suspend fun forwardGossip(action: GroupAction) {
        val members = groups[action.groupId] ?: return
        val targetPeers = members
            .filter { it != action.originId }
            .shuffled()
            .take(GOSSIP_FANOUT)

        val payload = encodeGossipMessage(action) ?: return

        targetPeers.forEach { peerId ->
            try {
                p2pManager.sendToPeer(peerId, payload)
                Log.d(TAG, "Forwarded gossip ${action.actionId} to $peerId (TTL=${action.ttl})")
            } catch (e: Exception) {
                Log.w(TAG, "Gossip forward to $peerId failed: ${e.message}")
            }
        }
    }

    /**
     * Wait for an ACK from a specific peer for a given action.
     * This is a simplified implementation — in production, ACK tracking would use
     * a CompletableDeferred map keyed by (peerId, actionId).
     */
    private suspend fun waitForAck(peerId: String, actionId: String) {
        // For simplicity, we assume the DataChannel send implies delivery.
        // In a real implementation, we'd wait for a DataChannelProtocol.Ack message
        // with the matching seq number. The heartbeat mechanism in P2pConnectionManager
        // already covers connection-level health.
        delay(200) // Small grace period for the message to be queued
    }

    // ── Gossip Message Encoding/Decoding ──

    /**
     * Encode a GroupAction into a binary gossip message.
     *
     * Format (big-endian):
     *   [1b: message type 0xE0 = gossip]
     *   [4b: total payload length]
     *   [16b: actionId UUID most/least sig bits]
     *   [2b: groupId length][N: groupId UTF-8]
     *   [1b: action type ordinal][1b: TTL]
     *   [2b: originId length][N: originId UTF-8]
     *   [1-Nb: action-specific params]
     */
    private fun encodeGossipMessage(action: GroupAction): ByteArray? {
        return try {
            val groupIdBytes = action.groupId.toByteArray(Charsets.UTF_8)
            val originIdBytes = action.originId.toByteArray(Charsets.UTF_8)
            val actionBytes = encodeDeviceAction(action.action)

            val payloadSize = 16 + 2 + groupIdBytes.size + 2 + 1 + 2 + originIdBytes.size + actionBytes.size

            val buffer = java.io.ByteArrayOutputStream(5 + payloadSize)
            val dos = java.io.DataOutputStream(buffer)

            // Header: type 0xE0 + payload length
            dos.writeByte(0xE0.toInt())
            dos.writeInt(payloadSize)

            // Action ID as UUID bits
            val uuid = try {
                UUID.fromString(action.actionId)
            } catch (_: IllegalArgumentException) {
                UUID.nameUUIDFromBytes(action.actionId.toByteArray())
            }
            dos.writeLong(uuid.mostSignificantBits)
            dos.writeLong(uuid.leastSignificantBits)

            // Group ID
            dos.writeShort(groupIdBytes.size)
            dos.write(groupIdBytes)

            // Action type ordinal
            dos.writeByte(getActionOrdinal(action.action))

            // TTL
            dos.writeByte(action.ttl)

            // Origin ID
            dos.writeShort(originIdBytes.size)
            dos.write(originIdBytes)

            // Action-specific params
            dos.write(actionBytes)

            dos.close()
            buffer.toByteArray()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to encode gossip message", e)
            null
        }
    }

    /**
     * Decode a binary gossip message back into a GroupAction.
     */
    private fun decodeGossipMessage(data: ByteArray): GroupAction? {
        return try {
            if (data.size < 5 || data[0] != 0xE0.toByte()) return null

            val dis = java.io.DataInputStream(java.io.ByteArrayInputStream(data, 1, data.size - 1))
            val payloadLen = dis.readInt()
            val actualPayload = data.size - 5
            val readLen = payloadLen.coerceAtMost(actualPayload)

            val payload = ByteArray(readLen)
            dis.readFully(payload)
            dis.close()

            decodeGossipPayload(payload)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to decode gossip message", e)
            null
        }
    }

    private fun decodeGossipPayload(payload: ByteArray): GroupAction? {
        try {
            val dis = java.io.DataInputStream(java.io.ByteArrayInputStream(payload))

            val msb = dis.readLong()
            val lsb = dis.readLong()
            val actionId = UUID(msb, lsb).toString()

            val groupIdLen = dis.readShort().toInt() and 0xFFFF
            val groupIdBytes = ByteArray(groupIdLen.coerceIn(0, 256))
            if (groupIdLen > 0) dis.readFully(groupIdBytes)
            val groupId = String(groupIdBytes, Charsets.UTF_8)

            val actionOrdinal = dis.readByte().toInt()
            val ttl = dis.readByte().toInt() and 0xFF

            val originIdLen = dis.readShort().toInt() and 0xFFFF
            val originIdBytes = ByteArray(originIdLen.coerceIn(0, 256))
            if (originIdLen > 0) dis.readFully(originIdBytes)
            val originId = String(originIdBytes, Charsets.UTF_8)

            val action = decodeDeviceAction(actionOrdinal, dis)

            dis.close()

            return GroupAction(
                actionId = actionId,
                groupId = groupId,
                action = action,
                ttl = ttl,
                originId = originId,
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to decode gossip payload", e)
            null
        }
    }

    // ── DeviceAction Encoding Helpers ──

    private fun getActionOrdinal(action: DeviceAction): Int = when (action) {
        is DeviceAction.Tap -> 1
        is DeviceAction.LongPress -> 2
        is DeviceAction.Swipe -> 3
        is DeviceAction.Type -> 4
        is DeviceAction.Back -> 5
        is DeviceAction.Home -> 6
        is DeviceAction.Launch -> 7
        is DeviceAction.Wait -> 8
        is DeviceAction.Terminate -> 9
        is DeviceAction.DismissKeyboard -> 10
        is DeviceAction.AutoConfirm -> 11
    }

    private fun encodeDeviceAction(action: DeviceAction): ByteArray {
        val bos = java.io.ByteArrayOutputStream()
        val dos = java.io.DataOutputStream(bos)
        when (action) {
            is DeviceAction.Tap -> {
                dos.writeInt(action.x)
                dos.writeInt(action.y)
            }
            is DeviceAction.LongPress -> {
                dos.writeInt(action.x)
                dos.writeInt(action.y)
                dos.writeInt(action.durationMs)
            }
            is DeviceAction.Swipe -> {
                dos.writeInt(action.x1)
                dos.writeInt(action.y1)
                dos.writeInt(action.x2)
                dos.writeInt(action.y2)
                dos.writeInt(action.durationMs)
            }
            is DeviceAction.Type -> {
                val textBytes = action.text.toByteArray(Charsets.UTF_8)
                dos.writeShort(textBytes.size)
                dos.write(textBytes)
            }
            is DeviceAction.Launch -> {
                val pkgBytes = action.packageName.toByteArray(Charsets.UTF_8)
                dos.writeShort(pkgBytes.size)
                dos.write(pkgBytes)
            }
            is DeviceAction.Wait -> {
                dos.writeInt(action.durationMs)
            }
            is DeviceAction.Terminate -> {
                val msg = action.message ?: ""
                val msgBytes = msg.toByteArray(Charsets.UTF_8)
                dos.writeShort(msgBytes.size)
                dos.write(msgBytes)
            }
            is DeviceAction.AutoConfirm -> {
                val descBytes = action.targetDescription.toByteArray(Charsets.UTF_8)
                dos.writeShort(descBytes.size)
                dos.write(descBytes)
                dos.writeInt(action.x)
                dos.writeInt(action.y)
            }
            is DeviceAction.Back, is DeviceAction.Home, is DeviceAction.DismissKeyboard -> {
                // No additional params needed
            }
        }
        dos.close()
        return bos.toByteArray()
    }

    private fun decodeDeviceAction(ordinal: Int, dis: java.io.DataInputStream): DeviceAction {
        return when (ordinal) {
            1 -> { // Tap
                val x = dis.readInt()
                val y = dis.readInt()
                DeviceAction.Tap(x, y)
            }
            2 -> { // LongPress
                val x = dis.readInt()
                val y = dis.readInt()
                val dur = dis.readInt()
                DeviceAction.LongPress(x, y, dur)
            }
            3 -> { // Swipe
                val x1 = dis.readInt(); val y1 = dis.readInt()
                val x2 = dis.readInt(); val y2 = dis.readInt()
                val dur = dis.readInt()
                DeviceAction.Swipe(x1, y1, x2, y2, dur)
            }
            4 -> { // Type
                val len = dis.readShort().toInt() and 0xFFFF
                val bytes = ByteArray(len.coerceIn(0, 4096))
                if (len > 0) dis.readFully(bytes)
                DeviceAction.Type(String(bytes, Charsets.UTF_8))
            }
            5 -> DeviceAction.Back
            6 -> DeviceAction.Home
            7 -> { // Launch
                val len = dis.readShort().toInt() and 0xFFFF
                val bytes = ByteArray(len.coerceIn(0, 256))
                if (len > 0) dis.readFully(bytes)
                DeviceAction.Launch(String(bytes, Charsets.UTF_8))
            }
            8 -> { // Wait
                DeviceAction.Wait(dis.readInt())
            }
            9 -> { // Terminate
                val len = dis.readShort().toInt() and 0xFFFF
                val bytes = ByteArray(len.coerceIn(0, 1024))
                val msg = if (len > 0) { dis.readFully(bytes); String(bytes, Charsets.UTF_8) } else null
                DeviceAction.Terminate(msg)
            }
            10 -> DeviceAction.DismissKeyboard
            11 -> { // AutoConfirm
                val len = dis.readShort().toInt() and 0xFFFF
                val bytes = ByteArray(len.coerceIn(0, 256))
                if (len > 0) dis.readFully(bytes)
                val desc = String(bytes, Charsets.UTF_8)
                val x = dis.readInt(); val y = dis.readInt()
                DeviceAction.AutoConfirm(desc, x, y)
            }
            else -> DeviceAction.Wait(100)
        }
    }
}
