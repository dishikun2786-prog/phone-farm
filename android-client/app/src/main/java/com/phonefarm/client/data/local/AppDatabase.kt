package com.phonefarm.client.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.phonefarm.client.data.local.dao.*
import com.phonefarm.client.data.local.entity.*

@Database(
    entities = [
        ActivationEntity::class,
        ScriptFileEntity::class,
        TaskLogEntity::class,
        EpisodeEntity::class,
        VlmStepEntity::class,
        CloudConfigEntity::class,
        FloatConversationEntity::class,
        SavedScriptEntity::class,
        QuickChipEntity::class,
        PluginRegistryEntity::class,
        ModelRegistryEntity::class,
        NotificationEntity::class,
        LocalCronJobEntity::class,
        OfflineMessageEntity::class,
        CrashReportEntity::class,
        PlatformAccountEntity::class
    ],
    version = 2,
    exportSchema = true
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun activationDao(): ActivationDao
    abstract fun scriptFileDao(): ScriptFileDao
    abstract fun taskLogDao(): TaskLogDao
    abstract fun episodeDao(): EpisodeDao
    abstract fun vlmStepDao(): VlmStepDao
    abstract fun cloudConfigDao(): CloudConfigDao
    abstract fun floatConversationDao(): FloatConversationDao
    abstract fun savedScriptDao(): SavedScriptDao
    abstract fun quickChipDao(): QuickChipDao
    abstract fun pluginRegistryDao(): PluginRegistryDao
    abstract fun modelRegistryDao(): ModelRegistryDao
    abstract fun notificationDao(): NotificationDao
    abstract fun localCronJobDao(): LocalCronJobDao
    abstract fun offlineMessageDao(): OfflineMessageDao
    abstract fun crashReportDao(): CrashReportDao
    abstract fun platformAccountDao(): PlatformAccountDao
}
