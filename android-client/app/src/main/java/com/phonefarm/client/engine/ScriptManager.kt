package com.phonefarm.client.engine

import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ScriptManager @Inject constructor(
    private val scriptRepository: ScriptRepository,
) {

    fun getScriptList(): List<ScriptInfo> {
        val bundledNames = scriptRepository.listBundledScriptNames()
        val localEntities = kotlinx.coroutines.runBlocking {
            scriptRepository.observeAll().first()
        }
        val localMap = localEntities.associateBy { it.fileName }
        val allNames = (bundledNames + localMap.keys).distinct()

        return allNames.map { name ->
            val local = localMap[name]
            if (local != null) {
                ScriptInfo(
                    name = name,
                    platform = local.platform,
                    version = local.version,
                    sizeBytes = local.sizeBytes,
                    source = ScriptSource.LOCAL,
                    hasUpdate = false
                )
            } else {
                ScriptInfo(
                    name = name,
                    platform = guessPlatform(name),
                    version = "1.0.0",
                    sizeBytes = getScriptContent(name)?.encodeToByteArray()?.size?.toLong() ?: 0,
                    source = ScriptSource.BUNDLED,
                    hasUpdate = false
                )
            }
        }
    }

    fun getScriptContent(name: String): String? {
        return kotlinx.coroutines.runBlocking { scriptRepository.loadScript(name) }
    }

    suspend fun syncFromCloud(manifest: Map<String, String>): Int {
        val localManifest = getLocalManifest()
        var updatedCount = 0

        for ((name, remoteHash) in manifest) {
            val localHash = localManifest[name]
            if (localHash == null || localHash != remoteHash) {
                try {
                    val content = downloadScript(name)
                    if (content != null) {
                        saveScript(name, content, "ota-${System.currentTimeMillis()}")
                        updatedCount++
                    }
                } catch (_: Exception) {
                    // Skip failed downloads, will retry next sync
                }
            }
        }
        return updatedCount
    }

    private suspend fun downloadScript(name: String): String? {
        // TODO: Call ApiService to download script content from server
        return null
    }

    suspend fun getLocalManifest(): Map<String, String> {
        return scriptRepository.getLocalManifest()
    }

    fun getLocalVersion(): String {
        val count = kotlinx.coroutines.runBlocking { scriptRepository.count() }
        return "script-bundle/1.0.0-$count"
    }

    suspend fun saveScript(
        name: String,
        content: String,
        version: String = "1.0.0",
        platform: String? = null,
    ) {
        scriptRepository.saveScript(name, content, version, platform)
    }

    suspend fun deleteScript(name: String) {
        scriptRepository.deleteScript(name)
    }

    fun scriptCount(): Int {
        return kotlinx.coroutines.runBlocking { scriptRepository.count() }
    }

    private fun guessPlatform(name: String): String? {
        return when {
            name.contains("dy", ignoreCase = true) -> "douyin"
            name.contains("ks", ignoreCase = true) -> "kuaishou"
            name.contains("wx", ignoreCase = true) -> "wechat"
            name.contains("xhs", ignoreCase = true) -> "xiaohongshu"
            else -> null
        }
    }
}

data class ScriptInfo(
    val name: String,
    val platform: String?,
    val version: String,
    val sizeBytes: Long,
    val source: ScriptSource,
    val hasUpdate: Boolean,
)

enum class ScriptSource { BUNDLED, LOCAL, CLOUD }
