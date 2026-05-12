package com.phonefarm.client.vlm

import android.graphics.Bitmap
import android.os.Build
import com.phonefarm.client.service.PhoneFarmAccessibilityService
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Main VLM agent orchestration loop implementing the 9-step cycle:
 *
 *   1. screenshot  → capture device screen
 *   2. memory      → query TF-IDF memory for relevant facts
 *   3. history     → build conversation history context
 *   4. VLM         → route to cloud or local inference
 *   5. parse       → extract structured action from raw VLM output
 *   6. normalize   → convert normalized coordinates to pixel coords
 *   7. validate    → validate action bounds and semantics
 *   8. execute     → dispatch action via AccessibilityService
 *   9. record      → persist step to EpisodeRecorder, update memory
 *
 * The agent state machine: Idle → Running → Paused/Completed/Error.
 * Stopped returns to Idle for clean reuse.
 */
@Singleton
class VlmAgent @Inject constructor(
    private val vlmClient: VlmClient,
    private val actionParser: ActionParser,
    private val coordinateNormalizer: CoordinateNormalizer,
    private val episodeRecorder: EpisodeRecorder,
    private val inferenceRouter: InferenceRouter,
    private val loopDetector: LoopDetector,
    private val actionValidator: ActionValidator,
    private val memoryManager: MemoryManager,
    private val promptTemplateManager: PromptTemplateManager,
) {

    private val _agentState = MutableStateFlow<AgentState>(AgentState.Idle)
    val agentState: StateFlow<AgentState> = _agentState.asStateFlow()

    private val _currentStep = MutableStateFlow<VlmStep?>(null)
    val currentStep: StateFlow<VlmStep?> = _currentStep.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    // Control flags
    @Volatile private var isPaused = false
    @Volatile private var isStopped = false

    // Screen dimensions cache
    private var screenWidth = 1080
    private var screenHeight = 1920

    /** Maximum number of inference steps before automatic termination. */
    private var maxSteps = 50

    /** Recent screenshots for loop detection. */
    private val recentScreenshots = mutableListOf<Bitmap>()

    /**
     * Execute a natural-language task on the given device.
     * Returns a [Flow] of [VlmStep]s emitted on each iteration.
     */
    suspend fun execute(
        task: String,
        deviceId: String,
        config: VlmProviderConfig = VlmProviderConfig(
            mode = VlmMode.AUTO,
            cloudConfig = CloudVlmConfig(
                provider = "openai",
                apiBase = "http://localhost:8000/v1",
                apiKey = "",
                modelName = "autoglm-phone-9b",
                maxSteps = 50,
                temperature = 0.1f,
                maxTokens = 1024,
                promptTemplateStyle = "autoglm",
                coordinateSystem = "norm1000",
            ),
            localModelId = null,
            fallbackMode = VlmMode.CLOUD,
            maxLocalSteps = 50,
            historyLength = 5,
            traceEnabled = true,
        ),
    ): Flow<VlmStep> = flow {
        // Reset state
        _agentState.value = AgentState.Running
        _currentStep.value = null
        isPaused = false
        isStopped = false
        recentScreenshots.clear()
        loopDetector.reset()
        maxSteps = config.cloudConfig?.maxSteps ?: 50

        // Cache screen dimensions from accessibility service
        cacheScreenDimensions()

        // Step 0: Start episode recording
        val modelName = config.cloudConfig?.modelName
            ?: config.localModelId
            ?: "unknown"
        val episodeId = episodeRecorder.startEpisode(task, deviceId, modelName)

        // Conversation history
        val history = mutableListOf<VlmHistoryEntry>()
        var stepNum = 0

        try {
            while (stepNum < maxSteps && !isStopped) {
                // --- Pause check ---
                while (isPaused && !isStopped) {
                    delay(200)
                }
                if (isStopped) break

                stepNum++

                // ================================================================
                // STEP 1: SCREENSHOT — capture device screen
                // ================================================================
                val screenshot = captureScreen()
                if (screenshot == null) {
                    android.util.Log.e("VlmAgent", "Failed to capture screenshot at step $stepNum")
                    emit(
                        VlmStep(
                            stepNum = -1,
                            totalSteps = 0,
                            reasoning = "Failed to capture screenshot at step $stepNum",
                            action = VLMAction.Terminate(message = "Failed to capture screenshot at step $stepNum"),
                            screenshotPath = null,
                            selectorInfo = null,
                        )
                    )
                    _agentState.value = AgentState.Error("Screenshot capture failed")
                    break
                }

                // ================================================================
                // STEP 2: MEMORY — query TF-IDF memory for relevant facts
                // ================================================================
                val memoryResults = memoryManager.query(task, topK = 5)
                val memoryHints = if (memoryResults.isNotEmpty()) {
                    memoryResults.joinToString("\n") {
                        "[${it.category}] ${it.fact} (relevance: ${"%.2f".format(it.relevanceScore)})"
                    }
                } else ""

                // ================================================================
                // STEP 3: HISTORY — build conversation history (last N steps)
                // ================================================================
                val trimmedHistory = history.takeLast(config.historyLength)

                // ================================================================
                // STEP 4: VLM INFERENCE — route to cloud or local
                // ================================================================
                val vlmResponse = try {
                    inferenceRouter.route(
                        screenshot = screenshot,
                        taskContext = task,
                        memoryHints = memoryHints,
                        config = config,
                        history = trimmedHistory,
                    )
                } catch (e: Exception) {
                    android.util.Log.e("VlmAgent", "VLM inference failed at step $stepNum: ${e.message}")
                    emit(
                        VlmStep(
                            stepNum = -1,
                            totalSteps = 0,
                            reasoning = "VLM inference failed at step $stepNum: ${e.message}",
                            action = VLMAction.Terminate(message = "VLM inference failed: ${e.message}"),
                            screenshotPath = null,
                            selectorInfo = null,
                        )
                    )
                    _agentState.value = AgentState.Error("VLM inference error: ${e.message}")
                    break
                }

                // ================================================================
                // STEP 5: PARSE — extract structured action from raw VLM output
                // ================================================================
                val modelType = config.cloudConfig?.promptTemplateStyle ?: "autoglm"
                val rawAction = actionParser.parse(vlmResponse.rawOutput, modelType)
                if (rawAction == null) {
                    // Parsing failed — inject feedback and retry
                    val feedbackEntry = VlmHistoryEntry(
                        role = "user",
                        content = "Previous action was invalid. Please output a valid action. " +
                            "Available: tap, swipe, type, back, home, launch, terminate.",
                        screenshotBase64 = null,
                    )
                    history.add(feedbackEntry)
                    recentScreenshots.add(screenshot)
                    continue // retry from screenshot
                }

                // ================================================================
                // STEP 6: NORMALIZE — convert coordinates to pixel space
                // ================================================================
                val coordSystem = config.cloudConfig?.coordinateSystem ?: "norm1000"
                val pixelAction = normalizeAction(rawAction, coordSystem)

                // ================================================================
                // STEP 7: VALIDATE — check action bounds and semantics
                // ================================================================
                val validation = actionValidator.validate(pixelAction, screenWidth, screenHeight)
                if (validation is ValidationResult.Invalid) {
                    val feedbackEntry = VlmHistoryEntry(
                        role = "user",
                        content = "Action rejected: ${validation.reason}. Please provide a correct action.",
                        screenshotBase64 = null,
                    )
                    history.add(feedbackEntry)
                    recentScreenshots.add(screenshot)
                    continue // retry
                }

                // Check for termination
                if (pixelAction is VLMAction.Terminate) {
                    _agentState.value = AgentState.Completed
                    episodeRecorder.completeEpisode(
                        episodeId = episodeId,
                        success = true,
                        message = pixelAction.message.ifBlank { "Task completed at step $stepNum" },
                    )
                    // Update memory with final observation
                    memoryManager.addMemory(
                        fact = "Task completed: $task | Result: ${pixelAction.message}",
                        category = "task_completion",
                    )
                    emit(
                        VlmStep(
                            stepNum = stepNum,
                            totalSteps = maxSteps,
                            reasoning = vlmResponse.thinking,
                            action = pixelAction,
                            screenshotPath = null,
                            selectorInfo = null,
                        )
                    )
                    break
                }

                // ================================================================
                // LOOP DETECTION — check if the agent is stuck
                // ================================================================
                if (recentScreenshots.isNotEmpty()) {
                    val loopResult = loopDetector.checkLoop(recentScreenshots, screenshot)
                    if (loopResult is LoopResult.LoopDetected) {
                        // Inject loop-breaking feedback
                        val loopEntry = VlmHistoryEntry(
                            role = "user",
                            content = "WARNING: You appear to be stuck in a loop. " +
                                "${loopResult.reason}. Try a different approach (scroll, back, home).",
                            screenshotBase64 = null,
                        )
                        history.add(loopEntry)
                        android.util.Log.w("VlmAgent", "Loop detected: ${loopResult.reason}")
                    }
                }

                // Record action for repetition detection
                loopDetector.recordAction(pixelAction)

                // ================================================================
                // STEP 8: EXECUTE — dispatch action via AccessibilityService
                // ================================================================
                executeAction(pixelAction)

                // Pause briefly for UI to settle
                delay(500)

                // ================================================================
                // STEP 9: RECORD — persist step + update memory
                // ================================================================
                val step = VlmStep(
                    stepNum = stepNum,
                    totalSteps = maxSteps,
                    reasoning = vlmResponse.thinking,
                    action = pixelAction,
                    screenshotPath = null, // filled by EpisodeRecorder
                    selectorInfo = null,
                )

                episodeRecorder.recordStep(episodeId, step, screenshot)

                // Update memory with observation
                val observation = buildActionObservation(stepNum, pixelAction)
                memoryManager.addMemory(observation, "action_trace")

                // Update history for next iteration
                val historyEntry = VlmHistoryEntry(
                    role = "assistant",
                    content = vlmResponse.rawOutput,
                    screenshotBase64 = null, // Screenshots stored locally, not re-sent
                )
                history.add(historyEntry)

                // Manage screenshot ring buffer (keep last 5 for loop detection)
                recentScreenshots.add(screenshot)
                while (recentScreenshots.size > 5) {
                    val old = recentScreenshots.removeAt(0)
                    if (old != screenshot) old.recycle()
                }

                // Emit step to flow
                _currentStep.value = step
                emit(step)

                // If action is Terminate-like (e.g., Back/Home at max steps)
                if (stepNum >= maxSteps) {
                    android.util.Log.w("VlmAgent", "Max steps ($maxSteps) reached, terminating")
                    _agentState.value = AgentState.Completed
                    episodeRecorder.completeEpisode(
                        episodeId = episodeId,
                        success = true,
                        message = "Max steps reached",
                    )
                    break
                }
            }
        } catch (e: CancellationException) {
            _agentState.value = AgentState.Error("Task cancelled")
            episodeRecorder.completeEpisode(episodeId, false, "Cancelled: ${e.message}")
            throw e
        } catch (e: Exception) {
            _agentState.value = AgentState.Error(e.message ?: "Unknown error")
            episodeRecorder.completeEpisode(episodeId, false, "Error: ${e.message}")
        } finally {
            // Clean up screenshot references
            recentScreenshots.forEach { it.recycle() }
            recentScreenshots.clear()

            if (_agentState.value !is AgentState.Error &&
                _agentState.value !is AgentState.Completed
            ) {
                _agentState.value = AgentState.Idle
            }
        }
    }

    /**
     * Pause the currently running agent loop.
     * The agent will block at the start of the next iteration.
     */
    fun pause() {
        isPaused = true
        if (_agentState.value is AgentState.Running) {
            _agentState.value = AgentState.Paused
        }
    }

    /**
     * Resume a previously paused agent loop.
     */
    fun resume() {
        isPaused = false
        _agentState.value = AgentState.Running
    }

    /**
     * Terminate the agent loop gracefully (completes current step if any).
     */
    fun stop() {
        isStopped = true
        isPaused = false // unblock pause if stuck
    }

    // ======== Private helpers ========

    /**
     * Cache screen dimensions from AccessibilityService or use defaults.
     */
    private fun cacheScreenDimensions() {
        val service = PhoneFarmAccessibilityService.instance
        if (service != null) {
            val metrics = service.resources?.displayMetrics
            if (metrics != null) {
                screenWidth = metrics.widthPixels
                screenHeight = metrics.heightPixels
                return
            }
        }
        // Fallback: use default 1080x1920
    }

    /**
     * Capture screen via AccessibilityService (API 34+). Returns null on failure.
     */
    private fun captureScreen(): Bitmap? {
        val service = PhoneFarmAccessibilityService.instance ?: return null
        return service.captureScreen()
    }

    /**
     * Normalize a [VLMAction] using the coordinate system reported by the model.
     */
    private fun normalizeAction(action: VLMAction, coordSystem: String): VLMAction {
        return when (action) {
            is VLMAction.Tap -> {
                val (px, py) = coordinateNormalizer.normalizeToPixel(
                    action.x, action.y, screenWidth, screenHeight, coordSystem
                )
                action.copy(x = px, y = py)
            }
            is VLMAction.LongPress -> {
                val (px, py) = coordinateNormalizer.normalizeToPixel(
                    action.x, action.y, screenWidth, screenHeight, coordSystem
                )
                action.copy(x = px, y = py)
            }
            is VLMAction.Swipe -> {
                val (px1, py1) = coordinateNormalizer.normalizeToPixel(
                    action.x1, action.y1, screenWidth, screenHeight, coordSystem
                )
                val (px2, py2) = coordinateNormalizer.normalizeToPixel(
                    action.x2, action.y2, screenWidth, screenHeight, coordSystem
                )
                action.copy(x1 = px1, y1 = py1, x2 = px2, y2 = py2)
            }
            else -> action // Type, Back, Home, Launch, Terminate have no coordinates
        }
    }

    /**
     * Execute a validated [VLMAction] via the accessibility service.
     */
    private fun executeAction(action: VLMAction) {
        val service = PhoneFarmAccessibilityService.instance ?: return

        when (action) {
            is VLMAction.Tap -> {
                service.click(action.x.toFloat(), action.y.toFloat())
            }
            is VLMAction.LongPress -> {
                service.longPress(action.x.toFloat(), action.y.toFloat(), action.durationMs)
            }
            is VLMAction.Swipe -> {
                service.swipe(
                    action.x1.toFloat(), action.y1.toFloat(),
                    action.x2.toFloat(), action.y2.toFloat(),
                    action.durationMs,
                )
            }
            is VLMAction.Type -> {
                service.inputText(action.text)
            }
            is VLMAction.Back -> {
                service.back()
            }
            is VLMAction.Home -> {
                service.home()
            }
            is VLMAction.Launch -> {
                // Launch via shell command (accessibility service cannot start activities)
                try {
                    val cmd = "am start -n ${action.packageName}/.MainActivity"
                    Runtime.getRuntime().exec(cmd)
                } catch (e: Exception) {
                    try {
                        // Fallback: use monkey
                        Runtime.getRuntime().exec(
                            "monkey -p ${action.packageName} -c android.intent.category.LAUNCHER 1"
                        )
                    } catch (_: Exception) {
                        android.util.Log.e("VlmAgent", "Failed to launch ${action.packageName}")
                    }
                }
            }
            is VLMAction.Terminate -> {
                // No UI action; termination is handled at the orchestration level
            }
        }
    }

    /**
     * Build a human-readable observation string from an executed action
     * for storage in the memory manager.
     */
    private fun buildActionObservation(stepNum: Int, action: VLMAction): String {
        return when (action) {
            is VLMAction.Tap -> "Step $stepNum: tapped at (${action.x}, ${action.y})"
            is VLMAction.LongPress -> "Step $stepNum: long pressed at (${action.x}, ${action.y})"
            is VLMAction.Swipe -> "Step $stepNum: swiped from (${action.x1},${action.y1}) to (${action.x2},${action.y2})"
            is VLMAction.Type -> "Step $stepNum: typed text '${action.text.take(30)}'"
            is VLMAction.Back -> "Step $stepNum: pressed back button"
            is VLMAction.Home -> "Step $stepNum: pressed home button"
            is VLMAction.Launch -> "Step $stepNum: launched app ${action.packageName}"
            is VLMAction.Terminate -> "Step $stepNum: task terminated: ${action.message}"
        }
    }

}

