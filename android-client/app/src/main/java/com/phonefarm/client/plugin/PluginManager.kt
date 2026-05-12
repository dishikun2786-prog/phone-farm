package com.phonefarm.client.plugin

import android.content.Context
import com.phonefarm.client.data.local.dao.PluginRegistryDao
import com.phonefarm.client.data.local.entity.PluginRegistryEntity
import com.phonefarm.client.network.ApiService
import com.phonefarm.client.privilege.SilentInstallHelper
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okio.appendingSink
import okio.buffer
import okio.sink
import java.io.File
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Lifecycle manager for PhoneFarm companion plugins.
 *
 * Plugins are companion APKs that extend PhoneFarm functionality:
 *   - DeekeScript runtime (core automation engine)
 *   - Platform-specific modules (WeChat helper, Douyin helper)
 *   - Accessibility fix modules for specific OEMs (MIUI, ColorOS, etc.)
 *
 * Plugin lifecycle:
 *   1. Sync manifest from control server
 *   2. Download APK with integrity verification
 *   3. Silent install via DeviceOwner / Shizuku / Root
 *   4. Post-install health check (bindService + ping)
 *   5. Auto-update when new version available
 *   6. Auto-rollback on crash detection
 */
@Singleton
class PluginManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService,
    private val okHttpClient: OkHttpClient,
    private val silentInstaller: SilentInstallHelper,
    private val pluginRegistryDao: PluginRegistryDao,
    private val pluginVerifier: PluginVerifier,
    private val pluginInstaller: PluginInstaller,
    private val pluginHealthChecker: PluginHealthChecker,
    private val pluginRollbackManager: PluginRollbackManager,
) {

    private val _pluginStates = MutableStateFlow<Map<String, PluginStatus>>(emptyMap())
    val pluginStates: StateFlow<Map<String, PluginStatus>> = _pluginStates.asStateFlow()

    /**
     * Sync the plugin manifest from the control server.
     *
     * Determines which plugins need to be installed, updated, or removed
     * by comparing the server manifest against the local registry.
     *
     * @return List of [PluginAction]s to execute.
     */
    suspend fun syncPluginManifest(): List<PluginAction> {
        // Fetch manifest from control server
        val manifest = apiService.syncPlugins()
        val localPlugins = pluginRegistryDao.getAll()
        val localMap = localPlugins.associateBy { it.pluginId }

        val actions = mutableListOf<PluginAction>()
        val newStates = mutableMapOf<String, PluginStatus>()

        for (serverPlugin in manifest.plugins) {
            val local = localMap[serverPlugin.pluginId]
            val action = when {
                local == null || local.status == "not_installed" -> PluginAction.INSTALL
                serverPlugin.version != local.version -> PluginAction.UPDATE
                else -> PluginAction.VERIFY
            }
            actions.add(action)

            newStates[serverPlugin.pluginId] = PluginStatus(
                pluginId = serverPlugin.pluginId,
                name = serverPlugin.name,
                installedVersion = local?.version,
                targetVersion = serverPlugin.version,
                status = local?.status ?: "not_installed",
                isRequired = serverPlugin.isRequired,
                progress = if (local?.status == "installed") 1f else 0f,
            )
        }

        // Mark plugins that are locally installed but no longer in the manifest for removal
        for (local in localPlugins) {
            if (local.pluginId !in manifest.plugins.map { it.pluginId }) {
                actions.add(PluginAction.REMOVE)
            }
        }

        _pluginStates.value = newStates
        return actions
    }

    /**
     * Download a plugin APK file.
     *
     * @param plugin     Plugin metadata from manifest.
     * @param onProgress Download progress callback [0.0, 1.0].
     * @return The downloaded APK [File].
     */
    suspend fun downloadPlugin(
        plugin: PluginInfo,
        onProgress: (Float) -> Unit,
    ): File = withContext(Dispatchers.IO) {
        val cacheDir = File(context.cacheDir, "plugins")
        if (!cacheDir.exists()) cacheDir.mkdirs()

        val outputFile = File(cacheDir, "${plugin.pluginId}-${plugin.version}.apk")
        val tempFile = File(cacheDir, "${plugin.pluginId}-${plugin.version}.apk.tmp")

        // Update registry status to downloading
        val existing = pluginRegistryDao.get(plugin.pluginId)
        val registryEntity = PluginRegistryEntity(
            pluginId = plugin.pluginId,
            name = plugin.name,
            version = plugin.version,
            status = "downloading",
            apkPath = null,
            sha256 = plugin.sha256,
            sizeBytes = plugin.sizeBytes,
            isRequired = plugin.isRequired,
            installedAt = existing?.installedAt,
            updatedAt = System.currentTimeMillis(),
        )
        pluginRegistryDao.upsert(registryEntity)
        updatePluginState(plugin.pluginId, status = "downloading", progress = 0f)

        val url = plugin.downloadUrl
        if (url.isNullOrBlank()) throw IOException("No download URL for plugin ${plugin.pluginId}")

        // Determine if we can resume a partial download
        var downloadedBytes = 0L
        val requestBuilder = Request.Builder().url(url)
        if (tempFile.exists()) {
            downloadedBytes = tempFile.length()
            if (downloadedBytes > 0) {
                requestBuilder.header("Range", "bytes=$downloadedBytes-")
            }
        }

        val request = requestBuilder.build()
        val response = okHttpClient.newCall(request).execute()

        if (!response.isSuccessful && response.code != 206) {
            throw IOException("Download failed: HTTP ${response.code} for ${plugin.pluginId}")
        }

        val totalBytes = if (downloadedBytes == 0L) {
            response.body?.contentLength() ?: plugin.sizeBytes
        } else {
            downloadedBytes + (response.body?.contentLength() ?: 0)
        }

        val sink = if (downloadedBytes > 0 && response.code == 206) {
            tempFile.appendingSink().buffer()
        } else {
            tempFile.sink().buffer()
        }

        response.body?.source()?.use { source ->
            sink.use { out ->
                var bytesCopied = downloadedBytes
                while (!source.exhausted()) {
                    val read = source.read(sink.buffer, 8192)
                    if (read == -1L) break
                    out.emit()
                    bytesCopied += read
                    val progress = if (totalBytes > 0) {
                        (bytesCopied.toFloat() / totalBytes).coerceIn(0f, 1f)
                    } else {
                        0f
                    }
                    withContext(Dispatchers.Main) { onProgress(progress) }
                }
            }
        }

        response.close()

        // Rename temp file to final
        if (outputFile.exists()) outputFile.delete()
        tempFile.renameTo(outputFile)

        // Verify SHA-256 checksum
        if (plugin.sha256.isNotBlank() && !pluginVerifier.verifySha256(outputFile, plugin.sha256)) {
            outputFile.delete()
            updatePluginState(plugin.pluginId, status = "failed", progress = 1f)
            throw IOException("SHA-256 verification failed for ${plugin.pluginId}")
        }

        // Update registry status
        pluginRegistryDao.upsert(
            registryEntity.copy(
                status = "downloaded",
                apkPath = outputFile.absolutePath,
                updatedAt = System.currentTimeMillis(),
            )
        )
        updatePluginState(plugin.pluginId, status = "downloaded", progress = 1f)

        outputFile
    }

    /**
     * Auto-install all missing plugins.
     *
     * @return Flow of [PluginInstallProgress] for each plugin.
     */
    suspend fun autoInstallMissingPlugins(): Flow<PluginInstallProgress> = flow {
        // Get all plugins that need installation
        val allPlugins = pluginRegistryDao.getAll()
        val missingPlugins = allPlugins.filter {
            it.status == "not_installed" || it.status == "failed"
        }

        // Fetch server manifest to get full plugin details
        val manifest = apiService.syncPlugins()
        val serverPluginMap = manifest.plugins.associateBy { it.pluginId }

        for ((index, entity) in missingPlugins.withIndex()) {
            val serverInfo = serverPluginMap[entity.pluginId]
            if (serverInfo == null) {
                emit(PluginInstallProgress(
                    pluginId = entity.pluginId,
                    stage = "error",
                    progress = 0f,
                    error = "Plugin not found in server manifest",
                ))
                continue
            }

            // Build local PluginInfo from server data
            val pluginInfo = PluginInfo(
                pluginId = serverInfo.pluginId,
                name = serverInfo.name,
                packageName = entity.pluginId, // default, will be corrected by extracted package name
                version = serverInfo.version,
                versionCode = 0,
                downloadUrl = serverInfo.downloadUrl ?: "",
                sizeBytes = serverInfo.sizeBytes,
                sha256 = serverInfo.sha256 ?: "",
                minSdk = 21,
                isRequired = serverInfo.isRequired,
                category = "core",
                changelog = null,
            )

            var success = false
            var lastError: String? = null

            // Try up to 2 attempts
            for (attempt in 1..2) {
                try {
                    // Stage: downloading
                    emit(PluginInstallProgress(
                        pluginId = entity.pluginId,
                        stage = "downloading",
                        progress = 0f,
                        error = null,
                    ))

                    val apkFile = downloadPlugin(pluginInfo) { progress ->
                        // progress reported via plugin states, not re-emitted here for brevity
                    }

                    // Stage: verifying
                    emit(PluginInstallProgress(
                        pluginId = entity.pluginId,
                        stage = "verifying",
                        progress = 0.5f,
                        error = null,
                    ))

                    val packageName = pluginVerifier.extractPackageName(apkFile)
                        ?: entity.pluginId

                    val verification = pluginVerifier.verifyComprehensive(
                        apkFile,
                        pluginInfo.sha256,
                        packageName,
                    )
                    if (verification is VerificationResult.Fail) {
                        throw IOException("Verification failed: ${verification.reason}")
                    }

                    // Stage: installing
                    emit(PluginInstallProgress(
                        pluginId = entity.pluginId,
                        stage = "installing",
                        progress = 0.7f,
                        error = null,
                    ))

                    val installResult = pluginInstaller.installSilently(apkFile) { /* progress tracked internally */ }
                    if (installResult !is InstallResult.Success) {
                        val reason = (installResult as? InstallResult.Failure)?.reason ?: "Unknown install error"
                        throw IOException("Installation failed: $reason")
                    }

                    // Stage: health_check
                    emit(PluginInstallProgress(
                        pluginId = entity.pluginId,
                        stage = "health_check",
                        progress = 0.9f,
                        error = null,
                    ))

                    val healthResult = pluginHealthChecker.checkHealth(
                        packageName = packageName,
                        serviceClassName = "$packageName.PluginService",
                        expectedVersion = pluginInfo.version,
                    )
                    if (healthResult is HealthCheckResult.Fail) {
                        throw IOException("Health check failed: ${healthResult.reason}")
                    }

                    // Success
                    pluginRegistryDao.upsert(
                        PluginRegistryEntity(
                            pluginId = entity.pluginId,
                            name = pluginInfo.name,
                            version = pluginInfo.version,
                            status = "installed",
                            apkPath = apkFile.absolutePath,
                            sha256 = pluginInfo.sha256,
                            sizeBytes = pluginInfo.sizeBytes,
                            isRequired = pluginInfo.isRequired,
                            installedAt = entity.installedAt ?: System.currentTimeMillis(),
                            updatedAt = System.currentTimeMillis(),
                        )
                    )
                    updatePluginState(entity.pluginId, status = "installed", progress = 1f)

                    emit(PluginInstallProgress(
                        pluginId = entity.pluginId,
                        stage = "completed",
                        progress = 1f,
                        error = null,
                    ))
                    success = true
                    break
                } catch (e: Exception) {
                    lastError = e.message
                    if (attempt < 2) {
                        // Brief delay before retry
                        delay(1000L * attempt)
                    }
                }
            }

            if (!success) {
                pluginRegistryDao.upsert(
                    PluginRegistryEntity(
                        pluginId = entity.pluginId,
                        name = entity.name,
                        version = entity.version,
                        status = "failed",
                        apkPath = entity.apkPath,
                        sha256 = entity.sha256,
                        sizeBytes = entity.sizeBytes,
                        isRequired = entity.isRequired,
                        installedAt = entity.installedAt,
                        updatedAt = System.currentTimeMillis(),
                    )
                )
                updatePluginState(entity.pluginId, status = "failed", progress = 0f)

                emit(PluginInstallProgress(
                    pluginId = entity.pluginId,
                    stage = "error",
                    progress = 0f,
                    error = lastError,
                ))
            }
        }
    }

    /**
     * Check for available plugin updates.
     *
     * @return List of [PluginInfo] that have newer versions available.
     */
    suspend fun checkUpdates(): List<PluginInfo> {
        val manifest = apiService.syncPlugins()
        val localPlugins = pluginRegistryDao.getAll()
        val localMap = localPlugins.associateBy { it.pluginId }

        val updates = mutableListOf<PluginInfo>()

        for (serverPlugin in manifest.plugins) {
            val local = localMap[serverPlugin.pluginId] ?: continue
            if (local.status != "installed") continue

            // Compare version strings — naive string comparison;
            // in production use a semver-aware comparator
            if (serverPlugin.version != local.version) {
                val localVersionParts = local.version.split(".").map { it.toIntOrNull() ?: 0 }
                val serverVersionParts = serverPlugin.version.split(".").map { it.toIntOrNull() ?: 0 }
                val maxLen = maxOf(localVersionParts.size, serverVersionParts.size)

                var serverIsNewer = false
                for (i in 0 until maxLen) {
                    val serverPart = serverVersionParts.getOrElse(i) { 0 }
                    val localPart = localVersionParts.getOrElse(i) { 0 }
                    if (serverPart > localPart) {
                        serverIsNewer = true
                        break
                    } else if (serverPart < localPart) {
                        break
                    }
                }

                if (serverIsNewer) {
                    updates.add(PluginInfo(
                        pluginId = serverPlugin.pluginId,
                        name = serverPlugin.name,
                        packageName = local.pluginId,
                        version = serverPlugin.version,
                        versionCode = 0,
                        downloadUrl = serverPlugin.downloadUrl ?: "",
                        sizeBytes = serverPlugin.sizeBytes,
                        sha256 = serverPlugin.sha256 ?: "",
                        minSdk = 21,
                        isRequired = serverPlugin.isRequired,
                        category = "core",
                        changelog = null,
                    ))
                }
            }
        }

        return updates
    }

    /**
     * Uninstall a plugin.
     *
     * @param pluginId The plugin identifier to remove.
     */
    suspend fun uninstallPlugin(pluginId: String) {
        val entity = pluginRegistryDao.get(pluginId)
            ?: throw IllegalStateException("Plugin $pluginId not found in registry")

        // Attempt silent uninstallation via pm uninstall
        try {
            val process = Runtime.getRuntime().exec(
                arrayOf("pm", "uninstall", pluginId)
            )
            val exitCode = process.waitFor()
            if (exitCode != 0) {
                val errMsg = process.errorStream.bufferedReader().readText()
                throw IOException("pm uninstall failed (exit $exitCode): $errMsg")
            }
        } catch (_: Exception) {
            // Uninstallation may fail if plugin is a system app or device owner protected.
            // We still remove from registry to allow re-installation.
        }

        // Delete cached APK file
        entity.apkPath?.let { path ->
            try {
                File(path).delete()
            } catch (_: Exception) {
                // best-effort cleanup
            }
        }

        // Remove from registry
        pluginRegistryDao.delete(pluginId)
        updatePluginState(pluginId, status = "not_installed", progress = 0f)
    }

    /**
     * Update the state of a single plugin in the [pluginStates] flow.
     */
    private fun updatePluginState(pluginId: String, status: String, progress: Float) {
        val current = _pluginStates.value.toMutableMap()
        val existing = current[pluginId]
        current[pluginId] = PluginStatus(
            pluginId = pluginId,
            name = existing?.name ?: pluginId,
            installedVersion = existing?.installedVersion,
            targetVersion = existing?.targetVersion ?: "",
            status = status,
            isRequired = existing?.isRequired ?: false,
            progress = progress,
        )
        _pluginStates.value = current
    }
}

// === Plugin Data Types ===

/** Status of a single plugin. */
data class PluginStatus(
    val pluginId: String,
    val name: String,
    val installedVersion: String?,
    val targetVersion: String,
    val status: String, // not_installed, downloading, verifying, installing, installed, failed
    val isRequired: Boolean,
    val progress: Float,
)

/** Action to take for a plugin during sync. */
enum class PluginAction {
    INSTALL,
    UPDATE,
    REMOVE,
    VERIFY,
    NONE,
}

/** Progress of a plugin installation. */
data class PluginInstallProgress(
    val pluginId: String,
    val stage: String, // downloading, verifying, installing, health_check
    val progress: Float, // 0.0 - 1.0
    val error: String?,
)
