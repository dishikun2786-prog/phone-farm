package com.phonefarm.client.vlm

import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Parse the raw VLM output string into a structured [VLMAction].
 *
 * VLM models return actions in different formats depending on prompt template:
 *   - AutoGLM / UI-TARS: XML tag format
 *     `<think>...</think><answer>do(action="Tap", element=[x,y])</answer>`
 *   - Qwen-VL / MAI-UI: JSON format
 *     `{"action": "tap", "x": 500, "y": 300}`
 *   - GUI-Owl: text-based
 *     `click at (500, 300)`
 *
 * The parser detects the format and extracts both the reasoning/thinking
 * block (e.g., `思考` / `分析` / `Thought:`) and the executable action.
 */
@Singleton
class ActionParser @Inject constructor() {

    /**
     * Parse a raw VLM output string into a [VLMAction].
     *
     * @param rawOutput The unprocessed text output from the VLM.
     * @param modelType One of: autoglm, uitars, qwenvl, maiui, guiowl, custom.
     * @return Parsed [VLMAction], or null if parsing failed.
     */
    fun parse(rawOutput: String, modelType: String): VLMAction? {
        val output = rawOutput.trim()

        // === Strategy 1: AutoGLM / UI-TARS XML-tag format ===
        // <answer>do(action="Tap", element=[540, 1200])</answer>
        if (modelType in listOf("autoglm", "uitars")) {
            return parseAutoGLMFormat(output) ?: parseJsonFormat(output)
        }

        // === Strategy 2: Qwen-VL / MAI-UI JSON format ===
        // {"action":"tap","x":540,"y":1200}
        if (modelType in listOf("qwenvl", "maiui")) {
            return parseJsonFormat(output) ?: parseAutoGLMFormat(output)
        }

        // === Strategy 3: GUI-Owl text format ===
        // "click at (500, 300)"
        if (modelType == "guiowl") {
            return parseGuiOwlFormat(output) ?: parseJsonFormat(output)
        }

        // === Strategy 4: Custom / unknown — try all formats ===
        return parseJsonFormat(output)
            ?: parseAutoGLMFormat(output)
            ?: parseGuiOwlFormat(output)
    }

    /**
     * Extract the model's reasoning/thinking block from raw output.
     */
    fun extractThinking(rawOutput: String): String {
        val output = rawOutput.trim()

        // AutoGLM: <think>...</think>
        val thinkRegex = Regex(
            """<think>(.*?)</think>""",
            setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE),
        )
        val thinkMatch = thinkRegex.find(output)
        if (thinkMatch != null) {
            return thinkMatch.groupValues[1].trim()
        }

