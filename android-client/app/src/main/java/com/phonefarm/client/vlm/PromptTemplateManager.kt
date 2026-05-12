package com.phonefarm.client.vlm

import android.content.Context
import com.phonefarm.client.data.local.dao.CloudConfigDao
import com.phonefarm.client.data.local.entity.CloudConfigEntity
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Prompt template versioning and A/B testing manager.
 *
 * VLM prompt templates are fetched from the control server on startup
 * and cached locally. The server may serve different template variants
 * (A/B testing) based on device ID. Templates are versioned, allowing
 * rollback to known-good versions.
 *
 * Template variables substituted at runtime:
 *   {{SCREEN_WIDTH}}, {{SCREEN_HEIGHT}}  → device dimensions
 *   {{TASK}}                              → user's NL task
 *   {{MEMORY_HINTS}}                      → MemoryManager query results
 *   {{HISTORY}}                           → conversation history
 *   {{CURRENT_PACKAGE}}                   → current foreground app
 *   {{DEVICE_MODEL}}                      → Build.MODEL
 */
@Singleton
class PromptTemplateManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val cloudConfigDao: CloudConfigDao,
) {

    private val cache = mutableMapOf<String, String>()
    private val mutex = Mutex()

    /** Default fallback templates (used when cloud sync is unavailable). */
    private val defaultTemplates = mapOf(
        "autoglm" to """
你是一个手机操作助手。根据当前屏幕截图，决定下一步操作。

可用操作格式（使用归一化坐标系 [0, 1000]）：
do(action="Tap", element=[x, y])
do(action="LongPress", element=[x, y])
do(action="Swipe", element=[x1, y1, x2, y2])
do(action="Type", text="要输入的文字")
do(action="Back")
do(action="Home")
do(action="Launch", app="包名")
finish(message="任务完成描述")

任务: {{TASK}}
{{MEMORY_HINTS}}
{{HISTORY}}

先分析当前屏幕，然后在 <answer> 标签中给出操作指令。
        """.trimIndent(),

        "qwenvl" to """
You are a smartphone GUI automation assistant. Based on the current screenshot, decide the next action.

Available actions (JSON format):
{"action": "tap", "x": 0.5, "y": 0.3}
{"action": "long_press", "x": 0.5, "y": 0.3}
{"action": "swipe", "x1": 0.5, "y1": 0.7, "x2": 0.5, "y2": 0.3}
{"action": "type", "text": "hello"}
{"action": "back"}
{"action": "home"}
{"action": "launch", "package": "com.example.app"}
{"action": "terminate", "message": "done"}

Task: {{TASK}}
{{MEMORY_HINTS}}
{{HISTORY}}

Output a single JSON action object.
        """.trimIndent(),

        "maiui" to """
You are a precise mobile UI automation agent. Based on the current screen, output the next action in JSON.

Available actions: tap, long_press, swipe, type, back, home, launch, terminate.
Coordinates: pixel values matching the screenshot resolution.
Screen: {{SCREEN_WIDTH}}x{{SCREEN_HEIGHT}}

Task: {{TASK}}
{{MEMORY_HINTS}}
{{HISTORY}}
        """.trimIndent(),

        "guiowl" to """
You are a smartphone control agent. Given the screenshot, describe the next action in plain English.

Available commands:
- click at (x, y)
- long press at (x, y)
- swipe from (x1, y1) to (x2, y2)
- type "text"
- press back
- press home
- launch com.example.app
- task complete

Task: {{TASK}}
{{MEMORY_HINTS}}
{{HISTORY}}
        """.trimIndent(),

        "custom" to """
You are a mobile phone GUI automation agent. Analyze the screenshot and output the next UI action.

System: Android device {{DEVICE_MODEL}}, screen {{SCREEN_WIDTH}}x{{SCREEN_HEIGHT}}
Current app: {{CURRENT_PACKAGE}}
Task: {{TASK}}
{{MEMORY_HINTS}}
{{HISTORY}}

Provide your action in JSON format:
{"action": "<action_name>", "<params>": "<values>"}
        """.trimIndent(),
    )

    /**
     * Get the current prompt template for the given model type and device.
     */
    suspend fun getTemplate(modelType: String, deviceId: String): String {
        mutex.withLock {
            val configKey = "vlm_template_${modelType}_${abBucket(deviceId)}"

            // Check in-memory cache
            cache[configKey]?.let { return it }

            // Check local DB
            val entity = cloudConfigDao.get(configKey)
            if (entity != null) {
                cache[configKey] = entity.configValue
                return entity.configValue
            }

            // Fall back to built-in default
            val default = defaultTemplates[modelType.lowercase()]
                ?: defaultTemplates["custom"]!!
            cache[configKey] = default
            return default
        }
    }

    /**
     * Sync prompt templates from the control server.
     */
    suspend fun syncTemplates() {
        try {
            // In a full implementation, this would call:
            // GET /api/v1/vlm/templates from the control server
            // Parse the JSON response, compare versions, and upsert new templates.
            // For now, the built-in defaults serve as the canonical templates.
            for ((modelType, template) in defaultTemplates) {
                val configKey = "vlm_template_${modelType}_0"
                val existing = cloudConfigDao.get(configKey)
                if (existing == null) {
                    cloudConfigDao.upsert(
                        CloudConfigEntity(
                            configKey = configKey,
                            configValue = template,
                            updatedAt = System.currentTimeMillis(),
                        )
                    )
                }
            }
        } catch (_: Exception) {
            // Sync failure is non-fatal; defaults are always available
        }
    }

    /**
     * Substitute runtime variables into a template string.
     *
     * Placeholders: {{KEY}} replaced by variables[KEY] value.
     * Missing keys are replaced with "".
     */
    fun renderTemplate(
        template: String,
        variables: Map<String, String>,
    ): String {
        var result = template
        val placeholderRegex = Regex("""\{\{(\w+)}}""")
        for (match in placeholderRegex.findAll(template)) {
            val key = match.groupValues[1]
            val value = variables[key] ?: ""
            result = result.replace(match.value, value)
        }
        return result
    }

    /**
     * Assign the device to an A/B test bucket [0, N) based on deviceId hash.
     * Returns the bucket index as a string.
     */
    private fun abBucket(deviceId: String): String {
        val hash = deviceId.hashCode().let { if (it < 0) -it else it }
        return (hash % 4).toString()
    }
}
