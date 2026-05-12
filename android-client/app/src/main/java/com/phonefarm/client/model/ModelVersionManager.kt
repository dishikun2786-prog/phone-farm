package com.phonefarm.client.model

import com.phonefarm.client.data.local.dao.ModelRegistryDao
import com.phonefarm.client.data.local.entity.ModelRegistryEntity
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Multi-version management for local AI models.
 *
 * Each modelId can have multiple versions (e.g., "v1.0.0", "v1.1.0")
 * with different quantization levels. The manager supports:
 *   - Switching between installed versions
 *   - Listing available versions for a modelId
 *   - Rolling back to a previous version after a crash/downgrade
 *
 * Version metadata is stored in ModelRegistryDao with the version and
 * quantization columns.
 */
@Singleton
class ModelVersionManager @Inject constructor(
    private val modelRegistryDao: ModelRegistryDao,
    private val modelManager: ModelManager,
) {

    /**
     * Switch the active version for a given model.
     *
     * @param modelId The model identifier.
     * @param version The target version string (e.g., "v1.1.0").
     */
    suspend fun switchVersion(modelId: String, version: String) {
        // 1. Find the target model entry — modelId is a base prefix,
        //    the actual primary key is "{modelId}-{quantization}".
        //    Version distinguishes quantized builds of the same base.
        val allEntries = modelRegistryDao.observeAll().first()
        val target = allEntries.firstOrNull { entry ->
            entry.modelId.startsWith("$modelId-") && entry.version == version
                && (entry.status == "ready" || entry.status == "loaded")
        } ?: throw IllegalStateException(
            "Target version $version for model $modelId not found or not downloaded"
        )

        // 2. Find and unload the currently-active version of this model
        val currentActive = allEntries.firstOrNull { entry ->
            entry.modelId.startsWith("$modelId-") && entry.status == "loaded"
        }
        val wasLoaded = currentActive != null
        if (wasLoaded) {
            modelManager.unloadModel(currentActive!!.modelId)
        }

        // 3. Mark the target version as ready (it will be loaded next)
        modelRegistryDao.upsert(target.copy(status = "ready"))

        // 4. Reload if the model was previously loaded
        if (wasLoaded) {
            modelManager.loadModel(target.modelId)
        }

        // 5. ModelManager.loadModel / unloadModel already emit updated
        //    installedModels flow internally via refreshInstalledModels.
    }

    /**
     * Get all installed versions for a model ID.
     *
     * @param modelId The model identifier.
     * @return List of version strings (e.g., ["v1.0.0-q4_k_m", "v1.1.0-q5_k_m"]).
     */
    suspend fun getVersions(modelId: String): List<String> {
        // Query all registry entries whose modelId starts with the given base prefix,
        // then extract and sort by version string.
        return modelRegistryDao.observeAll()
            .first()
            .filter { it.modelId.startsWith("$modelId-") || it.modelId == modelId }
            .map { it.version }
            .distinct()
            .sortedBy { it }
    }

    /**
     * Rollback to the previous version of a model.
     *
     * Used after a crash or performance regression in the current version.
     *
     * @param modelId The model identifier.
     * @return The version string that was rolled back to.
     */
    suspend fun rollback(modelId: String): String {
        // 1. Get all installed versions sorted by install time (most recent first)
        val allEntries = modelRegistryDao.observeAll()
            .first()
            .filter { it.modelId.startsWith("$modelId-") || it.modelId == modelId }
            .sortedByDescending { it.installedAt ?: 0L }

        if (allEntries.isEmpty()) {
            throw IllegalStateException("No installed versions found for model $modelId")
        }

        val currentActive = allEntries.firstOrNull { it.status == "loaded" }
            ?: allEntries.firstOrNull { it.status == "ready" }
            ?: allEntries.first()

        if (allEntries.size == 1) {
            // Only one version installed — mark it as broken
            modelRegistryDao.upsert(currentActive.copy(status = "error"))
            android.util.Log.w(
                "ModelVersionManager",
                "Rollback: only one version for $modelId, marked as broken"
            )
            return currentActive.version
        }

        // 2. Find previous version (the next entry by installedAt that is not current)
        val previous = allEntries.first { it != currentActive }

        // 3. Log rollback event
        android.util.Log.w(
            "ModelVersionManager",
            "Rolling back $modelId from ${currentActive.version} to ${previous.version}"
        )

        // 4. Switch to the previous version
        switchVersion(modelId, previous.version)
        return previous.version
    }
}
