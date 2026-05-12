package com.phonefarm.client.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "activations")
data class ActivationEntity(
    @PrimaryKey val id: String = "singleton",
    val activationCode: String,
    val deviceId: String,
    val activatedAt: Long,
    val expiresAt: Long?,
    val deviceName: String?,
    val isActive: Boolean = true
)

@Entity(tableName = "script_files")
data class ScriptFileEntity(
    @PrimaryKey val fileName: String,
    val content: String,
    val version: String,
    val platform: String?,
    val syncedAt: Long,
    val sizeBytes: Long,
    val checksum: String?
)

@Entity(tableName = "task_logs")
data class TaskLogEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val taskId: String,
    val scriptName: String,
    val platform: String?,
    val status: String, // running, completed, failed, timeout, stopped
    val startedAt: Long,
    val finishedAt: Long?,
    val stats: String?, // JSON stats
    val errorMessage: String?
)

@Entity(tableName = "episodes")
data class EpisodeEntity(
    @PrimaryKey val episodeId: String,
    val taskPrompt: String,
    val modelName: String,
    val modelType: String, // cloud / local
    val status: String, // running, completed, failed, stopped
    val totalSteps: Int,
    val startedAt: Long,
    val finishedAt: Long?,
    val summary: String?, // JSON summary
    val episodeJsonPath: String?
)

@Entity(tableName = "vlm_steps")
data class VlmStepEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val episodeId: String,
    val stepNumber: Int,
    val screenshotPath: String?,
    val modelThinking: String?,
    val actionJson: String?,
    val selectorInfoJson: String?,
    val durationMs: Long,
    val timestamp: Long
)

@Entity(tableName = "cloud_configs")
data class CloudConfigEntity(
    @PrimaryKey val configKey: String,
    val configValue: String,
    val updatedAt: Long
)

@Entity(tableName = "float_conversations")
data class FloatConversationEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sessionId: String,
    val role: String, // user, ai, system
    val messageType: String, // text, step, thinking, complete, save_prompt
    val content: String,
    val metadata: String?, // JSON extra data
    val timestamp: Long
)

@Entity(tableName = "saved_scripts")
data class SavedScriptEntity(
    @PrimaryKey val scriptId: String,
    val name: String,
    val platform: String,
    val category: String?,
    val episodeId: String?,
    val jsContent: String,
    val jsFilePath: String?,
    val syncedToCloud: Boolean = false,
    val isQuickChip: Boolean = false,
    val createdAt: Long,
    val updatedAt: Long
)

@Entity(tableName = "quick_chips")
data class QuickChipEntity(
    @PrimaryKey val chipId: String,
    val label: String,
    val command: String,
    val icon: String?,
    val category: String,
    val isDefault: Boolean,
    val sortOrder: Int,
    val enabled: Boolean = true
)

@Entity(tableName = "plugin_registry")
data class PluginRegistryEntity(
    @PrimaryKey val pluginId: String,
    val name: String,
    val version: String,
    val status: String, // not_installed, downloading, verifying, installing, installed, update_available, failed
    val apkPath: String?,
    val sha256: String?,
    val sizeBytes: Long,
    val isRequired: Boolean,
    val installedAt: Long?,
    val updatedAt: Long?
)

@Entity(tableName = "model_registry")
data class ModelRegistryEntity(
    @PrimaryKey val modelId: String,
    val displayName: String,
    val version: String,
    val quantization: String?,
    val fileSizeBytes: Long,
    val minRamMb: Int,
    val status: String, // not_downloaded, downloading, ready, loaded, error
    val filePath: String?,
    val downloadedBytes: Long = 0,
    val installedAt: Long?,
    val backend: String? // cpu, vulkan, nnapi, qnn
)

@Entity(tableName = "notifications")
data class NotificationEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val type: String, // task, system, update, alert
    val title: String,
    val body: String,
    val actionUrl: String?, // deep link or action
    val isRead: Boolean = false,
    val timestamp: Long
)

@Entity(tableName = "local_cron_jobs")
data class LocalCronJobEntity(
    @PrimaryKey val jobId: String,
    val scriptName: String,
    val cronExpression: String,
    val scriptConfig: String?, // JSON config
    val enabled: Boolean = true,
    val lastRunAt: Long?,
    val nextRunAt: Long?,
    val createdAt: Long
)

@Entity(tableName = "offline_messages")
data class OfflineMessageEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val messageType: String,
    val payload: String,
    val priority: Int, // 0-3
    val queuedAt: Long,
    val retryCount: Int = 0
)

@Entity(tableName = "crash_reports")
data class CrashReportEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val crashType: String, // java_crash, native_crash, anr
    val stackTrace: String,
    val deviceInfo: String?, // JSON
    val scriptName: String?,
    val memoryInfo: String?, // JSON
    val logSnapshot: String?,
    val timestamp: Long,
    val reported: Boolean = false
)

@Entity(tableName = "platform_accounts")
data class PlatformAccountEntity(
    @PrimaryKey val id: String,
    val platform: String,
    val username: String,
    val deviceId: String?,
    val healthStatus: String, // UNKNOWN, HEALTHY, EXPIRED, LOCKED, RATE_LIMITED, BANNED, ERROR
    val lastCheckedAt: Long?,
    val createdAt: Long,
    val updatedAt: Long
)
