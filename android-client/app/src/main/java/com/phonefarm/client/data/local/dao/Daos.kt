package com.phonefarm.client.data.local.dao

import androidx.room.*
import com.phonefarm.client.data.local.entity.*
import kotlinx.coroutines.flow.Flow

// === Activation ===
@Dao
interface ActivationDao {
    @Query("SELECT * FROM activations WHERE id = 'singleton'")
    suspend fun get(): ActivationEntity?

    @Query("SELECT * FROM activations WHERE id = 'singleton'")
    fun observe(): Flow<ActivationEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: ActivationEntity)

    @Query("DELETE FROM activations")
    suspend fun delete()
}

// === Script Files ===
@Dao
interface ScriptFileDao {
    @Query("SELECT * FROM script_files ORDER BY platform, fileName")
    fun observeAll(): Flow<List<ScriptFileEntity>>

    @Query("SELECT * FROM script_files WHERE fileName = :name")
    suspend fun get(name: String): ScriptFileEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: ScriptFileEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<ScriptFileEntity>)

    @Query("DELETE FROM script_files WHERE fileName = :name")
    suspend fun delete(name: String)

    @Query("SELECT COUNT(*) FROM script_files")
    suspend fun count(): Int
}

// === Task Logs ===
@Dao
interface TaskLogDao {
    @Query("SELECT * FROM task_logs ORDER BY startedAt DESC LIMIT :limit")
    fun observeRecent(limit: Int = 50): Flow<List<TaskLogEntity>>

    @Query("SELECT * FROM task_logs WHERE taskId = :taskId")
    suspend fun get(taskId: String): TaskLogEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: TaskLogEntity)

    @Query("SELECT COUNT(*) FROM task_logs WHERE status = 'completed' AND startedAt > :since")
    suspend fun countCompletedSince(since: Long): Int

    @Query("DELETE FROM task_logs WHERE startedAt < :before")
    suspend fun deleteOlderThan(before: Long)
}

// === Episodes ===
@Dao
interface EpisodeDao {
    @Query("SELECT * FROM episodes ORDER BY startedAt DESC")
    fun observeAll(): Flow<List<EpisodeEntity>>

    @Query("SELECT * FROM episodes WHERE episodeId = :id")
    suspend fun get(id: String): EpisodeEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: EpisodeEntity)

    @Query("DELETE FROM episodes WHERE episodeId = :id")
    suspend fun delete(id: String)
}

// === VLM Steps ===
@Dao
interface VlmStepDao {
    @Query("SELECT * FROM vlm_steps WHERE episodeId = :episodeId ORDER BY stepNumber")
    suspend fun getByEpisode(episodeId: String): List<VlmStepEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entity: VlmStepEntity)

    @Query("DELETE FROM vlm_steps WHERE episodeId = :episodeId")
    suspend fun deleteByEpisode(episodeId: String)
}

// === Cloud Config ===
@Dao
interface CloudConfigDao {
    @Query("SELECT * FROM cloud_configs")
    suspend fun getAll(): List<CloudConfigEntity>

    @Query("SELECT * FROM cloud_configs WHERE configKey = :key")
    suspend fun get(key: String): CloudConfigEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: CloudConfigEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<CloudConfigEntity>)

    @Query("DELETE FROM cloud_configs")
    suspend fun deleteAll()
}

// === Float Conversations ===
@Dao
interface FloatConversationDao {
    @Query("SELECT * FROM float_conversations WHERE sessionId = :sessionId ORDER BY timestamp DESC LIMIT :limit")
    fun observeBySession(sessionId: String, limit: Int = 200): Flow<List<FloatConversationEntity>>

    @Query("SELECT * FROM float_conversations WHERE sessionId = :sessionId ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getBySession(sessionId: String, limit: Int = 200): List<FloatConversationEntity>

    @Insert
    suspend fun insert(entity: FloatConversationEntity)

    @Query("DELETE FROM float_conversations WHERE timestamp < :before AND messageType != 'save_prompt'")
    suspend fun deleteOlderThan(before: Long)

    @Query("DELETE FROM float_conversations WHERE sessionId = :sessionId")
    suspend fun deleteBySession(sessionId: String)

    @Query("DELETE FROM float_conversations WHERE sessionId = :sessionId AND messageType != 'save_prompt'")
    suspend fun deleteNonSavePrompts(sessionId: String)

    @Query("SELECT COUNT(*) FROM float_conversations WHERE sessionId = :sessionId")
    suspend fun countBySession(sessionId: String): Int
}

// === Saved Scripts ===
@Dao
interface SavedScriptDao {
    @Query("SELECT * FROM saved_scripts ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<SavedScriptEntity>>

    @Query("SELECT * FROM saved_scripts WHERE platform = :platform ORDER BY updatedAt DESC")
    fun observeByPlatform(platform: String): Flow<List<SavedScriptEntity>>

    @Query("SELECT * FROM saved_scripts WHERE scriptId = :id")
    suspend fun get(id: String): SavedScriptEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: SavedScriptEntity)

    @Query("DELETE FROM saved_scripts WHERE scriptId = :id")
    suspend fun delete(id: String)
}

// === Quick Chips ===
@Dao
interface QuickChipDao {
    @Query("SELECT * FROM quick_chips WHERE enabled = 1 ORDER BY sortOrder")
    fun observeEnabled(): Flow<List<QuickChipEntity>>

