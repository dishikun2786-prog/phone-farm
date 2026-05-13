package com.phonefarm.client.model

import android.content.Context
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Model hot-update system for on-device AI models (NCNN YOLO, NCNN OCR, MNN Qwen, MNN Phi).
 *
 * Responsibilities:
 *  - Check server for updated model versions (with conditional GET via ETag/If-None-Match)
 *  - Download model files with progress tracking and resume support
 *  - Verify downloaded files with SHA-256 integrity check
 *  - Manage active model paths for each model type
 *
 * Models are stored in app internal storage under: models/{type}/{version}/
 * Active version metadata is tracked in a local JSON manifest.
 *
 * @property updateState Current hot-update state for UI binding.
 * @property activeModels Map of model type to its active version string.
 */
@Singleton
class ModelHotUpdate @Inject constructor(
    @ApplicationContext private val context: Context,
    private val okHttpClient: OkHttpClient,
) {

    companion object {
        private const val TAG = "ModelHotUpdate"
        private const val MODELS_DIR = "models"
        private const val MANIFEST_FILE = "model_manifest.json"
        private const val DOWNLOAD_BUFFER_SIZE = 8192
        private const val MAX_RETRIES = 3
    }

    // ── State ──

    data class UpdateState(
        val isChecking: Boolean = false,
        val availableUpdates: List<ModelUpdate> = emptyList(),
        val activeDownloads: Map<String, DownloadProgress> = emptyMap(),
        val lastCheckTimeMs: Long = 0L,
        val error: String? = null,
    )

    data class DownloadProgress(
        val modelType: ModelType,
        val version: String,
        val progress: Float,           // 0.0–1.0
        val downloadedBytes: Long,
        val totalBytes: Long,
        val bytesPerSecond: Long,
        val status: DownloadStatus,
    )

    enum class DownloadStatus {
        QUEUED,
        DOWNLOADING,
        RESUMING,
        VERIFYING,
        COMPLETED,
        FAILED,
    }

    // ── Model type enum ──

    enum class ModelType(val dirName: String, val displayName: String) {
        NCNN_YOLO("ncnn_yolo", "NCNN YOLO Object Detection"),
        NCNN_OCR("ncnn_ocr", "NCNN OCR Text Recognition"),
        MNN_QWEN("mnn_qwen", "MNN Qwen2 0.5B LLM"),
        MNN_PHI("mnn_phi", "MNN Phi-2 LLM"),
    }

    // ── Model update descriptor ──

    data class ModelUpdate(
        val type: ModelType,
        val version: String,
        val url: String,
        val sha256: String,
        val sizeBytes: Long,
        val releaseNotes: String? = null,
        val minSdkVersion: Int = 0,
        val required: Boolean = false,
    )

    // ── Internal state ──

    private val _updateState = MutableStateFlow(UpdateState())
    val updateState: StateFlow<UpdateState> = _updateState.asStateFlow()

    /** Cached active model versions, loaded from manifest. */
    private val _activeVersions = MutableStateFlow<Map<ModelType, String>>(emptyMap())

    /** Base URL for model updates (configured at runtime). */
    private var baseUrl: String = ""

    /** Last ETag values per model type for conditional GET. */
    private val etagCache = mutableMapOf<ModelType, String>()

    /** Last-Modified values per model type for conditional GET. */
    private val lastModifiedCache = mutableMapOf<ModelType, String>()

    /** Track download start times for speed calculation. */
    private val downloadStartTimes = mutableMapOf<String, Long>()

    /** Track bytes downloaded at last speed check. */
    private val lastSpeedCheckBytes = mutableMapOf<String, Long>()
    private val lastSpeedCheckTimes = mutableMapOf<String, Long>()

    /** Models root directory. */
    private val modelsDir: File
        get() = File(context.filesDir, MODELS_DIR).also { it.mkdirs() }

    /** Manifest file. */
    private val manifestFile: File
        get() = File(modelsDir, MANIFEST_FILE)

    // ── Public API ──

    /**
     * Set the base URL for the model update server.
     *
     * @param url The base URL (e.g., "https://models.phonefarm.example.com")
     */
    fun setBaseUrl(url: String) {
        baseUrl = url.trimEnd('/')
    }

    /**
     * Check the server for available model updates.
     *
     * Uses conditional GET headers (If-None-Match, If-Modified-Since) to avoid
     * re-downloading metadata when nothing changed.
     *
     * @return List of available [ModelUpdate] items, empty if all up-to-date.
     */
    suspend fun checkForUpdates(): List<ModelUpdate> = withContext(Dispatchers.IO) {
        if (baseUrl.isBlank()) {
            val msg = "Base URL not set. Call setBaseUrl() first."
            Log.e(TAG, msg)
            _updateState.value = _updateState.value.copy(error = msg)
            return@withContext emptyList()
        }

        _updateState.value = _updateState.value.copy(
            isChecking = true, error = null
        )

        try {
            val updates = mutableListOf<ModelUpdate>()
            val activeVersions = loadActiveVersions()

            for (modelType in ModelType.entries) {
                val modelUpdate = fetchModelMetadata(modelType, activeVersions[modelType])
                if (modelUpdate != null) {
                    updates.add(modelUpdate)
                }
            }

            _updateState.value = _updateState.value.copy(
                isChecking = false,
                availableUpdates = updates,
                lastCheckTimeMs = System.currentTimeMillis(),
            )

            Log.d(TAG, "Check complete: ${updates.size} updates available")
            updates
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check for updates", e)
            _updateState.value = _updateState.value.copy(
                isChecking = false,
                error = "Update check failed: ${e.message}",
            )
            emptyList()
        }
    }

    /**
     * Download a model update with progress reporting and resume support.
     *
     * @param update The model update to download.
     * @param onProgress Optional callback receiving progress 0.0–1.0.
     * @return true if download and verification succeeded.
     */
    suspend fun downloadModel(
        update: ModelUpdate,
        onProgress: (Float) -> Unit = {},
    ): Boolean = withContext(Dispatchers.IO) {
        val downloadKey = "${update.type.name}_${update.version}"
        val existingProgress = _updateState.value.activeDownloads[downloadKey]
        val existingBytes = existingProgress?.downloadedBytes ?: 0L

        val progress = DownloadProgress(
            modelType = update.type,
            version = update.version,
            progress = if (existingBytes > 0) existingBytes.toFloat() / update.sizeBytes else 0f,
            downloadedBytes = existingBytes,
            totalBytes = update.sizeBytes,
            bytesPerSecond = 0L,
            status = if (existingBytes > 0) DownloadStatus.RESUMING else DownloadStatus.DOWNLOADING,
        )

        updateDownloadState(downloadKey, progress)

        val targetDir = getModelVersionDir(update.type, update.version)
        targetDir.mkdirs()

        val modelFile = File(targetDir, getModelFileName(update.type))

        try {
            var retries = 0
            var success = false

            while (retries < MAX_RETRIES && !success) {
                try {
                    downloadFile(
                        url = update.url,
                        targetFile = modelFile,
                        expectedSize = update.sizeBytes,
                        downloadKey = downloadKey,
                        onProgress = { prog ->
                            onProgress(prog)
                            updateDownloadProgress(downloadKey, update.type, update.version, update.sizeBytes)
                        },
                    )

                    // Verify integrity
                    updateDownloadState(downloadKey, progress.copy(status = DownloadStatus.VERIFYING))
                    val verified = verifyModel(modelFile, update.sha256)

                    if (!verified) {
                        Log.w(TAG, "SHA-256 verification failed for ${update.type.name} v${update.version}, attempt ${retries + 1}")
                        modelFile.delete()
                        retries++
                        if (retries < MAX_RETRIES) {
                            // Reset download state for retry
                            updateDownloadState(downloadKey, progress.copy(
                                downloadedBytes = 0L,
                                progress = 0f,
                                status = DownloadStatus.DOWNLOADING,
                            ))
                        }
                        continue
                    }

                    success = true
                } catch (e: Exception) {
                    Log.w(TAG, "Download attempt ${retries + 1} failed for ${update.type.name}: ${e.message}")
                    retries++
                    if (retries >= MAX_RETRIES) throw e
                }
            }

            if (success) {
                // Update manifest
                updateManifest(update.type, update.version)

                val finalProgress = progress.copy(
                    downloadedBytes = update.sizeBytes,
                    progress = 1f,
                    status = DownloadStatus.COMPLETED,
                )
                updateDownloadState(downloadKey, finalProgress)

                Log.d(TAG, "Download complete: ${update.type.name} v${update.version}")
            }

            success
        } catch (e: Exception) {
            Log.e(TAG, "Download failed for ${update.type.name} v${update.version}", e)

            // Preserve partial download for resume
            val currentSize = if (modelFile.exists()) modelFile.length() else 0L
            val failedProgress = progress.copy(
                downloadedBytes = currentSize,
                progress = if (update.sizeBytes > 0) currentSize.toFloat() / update.sizeBytes else 0f,
                status = DownloadStatus.FAILED,
            )
            updateDownloadState(downloadKey, failedProgress)

            false
        }
    }

    /**
     * Verify a downloaded model file against its expected SHA-256 hash.
     *
     * @param file The model file to verify.
     * @param expectedSha256 The expected SHA-256 hex digest.
     * @return true if the hash matches.
     */
    suspend fun verifyModel(file: File, expectedSha256: String): Boolean = withContext(Dispatchers.IO) {
        if (!file.exists() || !file.isFile) {
            Log.e(TAG, "Cannot verify: file does not exist: ${file.absolutePath}")
            return@withContext false
        }

        try {
            val actualHash = computeSha256(file)
            val matches = actualHash.equals(expectedSha256, ignoreCase = true)
            if (!matches) {
                Log.e(TAG, "SHA-256 mismatch for ${file.name}: expected=$expectedSha256 actual=$actualHash")
            }
            matches
        } catch (e: Exception) {
            Log.e(TAG, "Verification error for ${file.name}", e)
            false
        }
    }

    /**
     * Get the active model file path for a given model type.
     *
     * @param modelType The model type.
     * @return Path to the active model file, or null if not downloaded.
     */
    fun getActiveModelPath(modelType: ModelType): String? {
        val activeVersions = loadActiveVersions()
        val version = activeVersions[modelType] ?: return null
        val modelFile = File(getModelVersionDir(modelType, version), getModelFileName(modelType))
        return if (modelFile.exists()) modelFile.absolutePath else null
    }

    /**
     * Get the active version string for a model type.
     *
     * @param modelType The model type.
     * @return Version string, or null if never downloaded.
     */
    fun getActiveVersion(modelType: ModelType): String? {
        return loadActiveVersions()[modelType]
    }

    /**
     * List all downloaded versions for a model type.
     *
     * @param modelType The model type.
     * @return List of version directories, sorted newest first.
     */
    fun listDownloadedVersions(modelType: ModelType): List<String> {
        val typeDir = File(modelsDir, modelType.dirName)
        if (!typeDir.exists() || !typeDir.isDirectory) return emptyList()

        return typeDir.listFiles()
            ?.filter { it.isDirectory }
            ?.map { it.name }
            ?.sortedDescending()
            ?: emptyList()
    }

    /**
     * Get total disk usage by downloaded models in bytes.
     */
    fun getTotalDiskUsage(): Long {
        return modelsDir.walkTopDown()
            .filter { it.isFile }
            .sumOf { it.length() }
    }

    /**
     * Delete a specific model version.
     *
     * @param modelType The model type.
     * @param version The version to delete.
     * @return true if deleted.
     */
    fun deleteModelVersion(modelType: ModelType, version: String): Boolean {
        val versionDir = getModelVersionDir(modelType, version)
        if (!versionDir.exists()) return false

        val deleted = versionDir.deleteRecursively()

        // If we deleted the active version, update manifest
        if (deleted) {
            val activeVersions = loadActiveVersions().toMutableMap()
            if (activeVersions[modelType] == version) {
                // Fall back to next newest version, or remove key
                val remaining = listDownloadedVersions(modelType)
                if (remaining.isNotEmpty()) {
                    activeVersions[modelType] = remaining.first()
                } else {
                    activeVersions.remove(modelType)
                }
                saveActiveVersions(activeVersions)
            }
        }

        return deleted
    }

    /**
     * Delete all models (factory reset).
     */
    fun deleteAllModels(): Boolean {
        return modelsDir.deleteRecursively().also { modelsDir.mkdirs() }
    }

    /**
     * Get available storage space for downloads.
     */
    fun getAvailableStorageBytes(): Long {
        return modelsDir.freeSpace
    }

    /**
     * Clear ETag and Last-Modified caches to force a full recheck.
     */
    fun clearCaches() {
        etagCache.clear()
        lastModifiedCache.clear()
        _updateState.value = _updateState.value.copy(lastCheckTimeMs = 0L)
    }

    // ── Private implementation ──

    /**
     * Fetch metadata for a single model type from the server.
     *
     * Endpoint: {baseUrl}/api/v1/models/{type}/latest
     * Returns JSON: {"version":"1.2.0","url":"...","sha256":"...","size_bytes":12345}
     */
    private suspend fun fetchModelMetadata(
        modelType: ModelType,
        currentVersion: String?,
    ): ModelUpdate? = withContext(Dispatchers.IO) {
        val url = "$baseUrl/api/v1/models/${modelType.dirName}/latest"
        val requestBuilder = Request.Builder().url(url)

        // Conditional GET headers
        etagCache[modelType]?.let { requestBuilder.header("If-None-Match", it) }
        lastModifiedCache[modelType]?.let { requestBuilder.header("If-Modified-Since", it) }

        val request = requestBuilder.build()
        val response = okHttpClient.newCall(request).execute()

        response.use { resp ->
            // Cache ETag and Last-Modified
            resp.header("ETag")?.let { etagCache[modelType] = it }
            resp.header("Last-Modified")?.let { lastModifiedCache[modelType] = it }

            when {
                resp.code == 304 -> {
                    // Not modified — no update needed
                    Log.d(TAG, "Model ${modelType.name} is up-to-date (304)")
                    null
                }
                resp.code == 404 -> {
                    Log.d(TAG, "Model ${modelType.name} not found on server (404)")
                    null
                }
                resp.isSuccessful -> {
                    val body = resp.body?.string() ?: return@use null
                    val json = JSONObject(body)
                    val serverVersion = json.getString("version")

                    // Skip if same version already installed
                    if (serverVersion == currentVersion) {
                        Log.d(TAG, "Model ${modelType.name} v$serverVersion already installed")
                        return@use null
                    }

                    ModelUpdate(
                        type = modelType,
                        version = serverVersion,
                        url = json.getString("url"),
                        sha256 = json.getString("sha256"),
                        sizeBytes = json.getLong("size_bytes"),
                        releaseNotes = json.optString("release_notes", null),
                        minSdkVersion = json.optInt("min_sdk_version", 0),
                        required = json.optBoolean("required", false),
                    )
                }
                else -> {
                    Log.w(TAG, "Server returned ${resp.code} for ${modelType.name}")
                    null
                }
            }
        }
    }

    /**
     * Download a file from a URL with resume support.
     *
     * Implements HTTP Range header for resuming interrupted downloads.
     */
    @Throws(Exception::class)
    private fun downloadFile(
        url: String,
        targetFile: File,
        expectedSize: Long,
        downloadKey: String,
        onProgress: (Float) -> Unit,
    ) {
        val existingSize = if (targetFile.exists()) targetFile.length() else 0L
        val requestBuilder = Request.Builder().url(url)

        // Resume support: request remaining bytes if we have a partial file
        if (existingSize > 0 && existingSize < expectedSize) {
            requestBuilder.header("Range", "bytes=$existingSize-")
            Log.d(TAG, "Resuming download from byte $existingSize")
        }

        val request = requestBuilder.build()
        val response = okHttpClient.newCall(request).execute()

        response.use { resp ->
            if (!resp.isSuccessful && resp.code != 206) {
                // 206 Partial Content is expected for resumed downloads
                throw Exception("Download failed: HTTP ${resp.code}")
            }

            val body = resp.body ?: throw Exception("Empty response body")

            // For resumed downloads, append to file
            val outputStream = if (existingSize > 0 && resp.code == 206) {
                FileOutputStream(targetFile, true)
            } else {
                targetFile.delete()
                FileOutputStream(targetFile)
            }

            outputStream.use { output ->
                val input = body.byteStream()
                val buffer = ByteArray(DOWNLOAD_BUFFER_SIZE)
                var totalDownloaded = existingSize
                var bytesRead: Int

                downloadStartTimes.putIfAbsent(downloadKey, System.currentTimeMillis())
                lastSpeedCheckBytes.putIfAbsent(downloadKey, existingSize)
                lastSpeedCheckTimes.putIfAbsent(downloadKey, System.currentTimeMillis())

                while (input.read(buffer).also { bytesRead = it } != -1) {
                    output.write(buffer, 0, bytesRead)
                    totalDownloaded += bytesRead

                    // Update speed calculation every 500ms
                    val now = System.currentTimeMillis()
                    val lastCheckTime = lastSpeedCheckTimes[downloadKey] ?: now
                    if (now - lastCheckTime >= 500) {
                        val lastBytes = lastSpeedCheckBytes[downloadKey] ?: existingSize
                        val bytesSinceLastCheck = totalDownloaded - lastBytes
                        val timeSinceLastCheck = (now - lastCheckTime).coerceAtLeast(1)
                        val bps = bytesSinceLastCheck * 1000L / timeSinceLastCheck

                        val progress = updateDownloadProgress(
                            downloadKey,
                            null,
                            null,
                            expectedSize,
                            totalDownloaded,
                            bps,
                        )
                        onProgress(progress)

                        lastSpeedCheckBytes[downloadKey] = totalDownloaded
                        lastSpeedCheckTimes[downloadKey] = now
                    }
                }

                // Final progress
                val finalProgress = if (expectedSize > 0) {
                    totalDownloaded.toFloat() / expectedSize.toFloat()
                } else 1f
                onProgress(finalProgress.coerceIn(0f, 1f))
            }
        }
    }

    /**
     * Compute SHA-256 hash of a file.
     */
    private fun computeSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (input.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    /**
     * Get the expected model file name for a model type.
     */
    private fun getModelFileName(type: ModelType): String {
        return when (type) {
            ModelType.NCNN_YOLO -> "yolov8n.bin"
            ModelType.NCNN_OCR -> "ocr_model.bin"
            ModelType.MNN_QWEN -> "qwen2_05b.mnn"
            ModelType.MNN_PHI -> "phi2.mnn"
        }
    }

    /**
     * Get the storage directory for a specific model version.
     */
    private fun getModelVersionDir(type: ModelType, version: String): File {
        return File(File(modelsDir, type.dirName), version)
    }

    // ── Manifest management ──

    /**
     * Load active model versions from the manifest file.
     */
    private fun loadActiveVersions(): Map<ModelType, String> {
        return try {
            if (!manifestFile.exists()) return emptyMap()

            val content = manifestFile.readText()
            val json = JSONObject(content)
            val map = mutableMapOf<ModelType, String>()

            for (modelType in ModelType.entries) {
                val version = json.optString(modelType.name, null)
                if (!version.isNullOrBlank()) {
                    map[modelType] = version
                }
            }

            map
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load manifest: ${e.message}")
            emptyMap()
        }
    }

    /**
     * Update the manifest with a new active version for a model type.
     */
    private fun updateManifest(modelType: ModelType, version: String) {
        try {
            val current = loadActiveVersions().toMutableMap()
            current[modelType] = version
            saveActiveVersions(current)
            Log.d(TAG, "Manifest updated: ${modelType.name} → $version")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update manifest: ${e.message}")
        }
    }

    /**
     * Save active versions to manifest file.
     */
    private fun saveActiveVersions(versions: Map<ModelType, String>) {
        val json = JSONObject()
        for ((type, version) in versions) {
            json.put(type.name, version)
        }
        manifestFile.writeText(json.toString(2))
        _activeVersions.value = versions.toMap()
    }

    // ── Download state helpers ──

    private fun updateDownloadState(key: String, progress: DownloadProgress) {
        val current = _updateState.value.activeDownloads.toMutableMap()
        current[key] = progress
        if (progress.status == DownloadStatus.COMPLETED || progress.status == DownloadStatus.FAILED) {
            // Clean up speed tracking for completed/failed downloads
            downloadStartTimes.remove(key)
            lastSpeedCheckBytes.remove(key)
            lastSpeedCheckTimes.remove(key)
        }
        _updateState.value = _updateState.value.copy(activeDownloads = current)
    }

    private fun updateDownloadProgress(
        key: String,
        modelType: ModelType? = null,
        version: String? = null,
        totalBytes: Long,
        downloadedBytes: Long = -1L,
        bytesPerSecond: Long = 0L,
    ): Float {
        val progress = (downloadedBytes.toFloat() / totalBytes.toFloat()).coerceIn(0f, 1f)
        val current = _updateState.value.activeDownloads.toMutableMap()
        val existing = current[key] ?: DownloadProgress(
            modelType = modelType ?: return progress,
            version = version ?: return progress,
            progress = 0f,
            downloadedBytes = 0L,
            totalBytes = totalBytes,
            bytesPerSecond = 0L,
            status = DownloadStatus.DOWNLOADING,
        )

        current[key] = existing.copy(
            modelType = modelType ?: existing.modelType,
            version = version ?: existing.version,
            progress = progress,
            downloadedBytes = downloadedBytes,
            totalBytes = totalBytes,
            bytesPerSecond = bytesPerSecond,
            status = DownloadStatus.DOWNLOADING,
        )
        _updateState.value = _updateState.value.copy(activeDownloads = current)
        return progress
    }
}
