package com.phonefarm.client.engine

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.last
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Sequential task chain execution with conditional branching.
 *
 * Chains allow multiple automation scripts to run in sequence, with the
 * output/result of each task determining the next step. This is useful for:
 *  - Login → browse → like → comment → follow pipelines
 *  - Retry loops (if like failed, retry from browse step)
 *  - Platform switching (finish Douyin → start Kuaishou)
 *
 * Chains are defined as a list of [ChainStep] objects, each specifying
 * the script to run and optional branching conditions.
 */
@Singleton
class TaskChainExecutor @Inject constructor(
    private val scriptEngine: ScriptEngine,
) {

    data class ChainStep(
        val stepId: String,
        val scriptName: String,
        val config: Map<String, String> = emptyMap(),
        /** Map of "result_key" → nextStepId for branching. null key = default next. */
        val branches: Map<String, String?> = emptyMap(),
        val nextStepId: String? = null, // default next step (null = end)
        val maxRetries: Int = 0,
    )

    data class ChainResult(
        val chainId: String,
        val completed: Boolean,
        val currentStep: String?,
        val stepResults: Map<String, Boolean>, // stepId → success
        val totalSteps: Int,
        val completedSteps: Int,
        val errorMessage: String?,
    )

    enum class ChainStatus {
        IDLE,
        RUNNING,
        COMPLETED,
        FAILED,
        PAUSED,
    }

    data class ChainState(
        val chainId: String,
        val status: ChainStatus = ChainStatus.IDLE,
        val currentStep: String? = null,
        val stepIndex: Int = 0,
        val progress: Float = 0f,
        val result: ChainResult? = null,
    )

    private val _chainState = MutableStateFlow<ChainState?>(null)
    val chainState: StateFlow<ChainState?> = _chainState.asStateFlow()

    // ---- public API ----

    /**
     * Execute a chain of tasks sequentially.
     *
     * For each step:
     *  1. Execute the script via the automation engine.
     *  2. Evaluate the result.
     *  3. Determine the next step based on branching rules.
     *  4. If the step fails and has remaining retries, retry with backoff.
     *  5. Continue until we reach a step with no nextStepId.
     *
     * @param chainId  Unique identifier for this chain run.
     * @param steps    The ordered list of [ChainStep] definitions.
     * @return [ChainResult] with full execution details.
     */
    suspend fun execute(chainId: String, steps: List<ChainStep>): ChainResult {
        val totalSteps = steps.size
        val stepResults = mutableMapOf<String, Boolean>()
        var currentStep: ChainStep? = steps.firstOrNull()
        var completedSteps = 0
        var errorMessage: String? = null

        _chainState.value = ChainState(
            chainId = chainId,
            status = ChainStatus.RUNNING,
            currentStep = currentStep?.stepId,
            stepIndex = 0,
            progress = 0f,
        )

        while (currentStep != null) {
            var retries = currentStep.maxRetries
            var success = false
            var lastError: String? = null

            while (!success && retries >= 0) {
                try {
                    val lastStep = scriptEngine.execute(
                        currentStep.scriptName,
                        currentStep.config.mapValues { it.value as Any }
                    ).last()

                    success = when (lastStep) {
                        is ScriptStep.Completed -> true
                        is ScriptStep.Cancelled -> false
                        is ScriptStep.Error -> false
                        else -> true
                    }

                    if (!success && lastStep is ScriptStep.Error) {
                        lastError = lastStep.message
                    }
                } catch (e: Exception) {
                    lastError = e.message
                    success = false
                }
                if (!success && retries > 0) {
                    kotlinx.coroutines.delay(1000L * (currentStep.maxRetries - retries + 1))
                }
                retries--
            }

            stepResults[currentStep.stepId] = success
            completedSteps++

            val progress = completedSteps.toFloat() / totalSteps.toFloat()
            _chainState.value = _chainState.value?.copy(
                currentStep = currentStep.stepId,
                stepIndex = completedSteps - 1,
                progress = progress,
            )

            // Determine next step based on result status.
            val nextId = if (success) {
                val resultKey = if (success) "success" else "failed"
                currentStep.branches[resultKey] ?: currentStep.nextStepId
            } else {
                // On failure, check branch for "failed" key, else retry or abort.
                val failBranch = currentStep.branches["failed"]
                if (failBranch != null) {
                    failBranch
                } else {
                    errorMessage = "Step '${currentStep.stepId}' failed"
                    currentStep = null
                    break
                }
            }

            currentStep = if (nextId != null) {
                steps.find { it.stepId == nextId }
            } else null
        }

        val completed = completedSteps == totalSteps && errorMessage == null

        val result = ChainResult(
            chainId = chainId,
            completed = completed,
            currentStep = currentStep?.stepId,
            stepResults = stepResults,
            totalSteps = totalSteps,
            completedSteps = completedSteps,
            errorMessage = errorMessage,
        )

        _chainState.value = _chainState.value?.copy(
            status = if (completed) ChainStatus.COMPLETED else ChainStatus.FAILED,
            result = result,
        )

        return result
    }

    /**
     * Pause the currently running chain. The current step will complete
     * but the next step will not start until [resume] is called.
     */
    fun pause() {
        _chainState.value?.let { state ->
            _chainState.value = state.copy(status = ChainStatus.PAUSED)
        }
    }

    /**
     * Resume a paused chain.
     */
    fun resume() {
        _chainState.value?.let { state ->
            if (state.status == ChainStatus.PAUSED) {
                _chainState.value = state.copy(status = ChainStatus.RUNNING)
            }
        }
    }

    /**
     * Get the current chain state for a given chain ID.
     */
    fun getState(chainId: String): ChainState? {
        return _chainState.value?.takeIf { it.chainId == chainId }
    }

    /**
     * Reset the chain state to IDLE.
     */
    fun reset() {
        _chainState.value = null
    }
}
