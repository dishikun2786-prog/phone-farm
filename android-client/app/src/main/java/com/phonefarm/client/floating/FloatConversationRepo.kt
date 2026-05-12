package com.phonefarm.client.floating

import com.phonefarm.client.data.local.dao.FloatConversationDao
import com.phonefarm.client.data.local.entity.FloatConversationEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for float window conversation history persistence.
 *
 * Messages are stored in Room (float_conversations table) with
 * automatic cleanup of old non-critical messages to manage storage.
 *
 * Session management:
 *   - Each float window session gets a unique sessionId (UUID).
 *   - Sessions persist across app restarts.
 *   - Old messages (> 7 days) are pruned automatically, except
 *     save_prompt messages which are kept indefinitely.
 */
@Singleton
class FloatConversationRepo @Inject constructor(
    private val conversationDao: FloatConversationDao,
) {

    /**
     * Get the most recent messages for a session as a reactive Flow.
     *
     * @param sessionId The active session identifier.
     * @param limit     Maximum number of messages to return.
     * @return Flow of [FloatConversationEntity] sorted newest-first.
     */
    fun observeMessages(sessionId: String, limit: Int = 200): Flow<List<FloatConversationEntity>> {
        return conversationDao.observeBySession(sessionId, limit)
    }

    /**
     * Get messages for a session as a one-shot suspend function.
     *
     * Results are returned in chronological order (oldest first) for
     * use in UI rendering.
     */
    suspend fun getMessages(sessionId: String, limit: Int = 50): List<FloatConversationEntity> {
        return conversationDao.getBySession(sessionId, limit).reversed()
    }

    /**
     * Add a new message to the conversation.
     */
    suspend fun addMessage(message: FloatConversationEntity) {
        conversationDao.insert(message)

        // Trigger auto-cleanup periodically if message count is high
        val count = conversationDao.countBySession(message.sessionId)
        if (count > 500) {
            pruneOldMessages(retentionDays = 7)
        }
    }

    /**
     * Clear all conversation history for the given session.
     *
     * @param sessionId The session to clear.
     * @param keepSavePrompts If true, save_prompt messages are preserved.
     */
    suspend fun clearHistory(sessionId: String, keepSavePrompts: Boolean = true) {
        if (keepSavePrompts) {
            conversationDao.deleteNonSavePrompts(sessionId)
        } else {
            conversationDao.deleteBySession(sessionId)
        }
    }

    /**
     * Prune old messages to manage storage.
     * Keeps save_prompt messages and messages within the retention period.
     *
     * @param retentionDays Number of days to keep messages.
     */
    suspend fun pruneOldMessages(retentionDays: Int = 7) {
        val cutoff = System.currentTimeMillis() - (retentionDays * 24L * 60 * 60 * 1000)
        conversationDao.deleteOlderThan(cutoff)
    }
}