        // Chinese markers: 思考： / 分析： / 推理：
        val chineseRegex = Regex(
            """(?:思考|分析|推理)[：:]\s*(.+?)(?=\n(?:操作|动作|action|do|\{|<answer|<action)|$)""",
            setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE),
        )
        val cnMatch = chineseRegex.find(output)
        if (cnMatch != null) {
            return cnMatch.groupValues[1].trim()
        }

        // English markers: Thought: / Reasoning: / Analysis:
        val enRegex = Regex(
            """(?:Thought|Reasoning|Analysis)[：:]\s*(.+?)(?=\n(?:Action|do|\{|<answer|<action)|$)""",
            setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.IGNORE_CASE),
        )
        val enMatch = enRegex.find(output)
        if (enMatch != null) {
            return enMatch.groupValues[1].trim()
        }

        return ""
    }

    // ======== Private format parsers ========

    /**
     * Parse AutoGLM / UI-TARS format:
     *   do(action="Tap", element=[540, 1200])
     *   do(action="LongPress", element=[500, 800])
     *   do(action="Swipe", element=[100, 500, 100, 200])
     *   do(action="Type", text="hello")
     *   do(action="Back")
     *   do(action="Home")
     *   do(action="Launch", app="com.tencent.mm")
     *   finish(message="Task complete")
     */
    private fun parseAutoGLMFormat(output: String): VLMAction? {
        // Primary: do(action="...", ...) style
        val doRegex = Regex(
            """do\(action="(\w+)",?\s*(.*?)\)""",
            setOf(RegexOption.DOT_MATCHES_ALL),
        )
        val doMatch = doRegex.find(output)

        if (doMatch != null) {
            val actionName = doMatch.groupValues[1].lowercase()
            val params = doMatch.groupValues[2]

            return buildActionFromParams(actionName, params)
        }

        // Alternative: <action type="..."><x>N</x><y>N</y></action>
        val xmlActionRegex = Regex(
            """<action\s+type="(\w+)">(.*?)</action>""",
            setOf(RegexOption.DOT_MATCHES_ALL),
        )
        val xmlMatch = xmlActionRegex.find(output)
        if (xmlMatch != null) {
            val actionName = xmlMatch.groupValues[1].lowercase()
            val body = xmlMatch.groupValues[2]

            val x = Regex("""<x>(\d+)</x>""").find(body)?.groupValues?.get(1)?.toIntOrNull()
            val y = Regex("""<y>(\d+)</y>""").find(body)?.groupValues?.get(1)?.toIntOrNull()
            val x2 = Regex("""<x2>(\d+)</x2>""").find(body)?.groupValues?.get(1)?.toIntOrNull()
            val y2 = Regex("""<y2>(\d+)</y2>""").find(body)?.groupValues?.get(1)?.toIntOrNull()
            val text = Regex("""<text>(.*?)</text>""", setOf(RegexOption.DOT_MATCHES_ALL))
                .find(body)?.groupValues?.get(1)
            val app = Regex("""<app>(.*?)</app>""").find(body)?.groupValues?.get(1)

            return buildActionFromFields(
                actionName, x, y, x2, y2, text, app, null, null
            )
        }

        // finish(message="...")
        val finishRegex = Regex("""finish\(message="(.*?)"\)""")
        val finishMatch = finishRegex.find(output)
        if (finishMatch != null) {
            return VLMAction.Terminate(message = finishMatch.groupValues[1])
        }

        return null
    }

    /**
     * Parse Qwen-VL / MAI-UI JSON format:
     *   {"action": "tap", "x": 540, "y": 1200}
     *   {"action": "swipe", "start": [100, 500], "end": [100, 200]}
     *   {"action": "type", "text": "hello world"}
     *   {"action": "back"}
     *   {"action": "terminate", "message": "done"}
     */
    private fun parseJsonFormat(output: String): VLMAction? {
        // Extract JSON object from output (strips markdown fences and surrounding text)
        val jsonStr = extractJsonObject(output) ?: return null

        return try {
            val json = JSONObject(jsonStr)

            val action = json.optString("action", "").lowercase()
            val x = json.optInt("x", -1).let { if (it == -1) null else it }
            val y = json.optInt("y", -1).let { if (it == -1) null else it }

            // Handle nested coordinate formats
            val start = json.optJSONArray("start")
            val end = json.optJSONArray("end")
            val x1 = start?.optInt(0, -1)?.let { if (it == -1) x else it }
            val y1 = start?.optInt(1, -1)?.let { if (it == -1) y else it }
            val x2 = end?.optInt(0, -1)
            val y2 = end?.optInt(1, -1)

            // Alternative swipe format
            val sx1 = json.optInt("x1", -1).let { if (it >= 0) it else x1 }
            val sy1 = json.optInt("y1", -1).let { if (it >= 0) it else y1 }
            val sx2 = json.optInt("x2", -1).let { if (it >= 0) it else x2 }
            val sy2 = json.optInt("y2", -1).let { if (it >= 0) it else y2 }

            val text = json.optString("text", null)
            val packageName = json.optString("package", null)
                ?: json.optString("app", null)
                ?: json.optString("packageName", null)
            val message = json.optString("message", null)
            val durationMs = json.optLong("duration_ms", 300)

            buildActionFromFields(
                action, x ?: sx1, y ?: sy1, sx2, sy2, text, packageName, message, durationMs,
            )
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Parse GUI-Owl text format:
     *   click at (x, y)
     *   long press at (x, y)
     *   swipe from (x1, y1) to (x2, y2)
     *   type "hello world"
     *   press back
     *   press home
     *   launch com.example.app
     *   task complete
     */
    private fun parseGuiOwlFormat(output: String): VLMAction? {
        val lower = output.lowercase().trim().replace(Regex("""[“”'']"""), "\"")

        // Terminate
        if (lower.contains("task complete") || lower.contains("finish") || lower.contains("terminate")) {
            val msg = Regex("""task complete[:\s]*(.*)""", RegexOption.IGNORE_CASE).find(lower)
                ?.groupValues?.get(1)?.trim() ?: ""
            return VLMAction.Terminate(message = msg)
        }

        // Swipe
        val swipeRegex = Regex(
            """swipe\s+from\s*[\[(]?\s*(\d+)\s*,\s*(\d+)\s*[\])]?\s*to\s*[\[(]?\s*(\d+)\s*,\s*(\d+)\s*[\])]?""",
            RegexOption.IGNORE_CASE,
        )
        val swipeMatch = swipeRegex.find(lower)
        if (swipeMatch != null) {
            return VLMAction.Swipe(
                x1 = swipeMatch.groupValues[1].toInt(),
                y1 = swipeMatch.groupValues[2].toInt(),
                x2 = swipeMatch.groupValues[3].toInt(),
                y2 = swipeMatch.groupValues[4].toInt(),
            )
        }

        // Long press
        val longPressRegex = Regex(
            """long\s*press\s*(?:at\s*)?[\[(]?\s*(\d+)\s*,\s*(\d+)\s*[\])]?""",
            RegexOption.IGNORE_CASE,
        )
        val lpMatch = longPressRegex.find(lower)
        if (lpMatch != null) {
            return VLMAction.LongPress(
                x = lpMatch.groupValues[1].toInt(),
                y = lpMatch.groupValues[2].toInt(),
            )
        }

        // Click / Tap
        val clickRegex = Regex(
            """(?:click|tap)\s*(?:at\s*)?[\[(]?\s*(\d+)\s*,\s*(\d+)\s*[\])]?""",
            RegexOption.IGNORE_CASE,
        )
        val clickMatch = clickRegex.find(lower)
        if (clickMatch != null) {
            return VLMAction.Tap(
                x = clickMatch.groupValues[1].toInt(),
                y = clickMatch.groupValues[2].toInt(),
            )
        }

        // Type
        val typeRegex = Regex(
            """type\s*"([^"]*)"""",
            RegexOption.IGNORE_CASE,
        )
        val typeMatch = typeRegex.find(lower)
        if (typeMatch != null) {
            return VLMAction.Type(text = typeMatch.groupValues[1])
        }

        // Back
        if (lower.contains("press back") || lower.contains("go back") || lower.contains("back button")) {
            return VLMAction.Back
        }

        // Home
        if (lower.contains("press home") || lower.contains("go home") || lower.contains("home screen")) {
            return VLMAction.Home
        }

        // Launch app
        val launchRegex = Regex(
            """(?:launch|open)\s*(?:app\s*)?(\S+)""",
            RegexOption.IGNORE_CASE,
        )
        val launchMatch = launchRegex.find(lower)
        if (launchMatch != null && launchMatch.groupValues[1].contains(".")) {
            return VLMAction.Launch(packageName = launchMatch.groupValues[1])
        }

        return null
    }

    // ======== Helpers ========

    private fun buildActionFromParams(actionName: String, params: String): VLMAction? {
        // Extract element array: element=[x, y]
        val elementRegex = Regex("""element=\[(\d+),\s*(\d+)(?:,\s*(\d+),\s*(\d+))?\]""")
        val elementMatch = elementRegex.find(params)

        // Extract text: text="..."
        val textRegex = Regex("""text="(.*?)"""")
        val textMatch = textRegex.find(params)

        // Extract app: app="..."
        val appRegex = Regex("""app="(.*?)"""")
        val appMatch = appRegex.find(params)

        // Extract message
        val msgRegex = Regex("""message="(.*?)"""")
        val msgMatch = msgRegex.find(params)

        val x = elementMatch?.groupValues?.get(1)?.toIntOrNull()
        val y = elementMatch?.groupValues?.get(2)?.toIntOrNull()
        val x2 = elementMatch?.groupValues?.get(3)?.toIntOrNull()
        val y2 = elementMatch?.groupValues?.get(4)?.toIntOrNull()
        val text = textMatch?.groupValues?.get(1)
        val app = appMatch?.groupValues?.get(1)
        val msg = msgMatch?.groupValues?.get(1)

        return buildActionFromFields(actionName, x, y, x2, y2, text, app, msg, null)
    }

    private fun buildActionFromFields(
        actionName: String,
        x: Int?,
        y: Int?,
        x2: Int?,
        y2: Int?,
        text: String?,
        app: String?,
        msg: String?,
        durationMs: Long?,
    ): VLMAction? {
        return when (actionName.lowercase()) {
            "tap", "click" -> {
                if (x != null && y != null) VLMAction.Tap(x, y) else null
            }
            "longpress", "long_press", "long-press" -> {
                if (x != null && y != null)
                    VLMAction.LongPress(x, y, durationMs ?: 800) else null
            }
            "swipe", "scroll", "drag" -> {
                if (x != null && y != null && x2 != null && y2 != null)
                    VLMAction.Swipe(x, y, x2, y2, durationMs ?: 300) else null
            }
            "type", "input", "text", "keyboard" -> {
                if (!text.isNullOrBlank()) VLMAction.Type(text) else null
            }
            "back" -> VLMAction.Back
            "home" -> VLMAction.Home
            "launch", "open", "start" -> {
                if (!app.isNullOrBlank()) VLMAction.Launch(app) else null
            }
            "terminate", "finish", "complete", "stop", "done" -> VLMAction.Terminate(msg ?: "")
            else -> {
                // Try text-based fallback
                parseGuiOwlFormat("$actionName ${listOfNotNull(x, y, x2, y2, text, app).joinToString()}")
            }
        }
    }

    /**
     * Extract the first JSON object from a possibly markdown-fenced or interleaved string.
     */
    private fun extractJsonObject(text: String): String? {
        // Try extracting from markdown code fences ```json ... ```
        val fenceRegex = Regex("""```(?:json)?\s*(\{[\s\S]*?\})\s*```""")
        val fenceMatch = fenceRegex.find(text)
        if (fenceMatch != null) {
            val candidate = fenceMatch.groupValues[1].trim()
            if (candidate.startsWith("{")) return candidate
        }

        // Try finding { ... } in the raw text
        var depth = 0
        var start = -1
        for ((i, ch) in text.withIndex()) {
            when (ch) {
                '{' -> {
                    if (depth == 0) start = i
                    depth++
                }
                '}' -> {
                    depth--
                    if (depth == 0 && start >= 0) {
                        return text.substring(start, i + 1)
                    }
                }
            }
        }
        return null
    }
}
