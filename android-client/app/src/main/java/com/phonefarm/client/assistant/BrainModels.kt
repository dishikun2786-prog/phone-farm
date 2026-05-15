package com.phonefarm.client.assistant

import kotlinx.serialization.Serializable

/**
 * Domain models for the Brain Agent — function-calling LLM interaction.
 *
 * Wire-format request/response types live in [com.phonefarm.client.network.ApiService]
 * to avoid duplication. This file contains only the domain-level types used
 * by [BrainAgent] and [BrainLlmClient] internally.
 */

// ── Function Calling ──

@Serializable
data class FunctionDef(
    val name: String,
    val description: String,
    val parameters: Map<String, Any>? = null,
)

@Serializable
data class ToolCall(
    val id: String,
    val function: FunctionCall,
)

@Serializable
data class FunctionCall(
    val name: String,
    val arguments: String, // JSON string
)

// ── Brain Agent State ──

sealed class BrainState {
    object Idle : BrainState()
    object Planning : BrainState()
    object Executing : BrainState()
    object WaitingForVision : BrainState()
    data class Completed(val summary: String) : BrainState()
    data class Error(val message: String) : BrainState()
}

// ── Brain Step (observable progress) ──

data class BrainStep(
    val stepNum: Int,
    val phase: StepPhase,
    val thought: String,
    val action: BrainAction? = null,
    val observation: String? = null,
    val toolCall: ToolCall? = null,
)

enum class StepPhase {
    PLAN, THINK, ACT, OBSERVE, COMPLETE, ERROR
}

// ── Brain Actions (high-level, translated to device actions by Phone Agent) ──

sealed class BrainAction {
    /** Delegate screen understanding and low-level action to Phone Agent (QwenVL). */
    data class DelegateToVision(
        val goal: String,
        val context: String = "",
    ) : BrainAction()

    /** Execute a scripted sequence of device actions directly. */
    data class ExecuteActions(
        val actions: List<DeviceActionDesc>,
        val reason: String,
    ) : BrainAction()

    /** Ask the user a question (shown in chat). */
    data class AskUser(
        val question: String,
        val options: List<String> = emptyList(),
    ) : BrainAction()

    /** Task is complete. */
    data class CompleteTask(
        val summary: String,
    ) : BrainAction()

    /** Task failed / cannot continue. */
    data class FailTask(
        val reason: String,
    ) : BrainAction()
}

@Serializable
data class DeviceActionDesc(
    val type: String, // tap, long_press, swipe, type, back, home, launch, wait
    val x: Int? = null,
    val y: Int? = null,
    val x2: Int? = null,
    val y2: Int? = null,
    val text: String? = null,
    val packageName: String? = null,
    val durationMs: Long? = null,
)
