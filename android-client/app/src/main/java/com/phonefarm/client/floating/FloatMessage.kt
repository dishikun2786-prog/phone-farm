package com.phonefarm.client.floating

data class FloatMessage(
    val id: String,
    val role: String,
    val type: String,
    val content: String,
    val timestamp: Long,
)

data class TaskSummary(
    val episodeId: String,
    val taskPrompt: String,
    val totalSteps: Int,
    val modelName: String,
    val durationMs: Long,
    val success: Boolean,
)
