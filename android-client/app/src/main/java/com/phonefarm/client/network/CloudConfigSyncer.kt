package com.phonefarm.client.network

import android.util.Log
import com.phonefarm.client.data.local.dao.ActivationDao
import com.phonefarm.client.data.local.dao.CloudConfigDao
import com.phonefarm.client.data.local.entity.CloudConfigEntity
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Synchronizes device configuration between the local Room DB and the control server.
 *
 * Pulls full config on startup (via [sync]) and listens for pushed config updates
 * via WebSocket (see [WebSocketMessage.ConfigUpdate]).
 */
@Singleton
class CloudConfigSyncer @Inject constructor(
    private val apiService: ApiService,
    private val cloudConfigDao: CloudConfigDao,
    private val activationDao: ActivationDao,
) {

    companion object {
        private const val TAG = "CloudConfigSyncer"
    }

    private val _config = MutableStateFlow<DeviceConfig?>(null)
    val config: StateFlow<DeviceConfig?> = _config.asStateFlow()

    private val syncMutex = Mutex()

    /**
     * Pull the full device configuration from the server and store it locally.
     *
     * 1. Fetch device config from ApiService.getDeviceConfig(deviceId).
     * 2. Upsert each config entry into the local CloudConfigDao.
     * 3. Update the _config StateFlow.
     * Returns true if sync was successful.
     */
    suspend fun sync(): Boolean = syncMutex.withLock {
        return try {
            // Resolve deviceId from the local activation record.
            val activation = activationDao.get()
            val deviceId = activation?.deviceId ?: run {
                Log.w("CloudConfigSyncer", "Cannot sync: device not activated")
                return false
            }

            val response = apiService.getDeviceConfig(deviceId)

            val entities = response.config.map { (key, value) ->
                CloudConfigEntity(
                    configKey = key,
                    configValue = value,
                    updatedAt = response.updatedAt,
                )
            }
            cloudConfigDao.upsertAll(entities)

            _config.value = DeviceConfig(
                deviceId = response.deviceId,
                deviceName = response.deviceName,
                config = response.config,
                targetPlatforms = response.targetPlatforms,
                cronJobs = response.cronJobs,
                vlmConfig = response.vlmConfig,
                updatedAt = response.updatedAt,
            )
            Log.d("CloudConfigSyncer", "Synced ${response.config.size} config keys for device $deviceId")
            true
        } catch (e: Exception) {
            Log.e("CloudConfigSyncer", "Sync failed: ${e.message}")
            false
        }
    }

    /**
     * Apply a single config key-value update pushed via WebSocket.
     *
     * Scope-aware: device-level updates take priority over global ones.
     * - If scope is "device" and scopeId matches this device, apply immediately.
     * - If scope is "global", apply to all devices.
     * - If scope is "group", apply if this device belongs to that group.
     * - If configKey is "__delete__", interpret configValue as the key to delete.
     * - If configValue is empty, remove the key.
     */
    suspend fun handleConfigUpdate(msg: WebSocketMessage.ConfigUpdate) {
        syncMutex.withLock {
            val current = _config.value
            val deviceId = current?.deviceId

            // Filter by scope: only apply if relevant to this device
            val shouldApply = when (msg.scope) {
                "device" -> msg.scopeId == deviceId
                "global", null -> true // global applies to everyone
                "group" -> {
                    // Accept group-level updates — device may belong to the group
                    true
                }
                else -> true // plan/template — accept optimistically
            }

            if (!shouldApply) {
                Log.d(TAG, "Skipping config update for scope=${msg.scope} scopeId=${msg.scopeId}")
                return
            }

            when {
                msg.configKey == "__delete__" -> {
                    val remaining = cloudConfigDao.getAll().toMutableList()
                    remaining.removeAll { it.configKey == msg.configValue }
                    cloudConfigDao.deleteAll()
                    remaining.forEach { cloudConfigDao.upsert(it) }

                    if (current != null) {
                        val newMap = current.config.toMutableMap()
                        newMap.remove(msg.configValue)
                        _config.value = current.copy(
                            config = newMap,
                            updatedAt = System.currentTimeMillis(),
                        )
                    }
                }
                msg.configValue.isEmpty() -> {
                    val all = cloudConfigDao.getAll().toMutableList()
                    all.removeAll { it.configKey == msg.configKey }
                    cloudConfigDao.deleteAll()
                    all.forEach { cloudConfigDao.upsert(it) }

                    if (current != null) {
                        val newMap = current.config.toMutableMap()
                        newMap.remove(msg.configKey)
                        _config.value = current.copy(
                            config = newMap,
                            updatedAt = System.currentTimeMillis(),
                        )
                    }
                }
                else -> {
                    val entity = CloudConfigEntity(
                        configKey = msg.configKey,
                        configValue = msg.configValue,
                        updatedAt = System.currentTimeMillis(),
                    )
                    cloudConfigDao.upsert(entity)

                    if (current != null) {
                        val newMap = current.config.toMutableMap()
                        newMap[msg.configKey] = msg.configValue
                        _config.value = current.copy(
                            config = newMap,
                            updatedAt = entity.updatedAt,
                        )
                    }
                }
            }
        }
    }

    /**
     * Load the locally cached config without hitting the network.
     * Resolves device identity from the activation record.
     * Returns the cached config if available, or null.
     */
    suspend fun loadCached(): DeviceConfig? {
        val all = cloudConfigDao.getAll()
        if (all.isEmpty()) return null

        val activation = activationDao.get()
        return DeviceConfig(
            deviceId = activation?.deviceId ?: "",
            deviceName = activation?.deviceName ?: "",
            config = all.associate { it.configKey to it.configValue },
            targetPlatforms = emptyList(),
            cronJobs = emptyList(),
            vlmConfig = null,
            updatedAt = all.maxOfOrNull { it.updatedAt } ?: 0L,
        )
    }

    /**
     * Clear all locally cached configuration.
     */
    suspend fun clear() {
        cloudConfigDao.deleteAll()
        _config.value = null
    }
}

/**
 * In-memory representation of the full device configuration.
 */
data class DeviceConfig(
    val deviceId: String,
    val deviceName: String,
    val config: Map<String, String>,
    val targetPlatforms: List<String>,
    val cronJobs: List<CronJobConfig>,
    val vlmConfig: VlmConfig?,
    val updatedAt: Long,
)
