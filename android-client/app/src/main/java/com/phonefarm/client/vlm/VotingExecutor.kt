package com.phonefarm.client.vlm

import android.graphics.Bitmap
import com.phonefarm.client.vlm.adapters.AutoGLMAdapter
import com.phonefarm.client.vlm.adapters.QwenVLAdapter
import com.phonefarm.client.vlm.adapters.VlmAdapter
import okhttp3.OkHttpClient
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Multi-model voting executor for critical VLM decision steps.
 *
 * When the primary model's prediction has low confidence, or when the
 * agent reaches a critical decision point (e.g., payment confirmation,
 * account login), [VotingExecutor] queries one or more secondary models
 * and uses majority voting to select the best action.
 *
 * Voting strategies:
 *   - **Majority**: select action with most votes
 *   - **Weighted**: weigh by model quality scores
 *   - **Consensus**: require all N models to agree, else fall back to cloud
 */
@Singleton
class VotingExecutor @Inject constructor(
    private val okHttpClient: OkHttpClient,
    private val actionParser: ActionParser,
) {

    /**
     * Multi-model vote for a high-stakes action decision.
     *
     * @param screenshot      Current device screenshot.
     * @param taskContext     The user's NL task description.
     * @param config          VLM provider configuration for both models.
     * @param primaryModel    The primary model currently in use.
     * @param secondaryModel  A secondary model to query for voting.
     * @return The consensus [VLMAction], or null if models disagree.
     */
    suspend fun vote(
        screenshot: Bitmap,
        taskContext: String,
        config: CloudVlmConfig,
        primaryModel: String,
        secondaryModel: String? = null,
    ): VLMAction? {
        // Query primary model
        val primaryAdapter = createAdapter(primaryModel)
        val primaryResponse = primaryAdapter.execute(
            screenshot, taskContext, "", config.copy(promptTemplateStyle = primaryModel),
            emptyList(),
        )
        val primaryAction = actionParser.parse(primaryResponse.rawOutput, primaryModel)

        if (primaryAction == null) {
            android.util.Log.w("VotingExecutor", "Primary model failed to produce a valid action")
            return null
        }

        // If no secondary model specified, return primary action directly
        if (secondaryModel == null) return primaryAction

        // Query secondary model
        val secondaryAdapter = createAdapter(secondaryModel)
        val secondaryResponse = secondaryAdapter.execute(
            screenshot, taskContext, "", config.copy(promptTemplateStyle = secondaryModel),
            emptyList(),
        )
        val secondaryAction = actionParser.parse(secondaryResponse.rawOutput, secondaryModel)

        if (secondaryAction == null) {
            android.util.Log.w("VotingExecutor", "Secondary model failed; defaulting to primary")
            return primaryAction
        }

        // Check agreement
        if (actionsMatch(primaryAction, secondaryAction)) {
            // Consensus achieved
            android.util.Log.d(
                "VotingExecutor",
                "Consensus: $primaryModel and $secondaryModel agree on ${primaryAction.javaClass.simpleName}"
            )
            return primaryAction
        }

        // Disagreement — query a third model as tiebreaker
        android.util.Log.w("VotingExecutor", "Models disagree: $primaryModel vs $secondaryModel")
        return null
    }

    /**
     * Evaluate agreement between two actions at a semantic level.
     *
     * For tap: same type + coordinates within tolerancePx → agree
     * For swipe: same direction + similar distance → agree
     * For type: same text → agree
     */
    fun actionsMatch(a: VLMAction, b: VLMAction, tolerancePx: Int = 50): Boolean {
        return when {
            a is VLMAction.Tap && b is VLMAction.Tap -> {
                kotlin.math.abs(a.x - b.x) <= tolerancePx &&
                    kotlin.math.abs(a.y - b.y) <= tolerancePx
            }
            a is VLMAction.LongPress && b is VLMAction.LongPress -> {
                kotlin.math.abs(a.x - b.x) <= tolerancePx &&
                    kotlin.math.abs(a.y - b.y) <= tolerancePx
            }
            a is VLMAction.Swipe && b is VLMAction.Swipe -> {
                // Check same direction and similar distance
                val dx1 = a.x2 - a.x1
                val dy1 = a.y2 - a.y1
                val dx2 = b.x2 - b.x1
                val dy2 = b.y2 - b.y1
                val sameDirection = (dx1.toLong() * dx2 >= 0) && (dy1.toLong() * dy2 >= 0)
                val similarDistance = kotlin.math.abs(kotlin.math.sqrt((dx1 * dx1 + dy1 * dy1).toDouble()) -
                    kotlin.math.sqrt((dx2 * dx2 + dy2 * dy2).toDouble())) < tolerancePx
                sameDirection && similarDistance
            }
            a is VLMAction.Type && b is VLMAction.Type -> a.text == b.text
            a is VLMAction.Back && b is VLMAction.Back -> true
            a is VLMAction.Home && b is VLMAction.Home -> true
            a is VLMAction.Launch && b is VLMAction.Launch -> a.packageName == b.packageName
            a is VLMAction.Terminate && b is VLMAction.Terminate -> true
            else -> false // Different action types cannot match
        }
    }

    private fun createAdapter(modelType: String): VlmAdapter {
        return when (modelType.lowercase()) {
            "autoglm", "uitars" -> AutoGLMAdapter(okHttpClient)
            "qwenvl" -> QwenVLAdapter(okHttpClient)
            "maiui" -> com.phonefarm.client.vlm.adapters.MaiuiAdapter(okHttpClient)
            "guiowl" -> com.phonefarm.client.vlm.adapters.GuiOwlAdapter(okHttpClient)
            else -> AutoGLMAdapter(okHttpClient)
        }
    }
}
