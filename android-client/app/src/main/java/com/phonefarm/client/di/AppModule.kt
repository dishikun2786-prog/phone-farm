package com.phonefarm.client.di

import android.content.Context
import androidx.room.Room
import com.phonefarm.client.data.local.AppDatabase
import com.phonefarm.client.data.local.dao.*
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import com.phonefarm.client.BuildConfig
import com.phonefarm.client.network.transport.NatDetector
import com.phonefarm.client.network.transport.TransportSelector
import com.phonefarm.client.network.transport.UdpTransport
import javax.inject.Singleton

/**
 * Thread-safe in-memory JWT token holder.
 * Set by LoginViewModel after login, cleared on logout.
 */
object TokenHolder {
    @Volatile
    var token: String? = null
    @Volatile
    var refreshToken: String? = null
}

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase {
        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            "phonefarm.db"
        )
            .fallbackToDestructiveMigration()
            .build()
    }

    @Provides
    fun provideActivationDao(db: AppDatabase): ActivationDao = db.activationDao()

    @Provides
    fun provideScriptFileDao(db: AppDatabase): ScriptFileDao = db.scriptFileDao()

    @Provides
    fun provideTaskLogDao(db: AppDatabase): TaskLogDao = db.taskLogDao()

    @Provides
    fun provideEpisodeDao(db: AppDatabase): EpisodeDao = db.episodeDao()

    @Provides
    fun provideVlmStepDao(db: AppDatabase): VlmStepDao = db.vlmStepDao()

    @Provides
    fun provideCloudConfigDao(db: AppDatabase): CloudConfigDao = db.cloudConfigDao()

    @Provides
    fun provideFloatConversationDao(db: AppDatabase): FloatConversationDao = db.floatConversationDao()

    @Provides
    fun provideSavedScriptDao(db: AppDatabase): SavedScriptDao = db.savedScriptDao()

    @Provides
    fun provideQuickChipDao(db: AppDatabase): QuickChipDao = db.quickChipDao()

    @Provides
    fun providePluginRegistryDao(db: AppDatabase): PluginRegistryDao = db.pluginRegistryDao()

    @Provides
    fun provideModelRegistryDao(db: AppDatabase): ModelRegistryDao = db.modelRegistryDao()

    @Provides
    fun provideNotificationDao(db: AppDatabase): NotificationDao = db.notificationDao()

    @Provides
    fun provideLocalCronJobDao(db: AppDatabase): LocalCronJobDao = db.localCronJobDao()

    @Provides
    fun provideOfflineMessageDao(db: AppDatabase): OfflineMessageDao = db.offlineMessageDao()

    @Provides
    fun provideCrashReportDao(db: AppDatabase): CrashReportDao = db.crashReportDao()
}
