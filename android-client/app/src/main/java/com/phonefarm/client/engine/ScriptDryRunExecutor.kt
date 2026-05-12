package com.phonefarm.client.engine

import kotlinx.coroutines.delay
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Dry-run mode for DeekeScript automation scripts.
 *
 * When enabled, the automation engine logs every action that WOULD be
 * executed without actually performing any UI gestures, accessibility
 * actions, or network requests. This is useful for:
 *  - Debugging script logic without risk of side effects
 *  - Validating script compilation output from VLM episodes
 *  - Estimating task duration for scheduling
 *
 * Each "action" is logged as a [DryRunStep] with timestamp, action type,
 * and target element description.
 */
@Singleton
class ScriptDryRunExecutor @Inject constructor() {

    data class DryRunStep(
        val stepNumber: Int,
        val action: String,           // click, swipe, inputText, scroll, wait, etc.
        val target: String,           // descriptor or coordinate
        val arguments: String?,       // e.g., text content for inputText
        val estimatedDurationMs: Long,
        val timestamp: Long = System.currentTimeMillis(),
    )

    data class DryRunResult(
        val scriptName: String,
        val totalSteps: Int,
        val steps: List<DryRunStep>,
        val estimatedTotalDurationMs: Long,
        val errors: List<String>,
    )

    /**
     * Whether dry-run mode is currently active.
     */
    @Volatile
    var isDryRunMode: Boolean = false

    /** Accumulated steps during a dry run. */
    private val steps = mutableListOf<DryRunStep>()

    /** Errors encountered during dry run (e.g., unresolvable selectors). */
    private val errors = mutableListOf<String>()

    /**
     * Start a new dry run session.
     *
     * Sets [isDryRunMode] to true and clears previous step data.
     */
    fun startDryRun() {
        isDryRunMode = true
        steps.clear()
        errors.clear()
    }

    /**
     * Stop the dry run and return the accumulated [DryRunResult].
     *
     * @param scriptName  Name of the script that was dry-run.
     * @return [DryRunResult] summarizing all simulated steps.
     */
    fun finishDryRun(scriptName: String): DryRunResult {
        isDryRunMode = false
        val result = DryRunResult(
            scriptName = scriptName,
            totalSteps = steps.size,
            steps = steps.toList(),
            estimatedTotalDurationMs = steps.sumOf { it.estimatedDurationMs },
            errors = errors.toList(),
        )
        steps.clear()
        errors.clear()
        return result
    }

    /**
     * Log a simulated action step. Called by the automation engine when
     * [isDryRunMode] is true instead of performing the real action.
     *
     * @param action    Action type identifier.
     * @param target    Target element description.
     * @param arguments Optional action arguments.
     * @param estimatedDurationMs Estimated real-world duration for this action.
     */
    fun logStep(
        action: String,
        target: String,
        arguments: String? = null,
        estimatedDurationMs: Long = 500L,
    ) {
        if (!isDryRunMode) return

        steps.add(
            DryRunStep(
                stepNumber = steps.size + 1,
                action = action,
                target = target,
                arguments = arguments,
                estimatedDurationMs = estimatedDurationMs,
            )
        )
    }

    /**
     * Log an error encountered during the dry run.
     *
     * Errors do NOT stop the dry run; they are collected for reporting.
     */
    fun logError(error: String) {
        if (!isDryRunMode) return
        errors.add(error)
    }

    /**
     * Execute an artificial delay to simulate real-world timing.
     * Only delays when [isDryRunMode] is true.
     */
    suspend fun simulateDelay(ms: Long) {
        if (isDryRunMode && ms > 0) {
            // In dry-run mode, simulate but with a cap to keep it fast.
            val effectiveDelay = ms.coerceAtMost(200L)
            delay(effectiveDelay)
        }
    }

    /**
     * Predicted action durations for common automation operations.
     * These are conservative estimates for reporting purposes.
     */
    companion object {
        val ACTION_DURATIONS = mapOf(
            "click" to 300L,
            "longClick" to 1000L,
            "swipe" to 500L,
            "inputText" to 400L,
            "scroll" to 800L,
            "wait" to 1000L,
            "screenshot" to 1500L,
            "back" to 200L,
            "home" to 300L,
            "launchApp" to 2000L,
            "findElement" to 200L,
            "networkRequest" to 3000L,
        )
    }
}
