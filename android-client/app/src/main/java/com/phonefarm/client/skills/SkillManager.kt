package com.phonefarm.client.skills

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Matches user natural language queries to Skills and decides whether
 * to use the Delegation fast path or standard GUI automation.
 *
 * Three matching strategies (from Roubao design):
 *   - LLM: sends skill info to LLM, returns JSON {skill_id, confidence, reasoning}
 *   - KEYWORD: fast keyword-based matching (offline, no LLM cost)
 *   - HYBRID: LLM above threshold, else keyword (production default)
 *
 * The LLM-based matching is done by [BrainAgent] using the skill descriptions
 * injected into the system prompt. [SkillManager] provides the keyword fallback
 * and the delegation routing decision.
 */
@Singleton
class SkillManager @Inject constructor(
    private val skillRegistry: SkillRegistry,
) {

    companion object {
        /** Confidence threshold for delegation fast path. */
        const val DELEGATION_THRESHOLD = 0.8f

        /** Minimum LLM confidence before trusting its match. */
        const val LLM_THRESHOLD = 0.5f
    }

    /**
     * Match a user query to skills by keyword only (no LLM cost).
     * Used as fallback when LLM is unavailable, or as pre-filter.
     */
    fun matchByKeyword(query: String): SkillMatch? {
        val available = skillRegistry.getAvailable()
        if (available.isEmpty()) return null

        val lower = query.lowercase().trim()

        var bestMatch: Pair<SkillConfig, Int>? = null

        for (skill in available) {
            var score = 0

            for (keyword in skill.keywords) {
                val kwLower = keyword.lowercase()
                when {
                    // Exact match
                    lower == kwLower -> score += 100
                    // Query contains the full keyword
                    lower.contains(kwLower) -> score += 70
                    // Keyword contains the query
                    kwLower.contains(lower) -> score += 50
                    // Word-level overlap
                    lower.split("\\s+".toRegex()).any { w ->
                        w.length >= 2 && kwLower.contains(w)
                    } -> score += 30
                    // Partial overlap
                    lower.length >= 3 && kwLower.take(4) == lower.take(4) -> score += 20
                }
            }

            // Also check skill name and description
            if (skill.name.lowercase().contains(lower) || lower.contains(skill.name.lowercase())) {
                score += 40
            }

            if (score > 0 && (bestMatch == null || score > bestMatch.second)) {
                bestMatch = skill to score
            }
        }

        if (bestMatch == null) return null

        val (skill, score) = bestMatch
        val bestApp = skillRegistry.getBestApp(skill) ?: return null

        // Normalize score to confidence 0.0-1.0
        val confidence = (score / 150f).coerceIn(0f, 1f)

        return SkillMatch(
            skill = skill,
            confidence = confidence,
            matchedApp = bestApp,
            matchStrategy = MatchStrategy.KEYWORD,
        )
    }

    /**
     * Hybrid matching: use LLM result if confidence >= LLM_THRESHOLD,
     * otherwise fall back to keywords.
     */
    fun matchHybrid(
        query: String,
        llmSkillId: String?,
        llmConfidence: Float?,
    ): SkillMatch? {
        // Try LLM match first
        if (llmSkillId != null && llmConfidence != null && llmConfidence >= LLM_THRESHOLD) {
            val skill = skillRegistry.getById(llmSkillId)
            if (skill != null) {
                val bestApp = skillRegistry.getBestApp(skill)
                if (bestApp != null) {
                    return SkillMatch(
                        skill = skill,
                        confidence = llmConfidence,
                        matchedApp = bestApp,
                        matchStrategy = MatchStrategy.HYBRID,
                    )
                }
            }
        }
        // Fallback to keyword
        return matchByKeyword(query)
    }

    /**
     * Decide the execution mode for a successful skill match.
     *
     * DELEGATION: confidence >= 0.8 AND best app type is "delegation" AND has deepLink
     * GUI_AUTOMATION: matched but doesn't qualify for delegation
     * GENERIC_AGENT: no match at all
     */
    fun decideExecutionMode(match: SkillMatch?): ExecutionMode {
        if (match == null) return ExecutionMode.GENERIC_AGENT

        val app = match.matchedApp
        return if (match.confidence >= DELEGATION_THRESHOLD &&
            app.type == "delegation" &&
            !app.deepLink.isNullOrBlank()
        ) {
            ExecutionMode.DELEGATION
        } else {
            ExecutionMode.GUI_AUTOMATION
        }
    }

    /**
     * Build a compact description of all available skills for the LLM system prompt.
     * Example: "- order_food_meituan: 美团点外卖 (best via 小美AI delegation)"
     */
    fun generateSkillsPrompt(): String {
        val available = skillRegistry.getAvailable()
        if (available.isEmpty()) return ""

        return available.joinToString("\n") { skill ->
            val bestApp = skillRegistry.getBestApp(skill)
            val mode = if (bestApp?.type == "delegation") " [可快速委托]" else ""
            val params = if (skill.params.isNotEmpty()) {
                " 参数: ${skill.params.joinToString(", ") { "${it.name}:${it.type}" }}"
            } else ""
            "- ${skill.id}: ${skill.name} — ${skill.description}$mode$params"
        }
    }
}
