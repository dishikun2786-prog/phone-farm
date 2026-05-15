package com.phonefarm.client

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.phonefarm.client.skills.SkillRegistry
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltAndroidApp
class PhoneFarmApp : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var skillRegistry: SkillRegistry

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .setMinimumLoggingLevel(android.util.Log.INFO)
            .build()

    override fun onCreate() {
        super.onCreate()
        instance = this

        // Initialize skills registry (load JSON + scan installed packages)
        GlobalScope.launch(Dispatchers.IO) {
            skillRegistry.initialize()
        }
    }

    companion object {
        lateinit var instance: PhoneFarmApp
            private set
    }
}
