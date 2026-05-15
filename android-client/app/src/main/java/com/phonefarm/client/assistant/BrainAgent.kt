package com.phonefarm.client.assistant

import android.graphics.Bitmap
import com.phonefarm.client.edge.ActionExecutor
import com.phonefarm.client.edge.model.DeviceAction
import com.phonefarm.client.network.AssistantMessage
import com.phonefarm.client.network.ToolCallDto
import com.phonefarm.client.network.ToolDefDto
import com.phonefarm.client.skills.DelegationExecutor
import com.phonefarm.client.skills.ExecutionMode
import com.phonefarm.client.skills.SkillManager
import com.phonefarm.client.tools.FunctionDef
import com.phonefarm.client.tools.ToolContext
import com.phonefarm.client.tools.ToolRegistry
import com.phonefarm.client.tools.ToolResult
import com.phonefarm.client.vlm.VlmScreenCapture
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.JsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Brain Agent — high-level AI Assistant orchestrator using function-calling LLM.
 *
 * Dual-layer architecture:
 *   Brain (DeepSeek) — plans, reasons, calls functions (high-level WHAT)
 *   Phone Agent (QwenVL) — sees screen, executes actions (low-level HOW)
 *
 * Flow:
 *   1. Brain receives user request → plans approach
 *   2. Brain calls DelegateToVision → Phone Agent sees screen, returns actions
 *   3. ActionExecutor executes device actions
 *   4. Phone Agent sees result → reports back to Brain
 *   5. Loop until task complete or max steps
 */
