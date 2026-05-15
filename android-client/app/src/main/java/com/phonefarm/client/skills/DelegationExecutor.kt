package com.phonefarm.client.skills

import android.content.Context
import android.content.Intent
import android.net.Uri
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Executes the Delegation fast path — opens an AI-native app via DeepLink
 * and lets that app's AI handle the user's request.
 *
 * This completely bypasses the VLM agent loop, giving:
 *   - ~1 second response time (vs ~30s for GUI automation)
 *   - Zero VLM token cost
 *   - Higher success rate for supported apps
 */
@Singleton
class DelegationExecutor @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /**
     * Execute a delegation by resolving the deepLink template with extracted params
     * and launching the Intent.
     *
     * @param deepLink URI template, e.g. "meituan://ai/chat?query={food}"
     * @param params extracted values, e.g. {"food": "pizza"}
     * @param targetPackage the app package to target
     * @return true if the deep link launched successfully
     */
    fun execute(
        deepLink: String,
        params: Map<String, String> = emptyMap(),
        targetPackage: String,
    ): Boolean {
        val resolvedUri = resolveTemplate(deepLink, params)

        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(resolvedUri)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                setPackage(targetPackage)
            }

            val resolved = context.packageManager.resolveActivity(intent, 0)
            if (resolved != null) {
                context.startActivity(intent)
                true
            } else {
                // Try without package restriction as fallback
                val fallbackIntent = Intent(Intent.ACTION_VIEW, Uri.parse(resolvedUri)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                val fallbackResolved = context.packageManager.resolveActivity(fallbackIntent, 0)
                if (fallbackResolved != null) {
                    context.startActivity(fallbackIntent)
                    true
                } else {
                    false
                }
            }
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Execute a full [SkillMatch] via delegation.
     * @return true if delegation was successful
     */
    fun executeMatch(match: SkillMatch): Boolean {
        val app = match.matchedApp
        val deepLink = app.deepLink ?: return false
        return execute(
            deepLink = deepLink,
            params = match.extractedParams,
            targetPackage = app.`package`,
        )
    }

    // ── Internal ──

    /**
     * Resolve template placeholders like {food} with actual values.
     * Values are URL-encoded for safety.
     */
    private fun resolveTemplate(template: String, params: Map<String, String>): String {
        var result = template
        for ((key, value) in params) {
            val encoded = Uri.encode(value)
            result = result.replace("{${key}}", encoded)
        }
        return result
    }
}
