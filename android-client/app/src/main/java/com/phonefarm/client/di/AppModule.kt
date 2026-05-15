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

    @Provides @Singleton
    fun provideActivationDao(db: AppDatabase): ActivationDao = db.activationDao()

    @Provides @Singleton
    fun provideScriptFileDao(db: AppDatabase): ScriptFileDao = db.scriptFileDao()

    @Provides @Singleton
    fun provideTaskLogDao(db: AppDatabase): TaskLogDao = db.taskLogDao()

    @Provides @Singleton
    fun provideEpisodeDao(db: AppDatabase): EpisodeDao = db.episodeDao()

    @Provides @Singleton
    fun provideVlmStepDao(db: AppDatabase): VlmStepDao = db.vlmStepDao()

    @Provides @Singleton
    fun provideCloudConfigDao(db: AppDatabase): CloudConfigDao = db.cloudConfigDao()

    @Provides @Singleton
    fun provideFloatConversationDao(db: AppDatabase): FloatConversationDao = db.floatConversationDao()

    @Provides @Singleton
    fun provideSavedScriptDao(db: AppDatabase): SavedScriptDao = db.savedScriptDao()

    @Provides @Singleton
    fun provideQuickChipDao(db: AppDatabase): QuickChipDao = db.quickChipDao()

    @Provides @Singleton
    fun providePluginRegistryDao(db: AppDatabase): PluginRegistryDao = db.pluginRegistryDao()

    @Provides @Singleton
    fun provideModelRegistryDao(db: AppDatabase): ModelRegistryDao = db.modelRegistryDao()

    @Provides @Singleton
    fun provideNotificationDao(db: AppDatabase): NotificationDao = db.notificationDao()

    @Provides @Singleton
    fun provideLocalCronJobDao(db: AppDatabase): LocalCronJobDao = db.localCronJobDao()

    @Provides @Singleton
    fun provideOfflineMessageDao(db: AppDatabase): OfflineMessageDao = db.offlineMessageDao()

    @Provides @Singleton
    fun provideCrashReportDao(db: AppDatabase): CrashReportDao = db.crashReportDao()

    @Provides @Singleton
    fun providePlatformAccountDao(db: AppDatabase): PlatformAccountDao = db.platformAccountDao()
}
