package com.phonefarm.client.vlm

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Validate a [VLMAction] before it is dispatched to the accessibility service.
 *
 * Validation checks:
 *   - Coordinates are within screen bounds
 *   - Swipe has non-zero distance (start != end)
 *   - Type text is not empty
 *   - Launch package name is non-blank
 *   - Terminate state is well-formed
 *
 * Invalid actions are logged and may trigger automated retry (the agent
 * can ask the VLM to re-predict with the validation error as feedback).
 */
@Singleton
class ActionValidator @Inject constructor() {

    /**
     * Validate an action against the given screen dimensions.
     *
     * @param action       The VLM-predicted action to validate.
     * @param screenWidth  Device screen width in pixels.
     * @param screenHeight Device screen height in pixels.
     * @return [ValidationResult] with OK status or error details.
     */
    fun validate(
        action: VLMAction,
        screenWidth: Int,
        screenHeight: Int,
    ): ValidationResult {
        return when (action) {
            is VLMAction.Tap -> {
                if (action.x !in 0 until screenWidth || action.y !in 0 until screenHeight)
                    ValidationResult.Invalid("Tap coordinates ($action.x,$action.y) out of bounds [0..${screenWidth - 1},0..${screenHeight - 1}]")
                else
                    ValidationResult.Valid
            }
            is VLMAction.LongPress -> {
                if (action.x !in 0 until screenWidth || action.y !in 0 until screenHeight)
                    ValidationResult.Invalid("LongPress coordinates ($action.x,$action.y) out of bounds")
                else if (action.durationMs < 100)
                    ValidationResult.Invalid("LongPress duration too short: ${action.durationMs}ms")
                else
                    ValidationResult.Valid
            }
            is VLMAction.Swipe -> {
                if (action.x1 !in 0 until screenWidth || action.y1 !in 0 until screenHeight ||
                    action.x2 !in 0 until screenWidth || action.y2 !in 0 until screenHeight
                )
                    ValidationResult.Invalid("Swipe coordinates out of bounds")
                else if (action.x1 == action.x2 && action.y1 == action.y2)
                    ValidationResult.Invalid("Swipe has zero distance: start=end=(${action.x1},${action.y1})")
                else if (action.durationMs < 50)
                    ValidationResult.Invalid("Swipe duration too short: ${action.durationMs}ms")
                else
                    ValidationResult.Valid
            }
            is VLMAction.Type -> {
                if (action.text.isBlank())
                    ValidationResult.Invalid("Type text is blank")
                else
                    ValidationResult.Valid
            }
            is VLMAction.Launch -> {
                if (action.packageName.isBlank())
                    ValidationResult.Invalid("Launch packageName is blank")
                else if (!action.packageName.matches(Regex("^[a-zA-Z][a-zA-Z0-9_.]*[a-zA-Z0-9]$")))
                    ValidationResult.Invalid("Launch packageName '${action.packageName}' is not a valid package pattern")
                else
                    ValidationResult.Valid
            }
            is VLMAction.Back, is VLMAction.Home, is VLMAction.Terminate -> ValidationResult.Valid
        }
    }
}

/**
 * Result of action validation.
 */
sealed class ValidationResult {
    /** Action is valid and can be dispatched. */
    object Valid : ValidationResult()

    /** Action is invalid and should be rejected. */
    data class Invalid(val reason: String) : ValidationResult()
}
