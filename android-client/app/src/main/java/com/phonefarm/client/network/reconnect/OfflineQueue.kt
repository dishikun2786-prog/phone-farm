package com.phonefarm.client.network.reconnect

import android.util.Log
import com.phonefarm.client.data.local.AppDatabase
import com.phonefarm.client.data.local.entity.OfflineMessageEntity
import com.phonefarm.client.network.WebSocketMessage
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Room-backed offline message queue for WebSocket messages.
 *
 * When the device is offline or the WebSocket is disconnected, outbound messages
 * are serialized and persisted to Room. When connectivity is restored, they are
 * drained in FIFO order (sorted by priority, then queuedAt) and replayed.
 *
 * Heartbeat messages are deduplicated during drain: only the most recent heartbeat
 * is replayed, since intermediate heartbeats are stale.
 *
 * The queue is automatically trimmed to 500 entries to prevent unbounded growth.
 */
@Singleton
class OfflineQueue @Inject constructor(
    private val db: AppDatabase,
) {

    private val offlineMessageDao get() = db.offlineMessageDao()
    private val json = Json { ignoreUnknownKeys = true }

    private val mutex = Mutex()

    companion object {
        private const val MAX_QUEUE_SIZE = 500
        private const val HEARTBEAT_TYPE = "heartbeat"
    }

    /**
     * Persist a WebSocket message to the offline queue.
     * Serializes the message to JSON and inserts it with the given priority (0-3, 0 = highest).
     */
    suspend fun enqueue(message: WebSocketMessage, priority: Int = 1) {
        mutex.withLock {
            val payload = try {
                json.encodeToString(WebSocketMessage.serializer(), message)
            } catch (e: Exception) {
                Log.e("OfflineQueue", "Failed to serialize message type=${message.type}: ${e.message}")
                return
            }

            val entity = OfflineMessageEntity(
                messageType = message.type,
                payload = payload,
                priority = priority.coerceIn(0, 3),
                queuedAt = System.currentTimeMillis(),
                retryCount = 0,
            )
            offlineMessageDao.insert(entity)

            // Keep the queue from growing unbounded.
            offlineMessageDao.trimTo(MAX_QUEUE_SIZE)
        }
    }

    /**
     * Drain pending messages from the queue in FIFO order (sorted by priority, then queuedAt).
     *
     * Rules:
     * 1. Messages are sorted by priority (ascending: 0 = highest) then queuedAt (ascending).
     * 2. Only the most recent heartbeat is kept; all older heartbeats are deleted without replay.
     * 3. Each valid message is deleted from the queue after being returned.
     * 4. Messages whose retryCount exceeds 3 are skipped and deleted.
     */
    suspend fun drain(): List<OfflineMessageEntity> {
        mutex.withLock {
            val pending = offlineMessageDao.getPending(50)
            if (pending.isEmpty()) return emptyList()

            // Sort by priority (ascending) then queuedAt (ascending) for FIFO within each priority tier.
            val sorted = pending.sortedWith(compareBy({ it.priority }, { it.queuedAt }))

            // Dedup heartbeats: keep only the newest; delete older ones without replay.
            val heartbeatMessages = sorted.filter { it.messageType == HEARTBEAT_TYPE }
            if (heartbeatMessages.size > 1) {
                val toDelete = heartbeatMessages.sortedByDescending { it.queuedAt }.drop(1)
                toDelete.forEach {
                    offlineMessageDao.delete(it.id)
                    Log.d("OfflineQueue", "Dedup: deleted stale heartbeat id=${it.id}")
                }
            }

            // Discard messages that have been retried too many times (> 3).
            val dead = sorted.filter { it.retryCount > 3 }
            dead.forEach {
                offlineMessageDao.delete(it.id)
                Log.w("OfflineQueue", "Discarding dead message id=${it.id} type=${it.messageType} after ${it.retryCount} retries")
            }

            // Valid messages: retryCount <= 3, non-duplicate heartbeats.
            val valid = sorted.filter { it.retryCount <= 3 && (it.messageType != HEARTBEAT_TYPE || it == heartbeatMessages.maxByOrNull { h -> h.queuedAt }) }

            // Mark these as drained by deleting them from the queue.
            valid.forEach { offlineMessageDao.delete(it.id) }

            Log.d("OfflineQueue", "Draining ${valid.size} messages (${dead.size} dead, ${heartbeatMessages.size - 1} stale heartbeats dropped)")
            return valid
        }
    }

    /**
     * Clear the entire offline queue.
     */
    suspend fun clear() {
        mutex.withLock {
            offlineMessageDao.deleteAll()
        }
    }

    /**
     * Return the number of pending messages.
     */
    suspend fun pendingCount(): Int {
        return offlineMessageDao.count()
    }

    /**
     * Increment retry count for a specific message and re-insert it.
     * Called when a message fails to send during drain replay.
     * Messages exceeding 3 retries will be discarded on the next drain.
     */
    suspend fun retryLater(entity: OfflineMessageEntity) {
        mutex.withLock {
            val updated = entity.copy(retryCount = entity.retryCount + 1)
            offlineMessageDao.insert(updated)
        }
    }
}
