package com.phonefarm.client.vlm

/**
 * VLM provider configuration for cloud/local/auto inference routing.
 */
data class VlmProviderConfig(
    val mode: VlmMode,
    val cloudConfig: CloudVlmConfig?,
    val localModelId: String?,
    val fallbackMode: VlmMode,
    val maxLocalSteps: Int,
    val historyLength: Int,
    val traceEnabled: Boolean,
)

/**
 * Cloud VLM connection and inference parameters.
 */
data class CloudVlmConfig(
    val provider: String,
    val apiBase: String,
    val apiKey: String,
    val modelName: String,
    val maxSteps: Int,
    val temperature: Float,
    val maxTokens: Int,
    val promptTemplateStyle: String,
    val coordinateSystem: String,
)

/**
 * Inference mode selection.
 *
 * [CLOUD] — send screenshot + prompt to remote VLM API.
 * [LOCAL] — run inference via on-device model (llama.cpp JNI).
 * [AUTO]  — try local first, fall back to cloud on failure.
 */
enum class VlmMode {
    CLOUD,
    LOCAL,
    AUTO,
}
