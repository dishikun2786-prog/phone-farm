package com.phonefarm.client.data.repository

import com.phonefarm.client.data.local.dao.TaskLogDao
import com.phonefarm.client.data.local.entity.TaskLogEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for task execution logs and history.
 *
 * Persists task lifecycle events (started, progress, completed, failed, timeout, stopped)
 * and provides query methods for the task history UI.
 */
@Singleton
class TaskRepository @Inject constructor(
    private val taskLogDao: TaskLogDao,
) {

    /**
     * TODO: Save a new task execution log entry.
     *
     * @param taskId Server-assigned task identifier.
     * @param scriptName Name of the script that was executed.
     * @param platform Target platform (douyin, kuaishou, wechat, xiaohongshu).
     * @param status Current status: "running", "completed", "failed", "timeout", "stopped".
     * @param stats JSON-encoded statistics (e.g., items processed, actions taken).
     * @param errorMessage Error description if status is "failed".
     * @return The saved entity with auto-generated ID.
     */
    suspend fun saveExecutionLog(
        taskId: String,
        scriptName: String,
        platform: String? = null,
        status: String,
        stats: String? = null,
        errorMessage: String? = null,
        startedAt: Long = System.currentTimeMillis(),
        finishedAt: Long? = null,
    ): TaskLogEntity {
        val entity = TaskLogEntity(
            taskId = taskId,
            scriptName = scriptName,
            platform = platform,
            status = status,
            startedAt = startedAt,
            finishedAt = finishedAt,
            stats = stats,
            errorMessage = errorMessage,
        )
        taskLogDao.upsert(entity)
        return entity
    }

    /**
     * TODO: Update an existing task log entry (e.g., when task completes).
     */
    suspend fun updateExecutionLog(taskId: String, status: String, stats: String?, finishedAt: Long?) {
        val existing = taskLogDao.get(taskId)
        if (existing != null) {
            val updated = existing.copy(
                status = status,
                stats = stats,
                finishedAt = finishedAt,
            )
            taskLogDao.upsert(updated)
        }
    }

    /**
     * TODO: Get recent task execution history as a Flow.
     *
     * @param limit Maximum number of entries to observe.
     */
    fun getExecutionHistory(limit: Int = 50): Flow<List<TaskLogEntity>> {
        return taskLogDao.observeRecent(limit)
    }

    /**
     * TODO: Get a specific task log entry by task ID.
     */
    suspend fun getExecutionLog(taskId: String): TaskLogEntity? {
        return taskLogDao.get(taskId)
    }

    /**
     * TODO: Count completed tasks since a given timestamp.
     */
    suspend fun countCompletedSince(since: Long): Int {
        return taskLogDao.countCompletedSince(since)
    }

    /**
     * TODO: Delete task logs older than the given timestamp.
     * Used for periodic cleanup to prevent the database from growing unbounded.
     */
    suspend fun cleanupOlderThan(before: Long) {
        taskLogDao.deleteOlderThan(before)
    }
}
