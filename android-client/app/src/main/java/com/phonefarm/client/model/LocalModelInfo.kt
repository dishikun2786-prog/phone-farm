package com.phonefarm.client.model

/**
 * UI-facing representation of a locally installed AI model.
 *
 * Transformed from [com.phonefarm.client.data.local.entity.ModelRegistryEntity]
 * for display in the model management screen.
 */
data class LocalModelInfo(
    /** Unique model identifier (e.g., "autoglm-phone-9b-q4_k_m"). */
    val modelId: String,

    /** Human-readable display name (e.g., "AutoGLM-Phone 9B"). */
    val displayName: String,

    /** Model version string. */
    val version: String,

    /** Quantization level (e.g., "Q4_K_M", "Q5_K_M", "Q8_0"). */
    val quantization: String?,

    /** File size in bytes. */
    val fileSizeBytes: Long,

    /** Downloaded bytes (only relevant during download). */
    val downloadedBytes: Long,

    /** Minimum RAM required in megabytes. */
    val minRamMb: Int,

    /** Current status: not_downloaded, downloading, ready, loaded, error. */
    val status: String,

    /** File path to the .gguf model file, null if not downloaded. */
    val filePath: String?,

    /** The inference backend this model was optimized for. */
    val backend: String?,

    /** Whether this model is recommended for the current device. */
    val isRecommended: Boolean,
)
