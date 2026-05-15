package com.phonefarm.client.skills

/**
 * Data-driven Skill definitions — each Skill maps a user intent to
 * one or more related apps with execution strategies (delegation or GUI automation).
 */

/** Top-level skill definition, deserialized from skills.json. */
data class SkillConfig(
    val id: String,
    val name: String,
    val description: String,
    val category: String = "",
    val keywords: List<String> = emptyList(),
    val params: List<SkillParam> = emptyList(),
    val relatedApps: List<RelatedApp> = emptyList(),
    val promptHint: String = "",
)

data class SkillParam(
    val name: String,
    val type: String = "string",
    val description: String = "",
    val required: Boolean = false,
)

/**
 * A related app entry within a Skill.
 *
 * @param type "delegation" (fast: direct DeepLink to AI app) or "gui_automation" (standard: VLM agent loop)
 * @param priority Higher = preferred. Delegation apps should have highest priority (100).
 * @param deepLink URI template for delegation (e.g. "meituan://ai/chat?query={food}")
 * @param steps High-level step hints for GUI automation
 */
data class RelatedApp(
    val `package`: String,
    val name: String,
    val type: String = "gui_automation",
    val priority: Int = 50,
    val deepLink: String? = null,
    val steps: List<String> = emptyList(),
)

// ── Runtime types ──

/** Result of matching a user query to a Skill. */
data class SkillMatch(
    val skill: SkillConfig,
    val confidence: Float,          // 0.0 - 1.0
    val matchedApp: RelatedApp,     // best available app for this skill
    val extractedParams: Map<String, String> = emptyMap(),
    val matchStrategy: MatchStrategy,
)

enum class MatchStrategy {
    /** LLM-based semantic matching (highest accuracy) */
    LLM,
    /** Keyword-based fast matching (fallback when LLM unavailable) */
    KEYWORD,
    /** Hybrid: LLM above threshold, else keyword (production default) */
    HYBRID,
}

/** Execution mode determined after skill matching. */
enum class ExecutionMode {
    /** Fast path: direct DeepLink to AI-native app — ~1s response, zero VLM tokens */
    DELEGATION,
    /** Standard path: VLM agent loop with screenshot → plan → act → reflect */
    GUI_AUTOMATION,
    /** No matching skill — fall through to generic Brain Agent loop */
    GENERIC_AGENT,
}