// === Agent State Machine ===

sealed class AgentState {
    /** Agent is idle, ready to accept a new task. */
    object Idle : AgentState()

    /** Agent is actively executing a task loop. */
    object Running : AgentState()

    /** Agent is paused mid-loop (will resume from same step). */
    object Paused : AgentState()

    /** Agent completed the task successfully. */
    object Completed : AgentState()

    /** Agent terminated with an error. */
    data class Error(val message: String) : AgentState()
}

// === VLM Step Data ===

/**
 * A single step in the VLM agent execution trace.
 */
data class VlmStep(
    val stepNum: Int,
    val totalSteps: Int,
    val reasoning: String,
    val action: VLMAction,
    val screenshotPath: String?,
    val selectorInfo: String?,
)

// === VLM Actions ===

/**
 * Actions that the VLM agent can emit, representing UI operations on the device.
 */
sealed class VLMAction {
    /** Tap at pixel coordinates (x, y). */
    data class Tap(val x: Int, val y: Int) : VLMAction()

    /** Long-press at pixel coordinates for [durationMs] milliseconds. */
    data class LongPress(val x: Int, val y: Int, val durationMs: Long = 800) : VLMAction()

    /** Swipe from (x1, y1) to (x2, y2) over [durationMs] milliseconds. */
    data class Swipe(val x1: Int, val y1: Int, val x2: Int, val y2: Int, val durationMs: Long = 300) : VLMAction()

    /** Type [text] into the currently focused input field. */
    data class Type(val text: String) : VLMAction()

    /** Press the Android back button. */
    object Back : VLMAction()

    /** Press the Android home button. */
    object Home : VLMAction()

    /** Launch the app identified by [packageName]. */
    data class Launch(val packageName: String) : VLMAction()

    /** Terminate the VLM task loop, optionally with a completion [message]. */
    data class Terminate(val message: String = "") : VLMAction()
}
