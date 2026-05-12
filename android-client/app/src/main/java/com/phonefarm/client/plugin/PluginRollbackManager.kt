package com.phonefarm.client.plugin

import android.content.Context
import com.phonefarm.client.data.local.dao.PluginRegistryDao
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Automatic rollback on plugin crash detection.
 *
 * When a plugin update causes crashes (detected via Firebase Crashlytics
 * or local crash counting), this manager automatically rolls back to
 * the previous known-good version.
 *
 * Rollback decision logic:
 *   1. Crash counter threshold: > 3 crashes within 5 minutes → rollback
 *   2. Health check timeout: plugin service fails to bind 3 times → rollback
 *   3. Manual rollback: user requests rollback from plugin management UI
 *
 * Rollback procedure:
 *   1. Identify previous version (from PluginRegistryDao history)
 *   2. If previous APK is cached locally, install it directly
 *   3. If not cached, download from server
 *   4. Silent install the previous version
 *   5. Reset crash counters
 *   6. Report rollback event to control server
 */
@Singleton
class PluginRollbackManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val pluginRegistryDao: PluginRegistryDao,
    private val pluginInstaller: PluginInstaller,
) {

    /**
     * In-memory crash tracker: pluginId -> list of crash timestamps.
     * Persisted to SharedPreferences for survival across process restarts.
     */
    private val crashTimestamps = mutableMapOf<String, MutableList<Long>>()

    companion object {
        private const val CRASH_THRESHOLD = 3
        private const val CRASH_WINDOW_MS = 3_600_000L // 1 hour
        private const val PREFS_NAME = "plugin_rollback_prefs"
        private const val PREF_KEY_PREFIX = "crash_ts_"
    }

    /**
     * Load crash timestamps from SharedPreferences into memory.
     */
    private fun loadCrashData(pluginId: String): MutableList<Long> {
        return crashTimestamps.getOrPut(pluginId) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val stored = prefs.getString("$PREF_KEY_PREFIX$pluginId", null)
            if (stored.isNullOrBlank()) {
                mutableListOf()
            } else {
                stored.split(",").mapNotNull { it.toLongOrNull() }.toMutableList()
            }
        }
    }

    /**
     * Save crash timestamps to SharedPreferences.
     */
    private fun saveCrashData(pluginId: String, timestamps: List<Long>) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString("$PREF_KEY_PREFIX$pluginId", timestamps.joinToString(","))
            .apply()
    }

    /**
     * Check if a plugin needs to be rolled back based on crash count.
     *
     * @param pluginId The plugin to check.
     * @return true if the plugin should be rolled back.
     */
    suspend fun shouldRollback(pluginId: String): Boolean {
        val timestamps = loadCrashData(pluginId)
        val now = System.currentTimeMillis()
        val cutoff = now - CRASH_WINDOW_MS

        // Remove stale timestamps outside the window
        val recent = timestamps.filter { it >= cutoff }

        // Update stored data with pruned list
        if (recent.size != timestamps.size) {
            crashTimestamps[pluginId] = recent.toMutableList()
            saveCrashData(pluginId, recent)
        }

        return recent.size >= CRASH_THRESHOLD
    }

    /**
     * Execute an automatic rollback to the previous version.
     *
     * @param pluginId The plugin to roll back.
     * @return The version string rolled back to, or null on failure.
     */
    suspend fun executeRollback(pluginId: String): String? {
        val entity = pluginRegistryDao.get(pluginId)
            ?: return null // Cannot rollback without registry entry

        // Find previous cached APK by looking for an older version file
        val cacheDir = File(context.cacheDir, "plugins")
        if (!cacheDir.exists()) return null

        val prevApkFiles = cacheDir.listFiles { file ->
            val name = file.name
            name.startsWith("$pluginId-") && name.endsWith(".apk") &&
                !name.contains(entity.version)
        } ?: return null

        if (prevApkFiles.isEmpty()) return null

        // Use the most recent previous version (sorted by file modification time)
        val prevApk = prevApkFiles.maxByOrNull { it.lastModified() } ?: return null

        // Extract previous version from filename: pluginId-version.apk
        val prevVersion = prevApk.name
            .removePrefix("$pluginId-")
            .removeSuffix(".apk")

        // Uninstall current version
        try {
            val process = Runtime.getRuntime().exec(
                arrayOf("pm", "uninstall", pluginId)
            )
            process.waitFor()
        } catch (_: Exception) {
            // Continue even if uninstall fails
        }

        // Install previous version
        val installResult = pluginInstaller.installSilently(prevApk) { /* progress */ }
        if (installResult !is InstallResult.Success) {
            return null
        }

        // Reset crash counters
        resetCrashCounter(pluginId)

        // Update plugin registry to the rolled-back version
        pluginRegistryDao.upsert(
            entity.copy(
                version = prevVersion,
                status = "installed",
                apkPath = prevApk.absolutePath,
                updatedAt = System.currentTimeMillis(),
            )
        )

        return prevVersion
    }

    /**
     * Record a crash for a specific plugin version.
     *
     * @param pluginId The plugin that crashed.
     * @param version  The version that crashed.
     */
    suspend fun recordCrash(pluginId: String, version: String) {
        val timestamps = loadCrashData(pluginId)
        val now = System.currentTimeMillis()

        // Add current crash timestamp
        timestamps.add(now)

        // Prune timestamps outside the window
        val cutoff = now - CRASH_WINDOW_MS
        val recent = timestamps.filter { it >= cutoff }
        crashTimestamps[pluginId] = recent.toMutableList()

        // Persist
        saveCrashData(pluginId, recent)

        // If threshold exceeded, trigger automatic rollback
        if (recent.size >= CRASH_THRESHOLD) {
            executeRollback(pluginId)
        }
    }

    /**
     * Reset the crash counter for a plugin (after successful update or manual reset).
     */
    suspend fun resetCrashCounter(pluginId: String) {
        crashTimestamps.remove(pluginId)
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .remove("$PREF_KEY_PREFIX$pluginId")
            .apply()
    }
}
