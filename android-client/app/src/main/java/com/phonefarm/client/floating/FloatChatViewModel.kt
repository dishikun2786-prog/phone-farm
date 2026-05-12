package com.phonefarm.client.floating

import android.os.Build
import com.phonefarm.client.data.local.dao.SavedScriptDao
import com.phonefarm.client.data.local.entity.FloatConversationEntity
import com.phonefarm.client.data.local.entity.SavedScriptEntity
import com.phonefarm.client.vlm.AgentState
import com.phonefarm.client.vlm.EpisodeRecorder
import com.phonefarm.client.vlm.ScriptCompiler
import com.phonefarm.client.vlm.VlmAgent
import com.phonefarm.client.vlm.VlmStep
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * ViewModel for the floating chat overlay.
 *
 * Orchestrates the full conversation lifecycle:
 *   - User sends a task (natural language) 鈫?starts VLM agent
 *   - Real-time step updates in the chat panel
 *   - Execution control: pause / resume / stop
 *   - Script saving after successful completion
 *   - Episode discard for failed tasks
 *
 * This is a @Singleton (not a ViewModel) because it lives inside a Service
 * (FloatWindowService) which does not have a ViewModelStoreOwner.
 */
@Singleton
class FloatChatViewModel @Inject constructor(
    private val vlmAgent: VlmAgent,
    private val episodeRecorder: EpisodeRecorder,
    private val scriptCompiler: ScriptCompiler,
    internal val quickChipManager: QuickChipManager,
    private val floatConversationRepo: FloatConversationRepo,
    private val savedScriptDao: SavedScriptDao,
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private var sessionId: String = UUID.randomUUID().toString()
    private var deviceId: String = Build.MODEL ?: "android-device"

    private val _messages = MutableStateFlow<List<FloatMessage>>(emptyList())
    val messages: StateFlow<List<FloatMessage>> = _messages.asStateFlow()

    private val _floatState = MutableStateFlow(FloatState.COLLAPSED)
    val floatState: StateFlow<FloatState> = _floatState.asStateFlow()

    val vlmState: StateFlow<AgentState> = vlmAgent.agentState

    private val _currentEpisodeId = MutableStateFlow<String?>(null)
    val currentEpisodeId: StateFlow<String?> = _currentEpisodeId.asStateFlow()

    private val _episodeSummary = MutableStateFlow<TaskSummary?>(null)
    val episodeSummary: StateFlow<TaskSummary?> = _episodeSummary.asStateFlow()

    private var episodeStartTime = 0L
    private var episodeTaskPrompt = ""
    private var episodeModelName = ""

    private var isExecuting = false

    init {
        // Observe agent state changes to update UI state
        scope.launch {
            vlmAgent.agentState.collect { state ->
                onAgentStateChanged(state)
            }
        }
        // Load persisted messages for the current session
        scope.launch {
            restoreMessages()
        }
    }

    // ---- Public API ----

    /**
     * Set the device ID used for VLM agent tasks.
     */
    fun setDeviceId(id: String) {
        deviceId = id
    }

    /**
     * Set the float UI state (called by the service on state transitions).
     */
    fun setFloatState(state: FloatState) {
        _floatState.value = state
    }

    /**
     * Send a natural-language task to the VLM agent.
     */
    fun sendTask(task: String) {
        if (isExecuting) return
        if (task.isBlank()) return

        scope.launch {
            // 1. Add user message
            val userMsg = FloatMessage(
                id = UUID.randomUUID().toString(),
                role = "user",
                type = "text",
                content = task,
                timestamp = System.currentTimeMillis(),
            )
            addMessage(userMsg)

            // 2. Persist via repo
            floatConversationRepo.addMessage(userMsg.toEntity(sessionId))

            // 3. Start a new episode
            episodeTaskPrompt = task
            episodeModelName = "" // Will be filled from agent config
            episodeStartTime = System.currentTimeMillis()

            val episodeId = episodeRecorder.startEpisode(
                taskPrompt = task,
                deviceId = deviceId,
                modelName = episodeModelName,
            )
            _currentEpisodeId.value = episodeId
            _episodeSummary.value = null

            // 4. Transition to EXECUTING state
            _floatState.value = FloatState.EXECUTING
            isExecuting = true

            // 5. Add system acknowledgment
            val sysMsg = FloatMessage(
                id = UUID.randomUUID().toString(),
                role = "system",
                type = "text",
                content = "Starting task: $task",
                timestamp = System.currentTimeMillis(),
            )
            addMessage(sysMsg)
            floatConversationRepo.addMessage(sysMsg.toEntity(sessionId))

            // 6. Execute the VLM agent and collect steps
            try {
                vlmAgent.execute(task, deviceId).collect { step ->
                    onVlmStepReceived(step)
                }
                // Normal completion
                onTaskCompleted(success = true, message = "Task completed successfully")
            } catch (e: kotlinx.coroutines.CancellationException) {
                // Task was manually stopped 鈥?already handled in stopExecution
                onTaskCompleted(success = false, message = "Task stopped by user")
            } catch (e: Exception) {
                // Error occurred
                onTaskCompleted(success = false, message = "Error: ${e.message}")
            }
        }
    }

    /**
     * Pause the currently running VLM execution.
     */
    fun pauseExecution() {
        vlmAgent.pause()
        val msg = FloatMessage(
            id = UUID.randomUUID().toString(),
            role = "system",
            type = "text",
            content = "Execution paused",
            timestamp = System.currentTimeMillis(),
        )
        addMessage(msg)
        scope.launch {
            floatConversationRepo.addMessage(msg.toEntity(sessionId))
        }
    }

    /**
     * Resume a previously paused VLM execution.
     */
    fun resumeExecution() {
        vlmAgent.resume()
        val msg = FloatMessage(
            id = UUID.randomUUID().toString(),
            role = "system",
            type = "text",
            content = "Execution resumed",
            timestamp = System.currentTimeMillis(),
        )
        addMessage(msg)
        scope.launch {
            floatConversationRepo.addMessage(msg.toEntity(sessionId))
        }
    }

    /**
     * Stop the VLM execution (graceful termination).
     */
    fun stopExecution() {
        vlmAgent.stop()
        isExecuting = false
        val msg = FloatMessage(
            id = UUID.randomUUID().toString(),
            role = "system",
            type = "text",
            content = "Execution stopped",
            timestamp = System.currentTimeMillis(),
        )
        addMessage(msg)
        scope.launch {
            floatConversationRepo.addMessage(msg.toEntity(sessionId))
        }
    }

    /**
     * Save the completed episode as a compiled AutoX script.
     */
    fun saveScript(
        name: String,
        platform: String,
        syncToCloud: Boolean,
        setAsQuickChip: Boolean,
    ) {
        scope.launch {
            val episodeId = _currentEpisodeId.value ?: return@launch

            try {
                // 1. Compile the script
                val jsContent = scriptCompiler.compile(episodeId, name, platform)

                // 2. Save to SavedScriptDao
                val scriptId = UUID.randomUUID().toString()
                val entity = SavedScriptEntity(
                    scriptId = scriptId,
                    name = name,
                    platform = platform,
                    category = platform,
                    episodeId = episodeId,
                    jsContent = jsContent,
                    jsFilePath = null,
                    syncedToCloud = syncToCloud,
                    isQuickChip = setAsQuickChip,
                    createdAt = System.currentTimeMillis(),
                    updatedAt = System.currentTimeMillis(),
                )
                savedScriptDao.upsert(entity)

                // 3. If set as quick chip, add to QuickChipManager
                if (setAsQuickChip) {
                    quickChipManager.addChip(
                        label = name,
                        command = episodeTaskPrompt,
                        category = platform,
                    )
                }

                // 4. Add completion message
                val msg = FloatMessage(
                    id = UUID.randomUUID().toString(),
                    role = "system",
                    type = "save_prompt",
                    content = "Script saved: $name ($platform)",
                    timestamp = System.currentTimeMillis(),
                )
                addMessage(msg)
                floatConversationRepo.addMessage(msg.toEntity(sessionId))

                // 5. Reset state
                _floatState.value = FloatState.EXPANDED
                _episodeSummary.value = null
                _currentEpisodeId.value = null
                isExecuting = false

            } catch (e: Exception) {
                val errMsg = FloatMessage(
                    id = UUID.randomUUID().toString(),
                    role = "system",
                    type = "text",
                    content = "Failed to save script: ${e.message}",
                    timestamp = System.currentTimeMillis(),
                )
                addMessage(errMsg)
                floatConversationRepo.addMessage(errMsg.toEntity(sessionId))
            }
        }
    }

    /**
     * Discard the current episode without saving.
     */
    fun discardEpisode() {
        scope.launch {
            val episodeId = _currentEpisodeId.value
            if (episodeId != null) {
                episodeRecorder.deleteEpisode(episodeId)
            }
            _currentEpisodeId.value = null
            _episodeSummary.value = null
            isExecuting = false
            _floatState.value = FloatState.EXPANDED

            val msg = FloatMessage(
                id = UUID.randomUUID().toString(),
                role = "system",
                type = "text",
                content = "Episode discarded",
                timestamp = System.currentTimeMillis(),
            )
            addMessage(msg)
            floatConversationRepo.addMessage(msg.toEntity(sessionId))
        }
    }

    // ---- Internal ----

    private fun addMessage(msg: FloatMessage) {
        _messages.value = _messages.value + msg
    }

    private fun onAgentStateChanged(state: AgentState) {
        when (state) {
            is AgentState.Idle -> {
                // Keep current float state (don't auto-collapse)
            }
            is AgentState.Running -> {
                if (!isExecuting) {
                    _floatState.value = FloatState.EXECUTING
                    isExecuting = true
                }
            }
            is AgentState.Paused -> {
                // Stay in executing state, UI shows pause overlay
            }
            is AgentState.Completed -> {
                // Handled by onTaskCompleted
            }
            is AgentState.Error -> {
                if (isExecuting) {
                    scope.launch { onTaskCompleted(success = false, message = state.message) }
                }
            }
        }
    }

    private suspend fun onVlmStepReceived(step: VlmStep) {
        // Add reasoning message
        val reasoningMsg = FloatMessage(
            id = UUID.randomUUID().toString(),
            role = "ai",
            type = "thinking",
            content = step.reasoning,
            timestamp = System.currentTimeMillis(),
        )
        addMessage(reasoningMsg)
        floatConversationRepo.addMessage(reasoningMsg.toEntity(sessionId))

        // Add action message
        val actionDesc = describeAction(step)
        val actionMsg = FloatMessage(
            id = UUID.randomUUID().toString(),
            role = "ai",
            type = "step",
            content = "Step ${step.stepNum}/${step.totalSteps}: $actionDesc",
            timestamp = System.currentTimeMillis(),
        )
        addMessage(actionMsg)
        floatConversationRepo.addMessage(actionMsg.toEntity(sessionId))
    }

    private suspend fun onTaskCompleted(success: Boolean, message: String) {
        isExecuting = false

        val completeMsg = FloatMessage(
            id = UUID.randomUUID().toString(),
            role = "system",
            type = "complete",
            content = message,
            timestamp = System.currentTimeMillis(),
        )
        addMessage(completeMsg)
        floatConversationRepo.addMessage(completeMsg.toEntity(sessionId))

        // Complete the episode in the recorder
        val episodeId = _currentEpisodeId.value
        if (episodeId != null) {
            episodeRecorder.completeEpisode(episodeId, success, message)

            if (success) {
                // Build task summary and prompt for save
                val steps = _messages.value.count {
                    it.role == "ai" && it.type == "step"
                }
                val summary = TaskSummary(
                    episodeId = episodeId,
                    taskPrompt = episodeTaskPrompt,
                    totalSteps = steps,
                    modelName = episodeModelName.ifBlank { "vlm" },
                    durationMs = System.currentTimeMillis() - episodeStartTime,
                    success = true,
                )
                _episodeSummary.value = summary

                // Add save prompt message
                val saveMsg = FloatMessage(
                    id = UUID.randomUUID().toString(),
                    role = "system",
                    type = "save_prompt",
                    content = "Task completed! Save the generated script to reuse?",
                    timestamp = System.currentTimeMillis(),
                )
                addMessage(saveMsg)
                floatConversationRepo.addMessage(saveMsg.toEntity(sessionId))

                // Transition to save dialog
                _floatState.value = FloatState.SAVE_SCRIPT
            } else {
                // Failure 鈥?return to expanded chat
                _floatState.value = FloatState.EXPANDED
            }
        }
    }

    private fun describeAction(step: VlmStep): String = when (val action = step.action) {
        is com.phonefarm.client.vlm.VLMAction.Tap -> "Tap at (${action.x}, ${action.y})"
        is com.phonefarm.client.vlm.VLMAction.LongPress -> "Long press at (${action.x}, ${action.y})"
        is com.phonefarm.client.vlm.VLMAction.Swipe -> "Swipe (${action.x1},${action.y1}) 鈫?(${action.x2},${action.y2})"
        is com.phonefarm.client.vlm.VLMAction.Type -> "Type: \"${action.text}\""
        is com.phonefarm.client.vlm.VLMAction.Back -> "Press Back"
        is com.phonefarm.client.vlm.VLMAction.Home -> "Press Home"
        is com.phonefarm.client.vlm.VLMAction.Launch -> "Launch app: ${action.packageName}"
        is com.phonefarm.client.vlm.VLMAction.Terminate -> "Terminate: ${action.message}"
    }

    private suspend fun restoreMessages() {
        val entities = floatConversationRepo.getMessages(sessionId)
        val msgs = entities.map { it.toFloatMessage() }
        if (msgs.isNotEmpty()) {
            _messages.value = msgs
        }
    }

    /**
     * Start a new conversation session.
     */
    fun newSession() {
        sessionId = UUID.randomUUID().toString()
        _messages.value = emptyList()
        _currentEpisodeId.value = null
        _episodeSummary.value = null
        isExecuting = false
        _floatState.value = FloatState.EXPANDED
    }

    /**
     * Clean up resources when the service is destroyed.
     */
    fun onCleared() {
        scope.cancel()
    }

    // ---- Extension helpers ----

    private fun FloatMessage.toEntity(sessionId: String) = FloatConversationEntity(
        id = 0, // auto-generated
        sessionId = sessionId,
        role = role,
        messageType = type,
        content = content,
        metadata = null,
        timestamp = timestamp,
    )

    private fun FloatConversationEntity.toFloatMessage() = FloatMessage(
        id = id.toString(),
        role = role,
        type = messageType,
        content = content,
        timestamp = timestamp,
    )
}