@Singleton
class BrainAgent @Inject constructor(
    private val brainLlmClient: BrainLlmClient,
    private val actionExecutor: ActionExecutor,
    private val creditManager: CreditManager,
    private val vlmScreenCapture: VlmScreenCapture?,
    private val toolRegistry: ToolRegistry,
    private val skillManager: SkillManager,
    private val delegationExecutor: DelegationExecutor,
) {

    private val _state = MutableStateFlow<BrainState>(BrainState.Idle)
    val state: StateFlow<BrainState> = _state.asStateFlow()

    private val _currentStep = MutableStateFlow<BrainStep?>(null)
    val currentStep: StateFlow<BrainStep?> = _currentStep.asStateFlow()

    @Volatile private var isStopped = false

    private var maxSteps = 50
    private var sessionId: String? = null
    /** Accumulated conversation messages — persists across continueWithAnswer calls. */
    private val conversation = mutableListOf<AssistantMessage>()
    private var systemPrompt: String = ""

    companion object {
        private val SYSTEM_PROMPT = """
You are a phone automation assistant. You help users accomplish tasks on their Android device.

You have access to these capabilities:
1. **delegate_to_vision** — Send a goal to the Phone Agent (vision model) to see the screen and perform low-level actions (tap, swipe, type, etc.)
2. **execute_actions** — Run a known sequence of device actions directly (when you're confident of the exact steps)
3. **ask_user** — Ask the user a question when you need clarification
4. **complete_task** — Signal that the task is done
5. **fail_task** — Signal that the task cannot be completed

Guidelines:
- Break complex tasks into small, specific goals for the Phone Agent
- After each Phone Agent action, analyze the result before proceeding
- If the Phone Agent reports an error or unexpected screen, adapt your plan
- Be concise — the Phone Agent handles the detailed screen interaction
- For opening apps: delegate "Open [app name]" to the Phone Agent
- For navigating settings: delegate step-by-step goals
- Always confirm task completion with the user when done
""".trimIndent()

        /** Convert a tool call's input JsonObject to a Map<String, Any?> for ToolRegistry. */
        fun toolInputToMap(json: JsonObject): Map<String, Any?> {
            return json.mapValues { (_, v) ->
                when (v) {
                    is JsonPrimitive -> {
                        val p = v as JsonPrimitive
                        when {
                            p.isString -> p.content
                            p.isNumber -> p.content.toDoubleOrNull() ?: p.content.toLongOrNull() ?: p.content
                            else -> p.content
                        }
                    }
                    else -> v.toString()
                }
            }
        }
    }

    /**
     * Execute a natural language task using the Brain + Phone dual-agent loop.
     *
     * @param task The user's request in natural language
     * @param deviceId The device identifier
     * @param maxSteps Maximum brain-level steps before auto-termination
     * @return [Flow] of [BrainStep] emitted at each iteration
     */
    suspend fun execute(
        task: String,
        deviceId: String,
        maxSteps: Int = 50,
    ): Flow<BrainStep> = flow {
        _state.value = BrainState.Planning
        _currentStep.value = null
        isStopped = false
        this@BrainAgent.maxSteps = maxSteps

        // Clear conversation on fresh execute (but not on continueWithAnswer)
        conversation.clear()
        conversation.add(AssistantMessage(role = "user", content = task))

        // Check credits
        val creditOk = creditManager.checkCredits(1)
        if (!creditOk) {
            _state.value = BrainState.Error("Insufficient credits")
            emit(BrainStep(0, StepPhase.ERROR, "Insufficient credits — please top up"))
            return@flow
        }

        // ── SKILLS: Pre-match user intent ──
        val skillMatch = skillManager.matchByKeyword(task)
        val executionMode = skillManager.decideExecutionMode(skillMatch)

        // ── DELEGATION FAST PATH ──
        if (executionMode == ExecutionMode.DELEGATION && skillMatch != null) {
            _state.value = BrainState.Executing
            emit(BrainStep(
                stepNum = 1,
                phase = StepPhase.THINK,
                thought = "Match: ${skillMatch.skill.name} (${"%.0f".format(skillMatch.confidence * 100)}%) → delegation fast path",
            ))

            val success = delegationExecutor.executeMatch(skillMatch)
            if (success) {
                _state.value = BrainState.Completed("Delegated to ${skillMatch.matchedApp.name}")
                emit(BrainStep(1, StepPhase.COMPLETE,
                    "Delegated to ${skillMatch.matchedApp.name} — fast path ~1s response"))
                return@flow
            }

            // Delegation failed — fall through to GUI automation
            emit(BrainStep(1, StepPhase.OBSERVE,
                "Delegation failed, falling back to GUI automation"))
        }

        // Create server session
        sessionId = brainLlmClient.createSession(deviceId, task.take(128)).getOrNull()

        // ── Build skill-enhanced system prompt ──
        val skillsPrompt = skillManager.generateSkillsPrompt()
        systemPrompt = buildString {
            append(SYSTEM_PROMPT)
            if (skillMatch != null && executionMode == ExecutionMode.GUI_AUTOMATION) {
                append("\n\n## Skill Context: ${skillMatch.skill.name}\n")
                append("${skillMatch.skill.description}\n")
                append("Target app: ${skillMatch.matchedApp.name}")
                if (skillMatch.skill.promptHint.isNotBlank()) {
                    append("\nHint: ${skillMatch.skill.promptHint}")
                }
                if (skillMatch.matchedApp.steps.isNotEmpty()) {
                    append("\nSuggested steps:\n")
                    skillMatch.matchedApp.steps.forEachIndexed { i, step ->
                        append("  ${i + 1}. $step\n")
                    }
                }
            }
            if (skillsPrompt.isNotBlank()) {
                append("\n\n## Available Skills\n$skillsPrompt")
            }
        }

        // Generate tool definitions for function calling
        val toolDefs = toolRegistry.generateFunctionDefs().map { it.toDto() }

        var stepNum = 0

        try {
            while (stepNum < this@BrainAgent.maxSteps && !isStopped) {
                stepNum++

                // ── BRAIN: Plan / reason ──
                _state.value = BrainState.Planning

                val chatResult = brainLlmClient.chat(
                    messages = conversation,
                    systemPrompt = systemPrompt,
                    sessionId = sessionId,
                    tools = toolDefs.ifEmpty { null },
                )

                if (chatResult.isFailure) {
                    val err = chatResult.exceptionOrNull()?.message ?: "LLM call failed"
                    _state.value = BrainState.Error(err)
                    emit(BrainStep(stepNum, StepPhase.ERROR, "Brain LLM error: $err"))
                    break
                }

                val response = chatResult.getOrThrow()

                // ── Handle tool calls from function calling ──
                val toolCalls = response.toolCalls
                if (!toolCalls.isNullOrEmpty()) {
                    // Record the assistant's tool call intent
                    conversation.add(AssistantMessage(
                        role = "assistant",
                        content = "Calling tool(s): ${toolCalls.joinToString(", ") { it.name }}"
                    ))

                    for (tc in toolCalls) {
                        if (isStopped) break

                        val toolParams = toolInputToMap(tc.input)
                        val toolCtx = ToolContext(androidContext = actionExecutor.context)

                        emit(BrainStep(
                            stepNum = stepNum,
                            phase = StepPhase.ACT,
                            thought = "Tool: ${tc.name}(${toolParams.entries.joinToString(", ") { "${it.key}=${it.value}" }})",
                        ))

                        val result = toolRegistry.execute(tc.name, toolParams, toolCtx)

                        // Feed tool result back to conversation
                        val resultText = when (result) {
                            is ToolResult.Success -> "Tool ${tc.name} success: ${result.message}"
                            is ToolResult.Partial -> "Tool ${tc.name} partial: ${result.message}"
                            is ToolResult.Error -> "Tool ${tc.name} error: ${result.message}"
                            is ToolResult.Unavailable -> "Tool ${tc.name} unavailable: ${result.reason}"
                        }
                        conversation.add(AssistantMessage(role = "user", content = resultText))

                        emit(BrainStep(
                            stepNum = stepNum,
                            phase = StepPhase.OBSERVE,
                            thought = tc.name,
                            observation = result.getMessage(),
                        ))
                    }
                    continue // loop back to Brain for next decision
                }

                // ── Parse text response as BrainAction ──
                val parsed = parseBrainOutput(response.content)

                conversation.add(AssistantMessage(role = "assistant", content = response.content))

                when (parsed) {
                    is BrainAction.DelegateToVision -> {
                        // ── PHONE AGENT: See screen → act ──
                        _state.value = BrainState.WaitingForVision

                        emit(BrainStep(stepNum, StepPhase.THINK, parsed.goal, action = parsed))

                        val visionResult = executeVisionStep(parsed.goal, parsed.context)

                        if (visionResult.isFailure) {
                            val err = visionResult.exceptionOrNull()?.message ?: "Vision failed"
                            conversation.add(AssistantMessage(
                                role = "user",
                                content = "Phone Agent error: $err. Try a different approach."
                            ))
                            emit(BrainStep(stepNum, StepPhase.OBSERVE, "Vision error: $err"))
                            continue
                        }

                        val (observation, actions) = visionResult.getOrThrow()

                        // Execute device actions
                        _state.value = BrainState.Executing
                        for (action in actions) {
                            if (isStopped) break
                            val deviceAction = toDeviceAction(action)
                            actionExecutor.execute(deviceAction)
                        }

                        // Report back to Brain
                        conversation.add(AssistantMessage(
                            role = "user",
                            content = "Phone Agent result: $observation"
                        ))

                        emit(BrainStep(
                            stepNum = stepNum,
                            phase = StepPhase.OBSERVE,
                            thought = parsed.goal,
                            observation = observation,
                        ))

                        // Track tokens
                        response.usage?.let {
                            creditManager.trackUsage(
                                sessionId = sessionId ?: "adhoc",
                                model = response.model,
                                inputTokens = it.inputTokens,
                                outputTokens = it.outputTokens,
                            )
                        }
                    }

                    is BrainAction.ExecuteActions -> {
                        _state.value = BrainState.Executing

                        emit(BrainStep(stepNum, StepPhase.ACT, parsed.reason, action = parsed))

                        for (desc in parsed.actions) {
                            if (isStopped) break
                            val deviceAction = toDeviceAction(desc)
                            actionExecutor.execute(deviceAction)
                        }

                        conversation.add(AssistantMessage(
                            role = "user",
                            content = "Actions executed: ${parsed.reason}"
                        ))

                        response.usage?.let {
                            creditManager.trackUsage(
                                sessionId = sessionId ?: "adhoc",
                                model = response.model,
                                inputTokens = it.inputTokens,
                                outputTokens = it.outputTokens,
                            )
                        }
                    }

                    is BrainAction.AskUser -> {
                        emit(BrainStep(
                            stepNum = stepNum,
                            phase = StepPhase.THINK,
                            thought = parsed.question,
                            action = parsed,
                        ))
                        // Pause and wait for user response (handled by UI)
                        _state.value = BrainState.Idle
                        return@flow
                    }

                    is BrainAction.CompleteTask -> {
                        _state.value = BrainState.Completed(parsed.summary)
                        emit(BrainStep(stepNum, StepPhase.COMPLETE, parsed.summary))
                        brainLlmClient.completeSession(sessionId ?: "", true)
                        return@flow
                    }

                    is BrainAction.FailTask -> {
                        _state.value = BrainState.Error(parsed.reason)
                        emit(BrainStep(stepNum, StepPhase.ERROR, parsed.reason))
                        brainLlmClient.completeSession(sessionId ?: "", false)
                        return@flow
                    }
                }
            }

            // Max steps reached
            if (stepNum >= this@BrainAgent.maxSteps) {
                _state.value = BrainState.Completed("Max steps reached")
                brainLlmClient.completeSession(sessionId ?: "", true)
            }
        } catch (e: CancellationException) {
            _state.value = BrainState.Error("Cancelled")
            brainLlmClient.completeSession(sessionId ?: "", false)
            throw e
        } catch (e: Exception) {
            _state.value = BrainState.Error(e.message ?: "Unknown error")
            brainLlmClient.completeSession(sessionId ?: "", false)
        }
    }

    /** Stop the agent loop. */
    fun stop() {
        isStopped = true
    }

    /**
     * Continue after BrainAgent asked the user a question.
     * Resumes the conversation with preserved history and the user's answer.
     */
    suspend fun continueWithAnswer(
        answer: String,
        deviceId: String,
    ): Flow<BrainStep> = flow {
        _state.value = BrainState.Planning
        _currentStep.value = null
        isStopped = false

        // Check credits
        val creditOk = creditManager.checkCredits(1)
        if (!creditOk) {
            _state.value = BrainState.Error("Insufficient credits")
            emit(BrainStep(0, StepPhase.ERROR, "Insufficient credits"))
            return@flow
        }

        // Append user's answer to existing conversation
        conversation.add(AssistantMessage(role = "user", content = answer))

        val toolDefs = toolRegistry.generateFunctionDefs().map { it.toDto() }
        var stepNum = conversation.size / 2 // approximate from message count

        try {
            while (stepNum < this@BrainAgent.maxSteps && !isStopped) {
                stepNum++

                // ── BRAIN: Continue reasoning ──
                _state.value = BrainState.Planning

                val chatResult = brainLlmClient.chat(
                    messages = conversation.toList(),
                    systemPrompt = systemPrompt,
                    sessionId = sessionId,
                    tools = toolDefs.ifEmpty { null },
                )

                if (chatResult.isFailure) {
                    val err = chatResult.exceptionOrNull()?.message ?: "LLM call failed"
                    _state.value = BrainState.Error(err)
                    emit(BrainStep(stepNum, StepPhase.ERROR, "Brain LLM error: $err"))
                    break
                }

                val response = chatResult.getOrThrow()

                // ── HYBRID MATCH: Re-match skills against the ongoing conversation ──
                val llmMatch = skillManager.matchHybrid(
                    query = answer,
                    llmSkillId = null,
                    llmConfidence = null,
                )

                val toolCalls = response.toolCalls
                if (!toolCalls.isNullOrEmpty()) {
                    conversation.add(AssistantMessage(
                        role = "assistant",
                        content = "Calling tool(s): ${toolCalls.joinToString(", ") { it.name }}"
                    ))

                    for (tc in toolCalls) {
                        if (isStopped) break
                        val toolParams = toolInputToMap(tc.input)
                        val toolCtx = ToolContext(androidContext = actionExecutor.context)

                        emit(BrainStep(
                            stepNum = stepNum,
                            phase = StepPhase.ACT,
                            thought = "Tool: ${tc.name}(${toolParams.entries.joinToString(", ") { "${it.key}=${it.value}" }})",
                        ))

                        val result = toolRegistry.execute(tc.name, toolParams, toolCtx)
                        val resultText = when (result) {
                            is ToolResult.Success -> "Tool ${tc.name} success: ${result.message}"
                            is ToolResult.Partial -> "Tool ${tc.name} partial: ${result.message}"
                            is ToolResult.Error -> "Tool ${tc.name} error: ${result.message}"
                            is ToolResult.Unavailable -> "Tool ${tc.name} unavailable: ${result.reason}"
                        }
                        conversation.add(AssistantMessage(role = "user", content = resultText))
                        emit(BrainStep(stepNum = stepNum, phase = StepPhase.OBSERVE, thought = tc.name, observation = result.getMessage()))
                    }
                    continue
                }

                // Parse text response and process the action
                conversation.add(AssistantMessage(role = "assistant", content = response.content))
                val parsed = parseBrainOutput(response.content)

                when (parsed) {
                    is BrainAction.CompleteTask -> {
                        _state.value = BrainState.Completed(parsed.summary)
                        emit(BrainStep(stepNum, StepPhase.COMPLETE, parsed.summary))
                        brainLlmClient.completeSession(sessionId ?: "", true)
                        return@flow
                    }
                    is BrainAction.FailTask -> {
                        _state.value = BrainState.Error(parsed.reason)
                        emit(BrainStep(stepNum, StepPhase.ERROR, parsed.reason))
                        brainLlmClient.completeSession(sessionId ?: "", false)
                        return@flow
                    }
                    is BrainAction.AskUser -> {
                        emit(BrainStep(stepNum = stepNum, phase = StepPhase.THINK, thought = parsed.question, action = parsed))
                        _state.value = BrainState.Idle
                        return@flow
                    }
                    is BrainAction.DelegateToVision -> {
                        _state.value = BrainState.WaitingForVision
                        emit(BrainStep(stepNum, StepPhase.THINK, parsed.goal, action = parsed))
                        val visionResult = executeVisionStep(parsed.goal, parsed.context)
                        if (visionResult.isFailure) {
                            val err = visionResult.exceptionOrNull()?.message ?: "Vision failed"
                            conversation.add(AssistantMessage(role = "user", content = "Phone Agent error: $err. Try a different approach."))
                            emit(BrainStep(stepNum, StepPhase.OBSERVE, "Vision error: $err"))
                            continue
                        }
                        val (observation, actions) = visionResult.getOrThrow()
                        _state.value = BrainState.Executing
                        for (action in actions) {
                            if (isStopped) break
                            actionExecutor.execute(toDeviceAction(action))
                        }
                        conversation.add(AssistantMessage(role = "user", content = "Phone Agent result: $observation"))
                        emit(BrainStep(stepNum = stepNum, phase = StepPhase.OBSERVE, thought = parsed.goal, observation = observation))
                        response.usage?.let {
                            creditManager.trackUsage(sessionId = sessionId ?: "adhoc", model = response.model, inputTokens = it.inputTokens, outputTokens = it.outputTokens)
                        }
                    }
                    is BrainAction.ExecuteActions -> {
                        _state.value = BrainState.Executing
                        emit(BrainStep(stepNum, StepPhase.ACT, parsed.reason, action = parsed))
                        for (desc in parsed.actions) {
                            if (isStopped) break
                            actionExecutor.execute(toDeviceAction(desc))
                        }
                        conversation.add(AssistantMessage(role = "user", content = "Actions executed: ${parsed.reason}"))
                        response.usage?.let {
                            creditManager.trackUsage(sessionId = sessionId ?: "adhoc", model = response.model, inputTokens = it.inputTokens, outputTokens = it.outputTokens)
                        }
                    }
                }
            }
        } catch (e: CancellationException) {
            _state.value = BrainState.Error("Cancelled")
            brainLlmClient.completeSession(sessionId ?: "", false)
            throw e
        } catch (e: Exception) {
            _state.value = BrainState.Error(e.message ?: "Unknown error")
            brainLlmClient.completeSession(sessionId ?: "", false)
        }
    }

    // ── Private ──

    /**
     * Execute a vision step: capture screenshot, send to Phone Agent, parse actions.
     */
    private suspend fun executeVisionStep(
        goal: String,
        context: String,
    ): Result<Pair<String, List<DeviceActionDesc>>> {
        // Capture screenshot
        val screenshot = captureScreen() ?: return Result.failure(
            Exception("Cannot capture screen — display not available")
        )

        // Build prompt
        val prompt = buildString {
            append("Goal: $goal")
            if (context.isNotBlank()) {
                append("\nContext: $context")
            }
            append("\n\nLook at the current screen. What do you see? ")
            append("What action(s) should be taken to achieve the goal? ")
            append("Describe what you see and list the exact actions (tap coordinates, swipe, type text, etc.).")
        }

        // Call Phone Agent via server proxy
        val visionResult = brainLlmClient.vision(screenshot, prompt, sessionId)

        if (visionResult.isFailure) {
            return Result.failure(visionResult.exceptionOrNull()!!)
        }

        val response = visionResult.getOrThrow()
        val parsed = parseVisionOutput(response.content)

        // Track vision token usage
        response.usage?.let {
            creditManager.trackUsage(
                sessionId = sessionId ?: "adhoc",
                model = response.model,
                inputTokens = it.inputTokens,
                outputTokens = it.outputTokens,
            )
        }

        return Result.success(parsed)
    }

    /** Capture screen for the Phone Agent. */
    private suspend fun captureScreen(): Bitmap? {
        vlmScreenCapture?.capture()?.let { return it }
        // Fallback: no screenshot available
        return null
    }

    /**
     * Parse Brain LLM output into a structured [BrainAction].
     * Handles function-calling style output and free-text fallback.
     */
    private fun parseBrainOutput(content: String): BrainAction {
        val trimmed = content.trim()

        // Try to parse as function call JSON
        val jsonPattern = Regex("""\{(?:[^{}]|(?:\{[^{}]*\}))*\}""")
        val match = jsonPattern.find(trimmed)
        if (match != null) {
            try {
                val json = org.json.JSONObject(match.value)
                val name = json.optString("name", json.optString("function", ""))
                val args = json.optJSONObject("arguments")
                    ?: json.optJSONObject("parameters")
                    ?: org.json.JSONObject()

                return when {
                    name.contains("delegate", ignoreCase = true) ||
                    name.contains("vision", ignoreCase = true) -> {
                        BrainAction.DelegateToVision(
                            goal = args.optString("goal", args.optString("task", trimmed)),
                            context = args.optString("context", ""),
                        )
                    }
                    name.contains("execute", ignoreCase = true) -> {
                        val actionList = mutableListOf<DeviceActionDesc>()
                        val actionsJson = args.optJSONArray("actions")
                        if (actionsJson != null) {
                            for (i in 0 until actionsJson.length()) {
                                val a = actionsJson.getJSONObject(i)
                                actionList.add(DeviceActionDesc(
                                    type = a.optString("type", "tap"),
                                    x = if (a.has("x")) a.getInt("x") else null,
                                    y = if (a.has("y")) a.getInt("y") else null,
                                    x2 = if (a.has("x2")) a.getInt("x2") else null,
                                    y2 = if (a.has("y2")) a.getInt("y2") else null,
                                    text = a.optString("text", null),
                                    packageName = a.optString("packageName", null),
                                    durationMs = if (a.has("durationMs")) a.getLong("durationMs") else null,
                                ))
                            }
                        }
                        BrainAction.ExecuteActions(
                            actions = actionList,
                            reason = args.optString("reason", trimmed),
                        )
                    }
                    name.contains("ask", ignoreCase = true) -> {
                        val optionsList = mutableListOf<String>()
                        val opts = args.optJSONArray("options")
                        if (opts != null) {
                            for (i in 0 until opts.length()) {
                                optionsList.add(opts.getString(i))
                            }
                        }
                        BrainAction.AskUser(
                            question = args.optString("question", trimmed),
                            options = optionsList,
                        )
                    }
                    name.contains("complete", ignoreCase = true) ||
                    name.contains("finish", ignoreCase = true) -> {
                        BrainAction.CompleteTask(
                            summary = args.optString("summary", args.optString("message", "Task completed")),
                        )
                    }
                    name.contains("fail", ignoreCase = true) -> {
                        BrainAction.FailTask(
                            reason = args.optString("reason", "Could not complete the task"),
                        )
                    }
                    else -> interpretFreeText(trimmed)
                }
            } catch (_: Exception) {
                // JSON parse failed, fall through to free-text interpretation
            }
        }

        return interpretFreeText(trimmed)
    }

    /** Fallback: interpret natural language output as a BrainAction. */
    private fun interpretFreeText(text: String): BrainAction {
        val lower = text.lowercase()

        return when {
            lower.contains("complete") || lower.contains("done") ||
            lower.contains("finished") || lower.contains("success") -> {
                BrainAction.CompleteTask(summary = text.take(200))
            }
            lower.contains("cannot") || lower.contains("unable") ||
            lower.contains("failed") || lower.contains("impossible") -> {
                BrainAction.FailTask(reason = text.take(200))
            }
            lower.contains("?") && text.length < 100 -> {
                BrainAction.AskUser(question = text)
            }
            // Default: delegate to Phone Agent for screen-level action
            else -> BrainAction.DelegateToVision(goal = text.take(500))
        }
    }

    /**
     * Parse Phone Agent (QwenVL) output into observation + device actions.
     */
    private fun parseVisionOutput(content: String): Pair<String, List<DeviceActionDesc>> {
        val actions = mutableListOf<DeviceActionDesc>()
        val observation = StringBuilder()

        // Try JSON parsing first
        val jsonPattern = Regex("""\{[^{}]*\}""")
        val matches = jsonPattern.findAll(content).toList()

        for (match in matches) {
            try {
                val json = org.json.JSONObject(match.value)
                if (json.has("action") || json.has("type")) {
                    val type = json.optString("action", json.optString("type", ""))
                    if (type.isNotBlank()) {
                        actions.add(DeviceActionDesc(
                            type = type,
                            x = if (json.has("x")) json.getInt("x") else null,
                            y = if (json.has("y")) json.getInt("y") else null,
                            x2 = if (json.has("x2")) json.getInt("x2") else null,
                            y2 = if (json.has("y2")) json.getInt("y2") else null,
                            text = json.optString("text", null),
                            packageName = json.optString("packageName", null),
                            durationMs = if (json.has("durationMs")) json.getLong("durationMs") else null,
                        ))
                    }
                }
            } catch (_: Exception) { }
        }

        // Extract observation (non-JSON text)
        observation.append(content.replace(Regex("""\{[^{}]*\}"""), "").trim())

        if (observation.isEmpty()) {
            observation.append("Actions extracted: ${actions.size} step(s)")
        }

        return Pair(observation.toString(), actions)
    }

    /** Convert [DeviceActionDesc] to the canonical [DeviceAction]. */
    private fun toDeviceAction(desc: DeviceActionDesc): DeviceAction = when (desc.type.lowercase()) {
        "tap" -> DeviceAction.Tap(desc.x ?: 0, desc.y ?: 0)
        "long_press", "longpress" -> DeviceAction.LongPress(
            desc.x ?: 0, desc.y ?: 0, desc.durationMs?.toInt() ?: 800
        )
        "swipe" -> DeviceAction.Swipe(
            desc.x ?: 0, desc.y ?: 0,
            desc.x2 ?: 0, desc.y2 ?: 0,
            desc.durationMs?.toInt() ?: 300,
        )
        "type", "input" -> DeviceAction.Type(desc.text ?: "")
        "back" -> DeviceAction.Back
        "home" -> DeviceAction.Home
        "launch" -> DeviceAction.Launch(desc.packageName ?: "")
        "wait" -> DeviceAction.Wait(desc.durationMs ?: 1000)
        else -> DeviceAction.Tap(desc.x ?: 0, desc.y ?: 0)
    }

    /** Convert ToolRegistry [FunctionDef] to wire-format [ToolDefDto]. */
    private fun FunctionDef.toDto(): ToolDefDto {
        val paramsObj = buildJsonObject {
            parameters.forEach { (key, value) ->
                when (value) {
                    is String -> put(key, JsonPrimitive(value))
                    is Number -> put(key, JsonPrimitive(value))
                    is Boolean -> put(key, JsonPrimitive(value))
                    is Map<*, *> -> {
                        val inner = buildJsonObject {
                            @Suppress("UNCHECKED_CAST")
                            (value as Map<String, Any?>).forEach { (k, v) ->
                                when (v) {
                                    is String -> put(k, JsonPrimitive(v))
                                    is Number -> put(k, JsonPrimitive(v))
                                    is Boolean -> put(k, JsonPrimitive(v))
                                    is List<*> -> {
                                        val listItems = buildJsonObject {
                                            @Suppress("UNCHECKED_CAST")
                                            (v as List<Map<String, Any?>>).forEachIndexed { _, item ->
                                                item?.forEach { (ik, iv) ->
                                                    if (iv is String) put(ik, JsonPrimitive(iv))
                                                }
                                            }
                                        }
                                        put(k, listItems)
                                    }
                                }
                            }
                        }
                        put(key, inner)
                    }
                    is List<*> -> {
                        // Handle arrays like "required"
                        val arr = kotlinx.serialization.json.buildJsonArray {
                            @Suppress("UNCHECKED_CAST")
                            (value as List<String>).forEach { add(JsonPrimitive(it)) }
                        }
                        put(key, arr)
                    }
                }
            }
        }
        return ToolDefDto(name = name, description = description, parameters = paramsObj)
    }

}
