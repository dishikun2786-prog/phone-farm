package com.phonefarm.client.model

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.util.Log
import com.phonefarm.client.data.local.dao.ModelRegistryDao
import com.phonefarm.client.data.local.entity.ModelRegistryEntity
import com.phonefarm.client.network.ApiService
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okio.buffer
import okio.sink
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Lifecycle manager for local AI models.
 *
 * Responsibilities:
 *   - Sync model manifest from control server
 *   - Download model files (.gguf) with progress tracking
 *   - Load/unload models via llama.cpp JNI
 *   - Manage device storage (evict least-used models when storage is low)
 *   - Detect device capability and recommend the best model
 *
 * Model files are stored in internal storage: /data/data/.../files/models/
 * Each model is identified by its modelId (e.g., "autoglm-phone-9b-q4_k_m").
 */
@Singleton
class ModelManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val modelRegistryDao: ModelRegistryDao,
    private val apiService: ApiService,
    private val okHttpClient: OkHttpClient,
) {

    private val _installedModels = MutableStateFlow<List<LocalModelInfo>>(emptyList())
    val installedModels: StateFlow<List<LocalModelInfo>> = _installedModels.asStateFlow()

    /** Active model pointers: modelId → native pointer (llama_model*) */
    private val loadedModels = mutableMapOf<String, Long>()

    /**
     * Sync the model manifest from the control server.
     *
     * Called on app startup. The server returns available model metadata:
     *   - model IDs, display names, versions, quantizations
     *   - file sizes, SHA-256 checksums, download URLs
     *   - minimum requirements (RAM, Android version, NPU support)
     */
    /**
     * Sync the model manifest from the control server.
     *
     * Called on app startup. The server returns available model metadata:
     *   - model IDs, display names, versions, quantizations
     *   - file sizes, SHA-256 checksums, download URLs
     *   - minimum requirements (RAM, Android version, NPU support)
     *
     * @return List of [ModelRegistryEntity] entries that need downloading.
     */
    suspend fun syncModelManifest(): List<ModelRegistryEntity> {
        // 1. Fetch manifest from control server
        val manifest = apiService.getLocalModelManifest()
        val modelsNeedingDownload = mutableListOf<ModelRegistryEntity>()
        val manifestIds = mutableSetOf<String>()

        // 2. Upsert each model entry, detect new/updated models needing download
        for (model in manifest) {
            manifestIds.add(model.modelId)
            val existing = modelRegistryDao.get(model.modelId)

            if (existing == null) {
                // New model from server — register and mark for download
                val entity = ModelRegistryEntity(
                    modelId = model.modelId,
                    displayName = model.displayName,
                    version = model.version,
                    quantization = model.quantization,
                    fileSizeBytes = model.fileSizeBytes,
                    minRamMb = model.minRamMb,
                    status = "not_downloaded",
                    filePath = null,
                    downloadedBytes = 0,
                    installedAt = null,
                    backend = model.backend,
                )
                modelRegistryDao.upsert(entity)
                modelsNeedingDownload.add(entity)
            } else {
                val needsUpdate = existing.version != model.version
                    || existing.status == "error"
                    || (existing.status == "not_downloaded" && existing.filePath == null)

                if (needsUpdate) {
                    val updated = existing.copy(
                        displayName = model.displayName,
                        version = model.version,
                        quantization = model.quantization,
                        fileSizeBytes = model.fileSizeBytes,
                        minRamMb = model.minRamMb,
                        backend = model.backend,
                        status = "not_downloaded",
                        filePath = null,
                        downloadedBytes = 0,
                        installedAt = System.currentTimeMillis(),
                    )
                    modelRegistryDao.upsert(updated)
                    modelsNeedingDownload.add(updated)
                }
            }
        }

        // 3. Mark models no longer in manifest as deprecated
        for (local in modelRegistryDao.getAll()) {
            if (local.modelId !in manifestIds && local.status != "error") {
                modelRegistryDao.upsert(local.copy(status = "error"))
            }
        }

        // 4. Emit updated installedModels flow
        refreshInstalledModels()
        return modelsNeedingDownload
    }

    /**
     * Download a model file from the control server or CDN.
     *
     * @param modelId    The model identifier from the manifest.
     * @param onProgress Callback with download progress [0.0, 1.0].
     * @return The downloaded [File].
     */
    /**
     * Download a model file from the control server or CDN.
     *
     * @param modelId    The model identifier from the manifest.
     * @param onProgress Callback with download progress [0.0, 1.0].
     * @return The downloaded [File].
     */
    suspend fun downloadModel(
        modelId: String,
        onProgress: (Float) -> Unit,
    ): File = withContext(Dispatchers.IO) {
        // 1. Get model metadata from registry
        val meta = modelRegistryDao.get(modelId)
            ?: throw IllegalStateException("Model $modelId not found in registry. Run syncModelManifest first.")

        // 2. Check free storage > fileSizeBytes * 2
        val freeBytes = File(context.filesDir, "models").parentFile?.freeSpace
            ?: throw IllegalStateException("Cannot query free storage space")
        if (freeBytes < meta.fileSizeBytes * 2) {
            throw IllegalStateException(
                "Insufficient storage: need ${meta.fileSizeBytes * 2} bytes, have $freeBytes bytes"
            )
        }

        // 3. Prepare directories
        val downloadDir = File(context.filesDir, "models/downloading")
        downloadDir.mkdirs()
        val tempFile = File(downloadDir, "$modelId.gguf.part")
        val modelDir = File(context.filesDir, "models/$modelId")
        val destFile = File(modelDir, "$modelId.gguf")

        // 4. Build download URL
        val downloadUrl = "https://models.phonefarm.local/api/v1/models/$modelId/download"

        // 5. Download with Range header support for resume
        val existingBytes = if (tempFile.exists()) tempFile.length() else 0L
        val requestBuilder = Request.Builder()
            .url(downloadUrl)
            .get()

        if (existingBytes > 0) {
            requestBuilder.header("Range", "bytes=$existingBytes-")
        }

        val request = requestBuilder.build()
        val response = okHttpClient.newCall(request).execute()

        if (!response.isSuccessful && response.code != 206) {
            throw IllegalStateException("Download failed: HTTP ${response.code} ${response.message}")
        }

        val body = response.body ?: throw IllegalStateException("Empty response body")
        val totalSize = if (response.code == 206) {
            // Partial content: Content-Range gives total size
            val contentRange = response.header("Content-Range")
            if (contentRange != null) {
                contentRange.substringAfter("/").toLongOrNull() ?: meta.fileSizeBytes
            } else {
                meta.fileSizeBytes
            }
        } else {
            body.contentLength().takeIf { it > 0 } ?: meta.fileSizeBytes
        }

        // 6. Stream download with progress (append mode if resuming)
        val sink = tempFile.sink(append = existingBytes > 0).buffer()
        val source = body.source()

        var downloaded = existingBytes
        val buffer = okio.Buffer()
        var bytesRead: Long
        while (source.read(buffer, 8192).also { bytesRead = it } != -1L) {
            sink.write(buffer, bytesRead)
            downloaded += bytesRead
            onProgress(downloaded.toFloat() / totalSize.toFloat().coerceAtLeast(1f))
            // Update registry with downloaded bytes
            modelRegistryDao.upsert(meta.copy(
                status = "downloading",
                downloadedBytes = downloaded,
            ))
        }
        sink.flush()
        sink.close()
        source.close()
        body.close()

        // 7. Verify SHA-256 checksum (if available from manifest)
        val actualSha256 = computeSha256(tempFile)
        val expectedSha256 = apiService.getLocalModelManifest()
            .firstOrNull { it.modelId == modelId }?.sha256

        if (expectedSha256 != null && actualSha256 != expectedSha256) {
            tempFile.delete()
            modelRegistryDao.upsert(meta.copy(
                status = "error",
                downloadedBytes = 0,
            ))
            throw IllegalStateException(
                "SHA-256 checksum mismatch for $modelId. Expected $expectedSha256, got $actualSha256"
            )
        }

        // 8. Move from downloading/ to models/{modelId}/
        modelDir.mkdirs()
        tempFile.renameTo(destFile)
        tempFile.delete()

        // 9. Update registry
        modelRegistryDao.upsert(meta.copy(
            status = "ready",
            filePath = destFile.absolutePath,
            downloadedBytes = totalSize,
            installedAt = System.currentTimeMillis(),
        ))

        refreshInstalledModels()
        return@withContext destFile
    }

    /**
     * Load a model into memory via llama.cpp JNI.
     *
     * @param modelId The registered model ID to load.
     * @return The native pointer (llama_model*) for inference.
     */
    /**
     * Load a model into memory via llama.cpp JNI.
     *
     * In the full implementation this calls JNI (llama_model_load). For now
     * we verify the .gguf file exists on disk, mark the model as loaded
     * in the registry, and return a hash code as the model pointer.
     *
     * @param modelId The registered model ID to load.
     * @return The native pointer (llama_model*) for inference.
     */
    suspend fun loadModel(modelId: String): Long {
        // 1. Get model file path from registry
        val meta = modelRegistryDao.get(modelId)
            ?: throw IllegalStateException("Model $modelId not found in registry")

        val filePath = meta.filePath
            ?: throw IllegalStateException("Model $modelId has no file path — download it first")

        // 2. Verify .gguf file exists on disk
        val modelFile = File(filePath)
        if (!modelFile.exists()) {
            modelRegistryDao.upsert(meta.copy(status = "error", filePath = null))
            throw IllegalStateException("Model file not found on disk: $filePath")
        }

        // 3. Generate a model pointer (hash code as placeholder for JNI pointer).
        //    In production, this calls: LlamaNative.loadModel(filePath, backend, nGpuLayers)
        val pointer = modelFile.absolutePath.hashCode().toLong() and 0xFFFFFFFFL

        // 4. Track in loadedModels map
        loadedModels[modelId] = pointer

        // 5. Update registry status
        modelRegistryDao.upsert(meta.copy(status = "loaded"))

        // 6. Refresh UI state
        refreshInstalledModels()
        return pointer
    }

    /**
     * Unload a model from memory (free GPU/NPU/RAM).
     *
     * @param modelId The model ID to unload.
     */
    /**
     * Unload a model from memory (free GPU/NPU/RAM).
     *
     * @param modelId The model ID to unload.
     */
    suspend fun unloadModel(modelId: String) {
        // 1. Get native pointer from loaded map
        val pointer = loadedModels.remove(modelId)
            ?: run {
                // Not currently loaded — update status to "ready" and return
                val meta = modelRegistryDao.get(modelId)
                if (meta != null && meta.status == "loaded") {
                    modelRegistryDao.upsert(meta.copy(status = "ready"))
                    refreshInstalledModels()
                }
                return
            }

        // 2. Release native resources.
        //    In production: LlamaNative.freeModel(pointer)
        Log.d(TAG, "Unloading model $modelId (ptr=$pointer)")

        // 3. already removed from loadedModels map above

        // 4. Update registry status
        val meta = modelRegistryDao.get(modelId)
        if (meta != null) {
            modelRegistryDao.upsert(meta.copy(status = "ready"))
        }

        refreshInstalledModels()
    }

    /**
     * Delete a model file and its registry entry.
     *
     * Model must be unloaded before deletion.
     *
     * @param modelId The model ID to delete.
     * @return true if deleted successfully, false on error.
     */
    /**
     * Delete a model file and its registry entry.
     *
     * Model must be unloaded before deletion.
     *
     * @param modelId The model ID to delete.
     * @return true if deleted successfully, false on error.
     */
    suspend fun deleteModel(modelId: String): Boolean {
        // 1. Check model is not currently loaded
        if (loadedModels.containsKey(modelId)) {
            throw IllegalStateException(
                "Cannot delete model $modelId while it is loaded. Call unloadModel first."
            )
        }

        val meta = modelRegistryDao.get(modelId) ?: return false

        return try {
            // 2. Delete model directory from disk
            val filePath = meta.filePath
            if (filePath != null) {
                val modelFile = File(filePath)
                if (modelFile.exists()) {
                    modelFile.delete()
                }
            }
            // Also clean up the model directory and any partial downloads
            val modelDir = File(context.filesDir, "models/$modelId")
            if (modelDir.exists()) {
                modelDir.deleteRecursively()
            }
            val tempFile = File(context.filesDir, "models/downloading/$modelId.gguf.part")
            if (tempFile.exists()) {
                tempFile.delete()
            }

            // 3. Delete record from registry
            modelRegistryDao.delete(modelId)

            // 4. Emit updated installedModels flow
            refreshInstalledModels()
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete model $modelId", e)
            false
        }
    }

    /**
     * Check device hardware capabilities for local model inference.
     *
     * Evaluates RAM, GPU, NPU availability and returns a recommendation
     * for the best model + backend combination.
     */
    /**
     * Check device hardware capabilities for local model inference.
     *
     * Evaluates RAM, GPU, NPU availability and returns a recommendation
     * for the best model + backend combination.
     */
    fun checkDeviceCapability(): DeviceCapability {
        val warnings = mutableListOf<String>()

        // 1. Total RAM via ActivityManager.MemoryInfo
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)
        val totalRamMb = memInfo.totalMem / (1024 * 1024)
        val availableRamMb = memInfo.availMem / (1024 * 1024)

        if (totalRamMb < 4096) {
            warnings.add("Low RAM: ${totalRamMb}MB. 4GB+ recommended for local models.")
        }

        // 2. Free storage via StatFs on internal storage
        val statFs = StatFs(Environment.getDataDirectory().absolutePath)
        val freeStorageMb = statFs.availableBlocksLong * statFs.blockSizeLong / (1024 * 1024)
        if (freeStorageMb < 4096) {
            warnings.add("Low storage: ${freeStorageMb}MB free. 4GB+ free recommended.")
        }

        // 3. GPU info from Build.HARDWARE
        val gpuModel = Build.HARDWARE ?: "unknown"

        // 4. Detect the best backend
        val bestBackend = InferenceBackendDetector.detectBestBackend(context)

        // 5. Vulkan availability
        val vulkanAvailable = context.packageManager
            .hasSystemFeature(android.content.pm.PackageManager.FEATURE_VULKAN_HARDWARE_COMPUTE)

        // 6. NNAPI availability
        val nnapiAvailable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1

        // 7. NPU detection
        val npuAvailable = bestBackend == InferenceBackend.QCOM_QNN
            || bestBackend == InferenceBackend.MTK_NEUROPILOT
            || bestBackend == InferenceBackend.HUAWEI_HIAI

        // 8. Determine whether local inference is feasible
        val supportsLocalModel = totalRamMb >= 4096 && (npuAvailable || vulkanAvailable || nnapiAvailable)
        if (!supportsLocalModel && totalRamMb >= 4096) {
            warnings.add("No NPU/GPU accelerator detected. Inference will use CPU fallback.")
        }

        // 9. Recommend model based on available RAM
        val recommendedModel = when {
            totalRamMb >= 8192 && npuAvailable -> "autoglm-phone-9b-q5_k_m"
            totalRamMb >= 8192 -> "autoglm-phone-9b-q4_k_m"
            totalRamMb >= 6144 -> "qwen3-vl-4b-q4_k_m"
            totalRamMb >= 4096 -> "qwen3-vl-2b-q4_k_m"
            else -> "autoglm-phone-9b-q4_k_m" // falls back to cloud inference
        }

        return DeviceCapability(
            supportsLocalModel = supportsLocalModel,
            recommendedModel = recommendedModel,
            bestBackend = bestBackend,
            totalRamMb = totalRamMb,
            availableRamMb = availableRamMb,
            freeStorageMb = freeStorageMb,
            gpuModel = gpuModel,
            npuAvailable = npuAvailable,
            vulkanAvailable = vulkanAvailable,
            nnapiAvailable = nnapiAvailable,
            warnings = warnings,
        )
    }

    // ---- helpers ----

    /**
     * Refresh the [installedModels] StateFlow from the current DAO state.
     */
    private suspend fun refreshInstalledModels() {
        val entities = modelRegistryDao.getAll()
        _installedModels.value = entities.map { it.toLocalModelInfo() }
    }

    /**
     * Compute the SHA-256 hex digest of a file.
     */
    private fun computeSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { fis ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (fis.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val TAG = "ModelManager"
    }
}

/**
 * Convert a [ModelRegistryEntity] DAO record into a UI-facing [LocalModelInfo].
 */
private fun ModelRegistryEntity.toLocalModelInfo(): LocalModelInfo = LocalModelInfo(
    modelId = modelId,
    displayName = displayName,
    version = version,
    quantization = quantization,
    fileSizeBytes = fileSizeBytes,
    downloadedBytes = downloadedBytes,
    minRamMb = minRamMb,
    status = status,
    filePath = filePath,
    backend = backend,
    isRecommended = false, // updated externally by checkDeviceCapability
)