    @Query("SELECT * FROM quick_chips ORDER BY sortOrder")
    fun getAll(): Flow<List<QuickChipEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: QuickChipEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<QuickChipEntity>)

    @Query("DELETE FROM quick_chips WHERE chipId = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM quick_chips WHERE isDefault = 0")
    suspend fun deleteCustom()

    @Query("DELETE FROM quick_chips")
    suspend fun deleteAll()
}

// === Plugin Registry ===
@Dao
interface PluginRegistryDao {
    @Query("SELECT * FROM plugin_registry")
    suspend fun getAll(): List<PluginRegistryEntity>

    @Query("SELECT * FROM plugin_registry WHERE pluginId = :id")
    suspend fun get(id: String): PluginRegistryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: PluginRegistryEntity)

    @Query("DELETE FROM plugin_registry WHERE pluginId = :id")
    suspend fun delete(id: String)
}

// === Model Registry ===
@Dao
interface ModelRegistryDao {
    @Query("SELECT * FROM model_registry ORDER BY installedAt DESC")
    fun observeAll(): Flow<List<ModelRegistryEntity>>

    @Query("SELECT * FROM model_registry ORDER BY installedAt DESC")
    suspend fun getAll(): List<ModelRegistryEntity>

    @Query("SELECT * FROM model_registry WHERE modelId = :id")
    suspend fun get(id: String): ModelRegistryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: ModelRegistryEntity)

    @Query("DELETE FROM model_registry WHERE modelId = :id")
    suspend fun delete(id: String)
}

// === Notifications ===
@Dao
interface NotificationDao {
    @Query("SELECT * FROM notifications ORDER BY timestamp DESC LIMIT :limit")
    fun observeRecent(limit: Int = 100): Flow<List<NotificationEntity>>

    @Query("SELECT * FROM notifications WHERE type = :type ORDER BY timestamp DESC LIMIT :limit")
    fun observeByType(type: String, limit: Int = 50): Flow<List<NotificationEntity>>

    @Insert
    suspend fun insert(entity: NotificationEntity)

    @Query("UPDATE notifications SET isRead = 1 WHERE id = :id")
    suspend fun markRead(id: Long)

    @Query("UPDATE notifications SET isRead = 1")
    suspend fun markAllRead()

    @Query("SELECT COUNT(*) FROM notifications WHERE isRead = 0")
    fun observeUnreadCount(): Flow<Int>

    @Query("DELETE FROM notifications WHERE timestamp < :before")
    suspend fun deleteOlderThan(before: Long)
}

// === Local Cron Jobs ===
@Dao
interface LocalCronJobDao {
    @Query("SELECT * FROM local_cron_jobs ORDER BY createdAt")
    fun observeAll(): Flow<List<LocalCronJobEntity>>

    @Query("SELECT * FROM local_cron_jobs WHERE jobId = :id")
    suspend fun get(id: String): LocalCronJobEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: LocalCronJobEntity)

    @Query("DELETE FROM local_cron_jobs WHERE jobId = :id")
    suspend fun delete(id: String)
}

// === Offline Messages ===
@Dao
interface OfflineMessageDao {
    @Query("SELECT * FROM offline_messages ORDER BY priority, queuedAt ASC LIMIT :limit")
    suspend fun getPending(limit: Int = 50): List<OfflineMessageEntity>

    @Insert
    suspend fun insert(entity: OfflineMessageEntity)

    @Query("DELETE FROM offline_messages WHERE id = :id")
    suspend fun delete(id: Long)

    @Query("DELETE FROM offline_messages")
    suspend fun deleteAll()

    @Query("SELECT COUNT(*) FROM offline_messages")
    suspend fun count(): Int

    @Query("DELETE FROM offline_messages WHERE id NOT IN (SELECT id FROM offline_messages ORDER BY priority, queuedAt ASC LIMIT :keep)")
    suspend fun trimTo(keep: Int = 500)
}

// === Platform Accounts ===
@Dao
interface PlatformAccountDao {
    @Query("SELECT * FROM platform_accounts ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<PlatformAccountEntity>>

    @Query("SELECT * FROM platform_accounts ORDER BY createdAt DESC")
    suspend fun getAll(): List<PlatformAccountEntity>

    @Query("SELECT * FROM platform_accounts WHERE id = :id")
    suspend fun getById(id: String): PlatformAccountEntity?

    @Query("SELECT * FROM platform_accounts WHERE platform = :platform ORDER BY createdAt DESC")
    suspend fun getByPlatform(platform: String): List<PlatformAccountEntity>

    @Query("SELECT * FROM platform_accounts WHERE deviceId = :deviceId ORDER BY createdAt DESC")
    suspend fun getByDevice(deviceId: String): List<PlatformAccountEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: PlatformAccountEntity)

    @Query("DELETE FROM platform_accounts WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM platform_accounts")
    suspend fun deleteAll()
}

// === Crash Reports ===
@Dao
interface CrashReportDao {
    @Query("SELECT * FROM crash_reports WHERE reported = 0 ORDER BY timestamp DESC")
    suspend fun getUnreported(): List<CrashReportEntity>

    @Insert
    suspend fun insert(entity: CrashReportEntity)

    @Query("UPDATE crash_reports SET reported = 1 WHERE id = :id")
    suspend fun markReported(id: Long)

    @Query("DELETE FROM crash_reports WHERE timestamp < :before")
    suspend fun deleteOlderThan(before: Long)
}
