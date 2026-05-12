package com.phonefarm.client.engine

import android.content.Context
import com.phonefarm.client.data.local.dao.ScriptFileDao
import com.phonefarm.client.data.local.entity.ScriptFileEntity
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ScriptRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val scriptFileDao: ScriptFileDao,
) {

    companion object {
        private const val ASSETS_SCRIPTS_DIR = "scripts"
        private const val HASH_ALGORITHM = "SHA-256"
    }

    suspend fun loadScript(name: String): String? {
        val local = scriptFileDao.get(name)
        if (local != null) return local.content
        return loadFromAssets(name)
    }

    suspend fun saveScript(
        name: String,
        content: String,
        version: String = "1.0.0",
        platform: String? = null,
    ) {
        val entity = ScriptFileEntity(
            fileName = name,
            content = content,
            version = version,
            platform = platform,
            syncedAt = System.currentTimeMillis(),
            sizeBytes = content.encodeToByteArray().size.toLong(),
            checksum = sha256(content),
        )
        scriptFileDao.upsert(entity)
    }

    suspend fun deleteScript(name: String) {
        scriptFileDao.delete(name)
    }

    suspend fun getLocalManifest(): Map<String, String> {
        val list = scriptFileDao.observeAll().first()
        val result = mutableMapOf<String, String>()
        list.forEach { entity ->
            entity.checksum?.let { result[entity.fileName] = it }
        }
        return result
    }

    suspend fun count(): Int = scriptFileDao.count()

    fun observeAll(): Flow<List<ScriptFileEntity>> = scriptFileDao.observeAll()

    private fun loadFromAssets(name: String): String? {
        return try {
            val path = "$ASSETS_SCRIPTS_DIR/$name"
            context.assets.open(path).bufferedReader(Charsets.UTF_8).use { it.readText() }
        } catch (_: Exception) {
            null
        }
    }

    fun listBundledScriptNames(): List<String> {
        return try {
            context.assets.list(ASSETS_SCRIPTS_DIR)?.toList() ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun sha256(content: String): String {
        val digest = MessageDigest.getInstance(HASH_ALGORITHM)
        val hashBytes = digest.digest(content.encodeToByteArray())
        return hashBytes.joinToString("") { "%02x".format(it) }
    }
}
