package com.phonefarm.client.assistant

import android.os.Build
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.UUID
import javax.inject.Inject

/**
 * ViewModel for the AI Assistant full-screen chat UI.
 *
 * Manages chat messages, Brain Agent orchestration, credit balance,
 * and session lifecycle. Follows the same pattern as [FloatChatViewModel].
 */
@HiltViewModel
class AssistantViewModel @Inject constructor(
    private val brainAgent: BrainAgent,
    private val brainLlmClient: BrainLlmClient,
    private val creditManager: CreditManager,
) : ViewModel() {

    private var deviceId: String = Build.MODEL ?: "android-device"

    // ── Chat messages ──
    private val _messages = MutableStateFlow<List<ChatUiMessage>>(emptyList())
    val messages: StateFlow<List<ChatUiMessage>> = _messages.asStateFlow()

    // ── Brain agent state ──
    val brainState: StateFlow<BrainState> = brainAgent.state

    // ── Current step ──
    val currentStep: StateFlow<BrainStep?> = brainAgent.currentStep

    // ── Credit balance ──
    val creditBalance: StateFlow<Int> = creditManager.balance

    // ── Input state ──
    private val _isListening = MutableStateFlow(false)
    val isListening: StateFlow<Boolean> = _isListening.asStateFlow()

    private val _showOnboarding = MutableStateFlow(false)
    val showOnboarding: StateFlow<Boolean> = _showOnboarding.asStateFlow()

    private var isExecuting = false

    init {
        viewModelScope.launch {
            creditManager.refresh()
        }
    }

    fun setDeviceId(id: String) {
        deviceId = id
    }

    /** Send a user message and start the Brain Agent. */
    fun sendMessage(text: String) {
        if (isExecuting || text.isBlank()) return

        // Add user message
        val userMsg = ChatUiMessage(
            id = UUID.randomUUID().toString(),
            role = "user",
            content = text,
            timestamp = System.currentTimeMillis(),
        )
        addMessage(userMsg)

        // Add placeholder for agent response
        val thinkingMsg = ChatUiMessage(
            id = UUID.randomUUID().toString(),
            role = "ai",
            content = "Thinking...",
            isThinking = true,
            timestamp = System.currentTimeMillis(),
        )
        addMessage(thinkingMsg)

        isExecuting = true

        viewModelScope.launch {
            try {
                brainAgent.execute(text, deviceId).collect { step ->
                    onBrainStep(step, thinkingMsg.id)
                }
                onTaskComplete()
            } catch (e: kotlinx.coroutines.CancellationException) {
                onTaskError("Cancelled")
            } catch (e: Exception) {
                onTaskError(e.message ?: "Unknown error")
            }
        }
    }

    /** Send the user's answer to a pending AskUser question. */
    fun sendAnswer(answer: String) {
        if (isExecuting || answer.isBlank()) return

        val userMsg = ChatUiMessage(
            id = UUID.randomUUID().toString(),
            role = "user",
            content = answer,
            timestamp = System.currentTimeMillis(),
        )
        addMessage(userMsg)

        val thinkingMsg = ChatUiMessage(
            id = UUID.randomUUID().toString(),
            role = "ai",
            content = "Thinking...",
            isThinking = true,
            timestamp = System.currentTimeMillis(),
        )
        addMessage(thinkingMsg)

        isExecuting = true

        viewModelScope.launch {
            try {
                brainAgent.continueWithAnswer(answer, deviceId).collect { step ->
                    onBrainStep(step, thinkingMsg.id)
                }
                onTaskComplete()
            } catch (e: Exception) {
                onTaskError(e.message ?: "Unknown error")
            }
        }
    }

    /** Stop the current agent execution. */
    fun stopExecution() {
        brainAgent.stop()
        isExecuting = false
        addSystemMessage("Stopped")
    }

    /** Refresh credit balance. */
    fun refreshCredits() {
        viewModelScope.launch { creditManager.refresh() }
    }

    /** Dismiss onboarding dialog. */
    fun dismissOnboarding() {
        _showOnboarding.value = false
    }

    /** Show onboarding for first-time users. */
    fun showOnboardingIfNeeded() {
        // Show onboarding on first launch
        _showOnboarding.value = true
    }

    override fun onCleared() {
        super.onCleared()
    }

    // ── Internal ──

    private fun addMessage(msg: ChatUiMessage) {
        _messages.value = _messages.value + msg
    }

    private fun addSystemMessage(content: String) {
        addMessage(ChatUiMessage(
            id = UUID.randomUUID().toString(),
            role = "system",
            content = content,
            timestamp = System.currentTimeMillis(),
        ))
    }

    private fun onBrainStep(step: BrainStep, thinkingMsgId: String) {
        // Replace thinking indicator with actual content on first real step
        _messages.value = _messages.value.map { msg ->
            if (msg.id == thinkingMsgId && msg.isThinking) {
                msg.copy(isThinking = false, content = buildStepContent(step))
            } else msg
        }

        // Add observation messages for subsequent steps
        if (step.phase == StepPhase.OBSERVE && step.observation != null) {
            addMessage(ChatUiMessage(
                id = UUID.randomUUID().toString(),
                role = "ai",
                content = step.observation,
                stepData = step,
                timestamp = System.currentTimeMillis(),
            ))
        }
    }

    private fun buildStepContent(step: BrainStep): String = buildString {
        append(when (step.phase) {
            StepPhase.PLAN -> "Planning: "
            StepPhase.THINK -> ""
            StepPhase.ACT -> "Acting: "
            StepPhase.OBSERVE -> "Observed: "
            StepPhase.COMPLETE -> "Done: "
            StepPhase.ERROR -> "Error: "
        })
        append(step.thought)
        if (step.action is BrainAction.DelegateToVision) {
            append("\n\nDelegating to Phone Agent: ${step.action.goal}")
        }
    }

    private fun onTaskComplete() {
        isExecuting = false
        // Remove any lingering thinking indicators
        _messages.value = _messages.value.filter { !it.isThinking }
    }

    private fun onTaskError(message: String) {
        isExecuting = false
        _messages.value = _messages.value.filter { !it.isThinking }
        addSystemMessage("Error: $message")
    }
}

// ── UI Message Model ──

data class ChatUiMessage(
    val id: String,
    val role: String, // "user", "ai", "system"
    val content: String,
    val isThinking: Boolean = false,
    val stepData: BrainStep? = null,
    val timestamp: Long,
)
