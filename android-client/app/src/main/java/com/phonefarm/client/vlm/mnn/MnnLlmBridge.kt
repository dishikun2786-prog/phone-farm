package com.phonefarm.client.vlm.mnn

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * MNN LLM JNI bridge — wraps the MNN (Mobile Neural Network) library for on-device
 * language model inference.
 *
 * Designed for lightweight models like Qwen2-0.5B that can run efficiently on
 * mobile devices. When the MNN native library is unavailable, a rule-based
 * decision tree provides a pure-Kotlin fallback for basic automation decisions.
 *
 * Model format: MNN .mnn model files with tokenizer configuration.
 *
 * Thread safety: All inference runs on Dispatchers.Default.
 * Model lifecycle: Single model loaded at a time; init() before generate(), release() after.
 *
 * @property nativeLoaded Whether the MNN native library was loaded.
 * @property isReady Whether a model is currently loaded.
 */
object MnnLlmBridge {

    private const val TAG = "MnnLlmBridge"

    /** Whether the native .so was loaded successfully. */
    var nativeLoaded: Boolean = false
        private set

    /** Whether a model is loaded and ready for inference. */
    var isReady: Boolean = false
        private set

    /** The currently loaded model path. */
    private var currentModelPath: String? = null

    /** The currently loaded config path. */
    private var currentConfigPath: String? = null

    /** Native session pointer — opaque handle to the MNN session. */
    private var nativeSessionPtr: Long = 0L

    // ── Initialization ──

    init {
        try {
            System.loadLibrary("mnn_llm")
            nativeLoaded = true
            Log.d(TAG, "MNN LLM native library loaded successfully")
        } catch (e: UnsatisfiedLinkError) {
            nativeLoaded = false
            Log.w(TAG, "MNN LLM native library not available: ${e.message}. Using rule-based fallback.")
        }
    }

    // ── Public API ──

    /**
     * Initialize the MNN LLM model.
     *
     * @param modelPath Path to the .mnn model file.
     * @param configPath Path to the tokenizer/tokenizer_config.json.
     * @return true if the model was loaded successfully.
     */
    fun init(modelPath: String, configPath: String): Boolean {
        if (!nativeLoaded) {
            Log.w(TAG, "Cannot init: native library not loaded")
            return false
        }

        if (isReady) {
            release()
        }

        val modelFile = File(modelPath)
        val configFile = File(configPath)

        if (!modelFile.exists()) {
            Log.e(TAG, "Model file not found: $modelPath")
            return false
        }
        if (!configFile.exists()) {
            Log.e(TAG, "Config file not found: $configPath")
            return false
        }

        return try {
            val ptr = nativeInit(modelPath, configPath)
            if (ptr != 0L) {
                nativeSessionPtr = ptr
                currentModelPath = modelPath
                currentConfigPath = configPath
                isReady = true
                Log.d(TAG, "MNN LLM model loaded: $modelPath (session=0x%x)".format(ptr))
                true
            } else {
                Log.e(TAG, "nativeInit returned null session")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to init MNN LLM model", e)
            false
        }
    }

    /**
     * Generate text from a prompt using the loaded model.
     *
     * Falls back to rule-based decision tree when MNN is unavailable.
     *
     * @param prompt The input prompt text.
     * @param maxTokens Maximum number of tokens to generate. Default 256.
     * @param temperature Sampling temperature (0.0–2.0). Default 0.7.
     * @return The generated text response.
     */
    suspend fun generate(
        prompt: String,
        maxTokens: Int = 256,
        temperature: Float = 0.7f,
    ): String = withContext(Dispatchers.Default) {
        if (nativeLoaded && isReady && nativeSessionPtr != 0L) {
            generateNative(prompt, maxTokens, temperature)
        } else {
            generateRuleBased(prompt)
        }
    }

    /**
     * Generate text with streaming callbacks.
     *
     * @param prompt Input prompt.
     * @param maxTokens Max tokens to generate.
     * @param temperature Sampling temperature.
     * @param onToken Called for each generated token.
     * @return Full generated text.
     */
    suspend fun generateStreaming(
        prompt: String,
        maxTokens: Int = 256,
        temperature: Float = 0.7f,
        onToken: (String) -> Unit,
    ): String = withContext(Dispatchers.Default) {
        if (nativeLoaded && isReady && nativeSessionPtr != 0L) {
            val result = nativeGenerateStreaming(prompt, maxTokens, temperature, onToken)
            result
        } else {
            val result = generateRuleBased(prompt)
            // Simulate streaming for fallback
            result.split(" ").forEach { onToken("$it ") }
            result
        }
    }

    /**
     * Release native resources and unload the model.
     */
    fun release() {
        if (nativeLoaded && nativeSessionPtr != 0L) {
            try {
                nativeRelease(nativeSessionPtr)
                Log.d(TAG, "MNN LLM model released")
            } catch (e: Exception) {
                Log.e(TAG, "Error releasing MNN LLM model", e)
            }
        }
        isReady = false
        nativeSessionPtr = 0L
        currentModelPath = null
        currentConfigPath = null
    }

    /**
     * Get the backend currently in use.
     */
    fun getActiveBackend(): String {
        return when {
            nativeLoaded && isReady -> "MNN"
            else -> "RuleBased"
        }
    }

    /**
     * Get estimated tokens for a text string (rough heuristic).
     */
    fun estimateTokens(text: String): Int {
        var tokens = 0
        for (ch in text) {
            tokens += if (ch.code > 127) 2 else 1
        }
        return tokens / 3
    }

    // ── Native generation path ──

    private fun generateNative(
        prompt: String,
        maxTokens: Int,
        temperature: Float,
    ): String {
        return try {
            nativeGenerate(nativeSessionPtr, prompt, maxTokens, temperature)
        } catch (e: Exception) {
            Log.e(TAG, "Native generate failed, falling back to rules", e)
            generateRuleBased(prompt)
        }
    }

    // ── Rule-based decision tree fallback ──

    /**
     * Pure-Kotlin rule-based decision tree for GUI automation decisions.
     *
     * This fallback provides basic automation intelligence without any native
     * library dependency. It parses the prompt text for keywords and matches
     * against known automation patterns.
     *
     * Supported actions: tap, swipe, type, back, home, launch, wait, terminate
     */
    private fun generateRuleBased(prompt: String): String {
        val lowerPrompt = prompt.lowercase()

        // Check for terminal conditions
        if (lowerPrompt.contains("finished") || lowerPrompt.contains("completed") ||
            lowerPrompt.contains("done") || lowerPrompt.contains("success")
        ) {
            if (lowerPrompt.contains("task:") || lowerPrompt.contains("finished") || lowerPrompt.contains("done")) {
                return """{"action":"terminate","message":"Task completed successfully based on rule analysis"}"""
            }
        }

        // Detect back/navigation actions
        if (lowerPrompt.contains("go back") || lowerPrompt.contains("press back") ||
            lowerPrompt.contains("return") || lowerPrompt.contains("navigate back")
        ) {
            return """{"action":"back"}"""
        }

        // Detect home action
        if (lowerPrompt.contains("go home") || lowerPrompt.contains("press home") ||
            lowerPrompt.contains("home screen")
        ) {
            return """{"action":"home"}"""
        }

        // Detect typing actions
        val typeMatch = Regex("""type\s+["'](.+?)["']""").find(prompt)
            ?: Regex("""type\s+(.+?)(?:\s*$)""").find(prompt)
        if (typeMatch != null) {
            val text = typeMatch.groupValues[1].trim()
            return """{"action":"type","text":"${escapeJson(text)}"}"""
        }
        if (lowerPrompt.contains("enter text") || lowerPrompt.contains("input ")) {
            val textMatch = Regex("""(?:enter|input)\s+(?:text\s+)?["']?(.+?)["']?(?:\s*$)""").find(prompt)
            if (textMatch != null) {
                val text = textMatch.groupValues[1].trim()
                return """{"action":"type","text":"${escapeJson(text)}"}"""
            }
        }

        // Detect swipe actions
        if (lowerPrompt.contains("swipe up") || lowerPrompt.contains("scroll up") ||
            lowerPrompt.contains("scroll down") && lowerPrompt.contains("up")
        ) {
            return """{"action":"swipe","x1":540,"y1":1500,"x2":540,"y2":500}"""
        }
        if (lowerPrompt.contains("swipe down") || lowerPrompt.contains("scroll down")) {
            return """{"action":"swipe","x1":540,"y1":500,"x2":540,"y2":1500}"""
        }
        if (lowerPrompt.contains("swipe left")) {
            return """{"action":"swipe","x1":900,"y1":1200,"x2":200,"y2":1200}"""
        }
        if (lowerPrompt.contains("swipe right")) {
            return """{"action":"swipe","x1":200,"y1":1200,"x2":900,"y2":1200}"""
        }

        // Detect launch actions
        val launchMatch = Regex("""launch\s+(\S+)""").find(lowerPrompt)
            ?: Regex("""open\s+(?:app\s+)?(\S+)""").find(lowerPrompt)
        if (launchMatch != null) {
            val pkg = launchMatch.groupValues[1].trim()
            return """{"action":"launch","package":"${escapeJson(pkg)}"}"""
        }

        // Detect tap actions from coordinate patterns
        val coordMatch = Regex("""tap\s+(?:at\s+)?(?:\(?\s*(\d+)\s*,\s*(\d+)\s*\)?)""").find(lowerPrompt)
            ?: Regex("""click\s+(?:at\s+)?(?:\(?\s*(\d+)\s*,\s*(\d+)\s*\)?)""").find(lowerPrompt)
        if (coordMatch != null) {
            val x = coordMatch.groupValues[1].toIntOrNull() ?: 540
            val y = coordMatch.groupValues[2].toIntOrNull() ?: 1200
            return """{"action":"tap","x":$x,"y":$y}"""
        }

        // Detect wait/pause
        if (lowerPrompt.contains("wait ") || lowerPrompt.contains("pause ")) {
            return """{"action":"wait","durationMs":2000}"""
        }

        // Detect button/UI element tapping by label
        val buttonLabels = listOf(
            "ok" to "确认", "confirm" to "确认", "yes" to "是", "no" to "否",
            "cancel" to "取消", "submit" to "提交", "next" to "下一步", "skip" to "跳过",
            "agree" to "同意", "allow" to "允许", "deny" to "拒绝", "close" to "关闭",
            "search" to "搜索", "send" to "发送", "share" to "分享", "save" to "保存",
            "delete" to "删除", "edit" to "编辑", "add" to "添加", "remove" to "移除",
            "login" to "登录", "register" to "注册", "sign in" to "登录", "sign up" to "注册",
        )
        for ((en, cn) in buttonLabels) {
            if (lowerPrompt.contains("tap $en") || lowerPrompt.contains("click $en") ||
                lowerPrompt.contains("press $en") || lowerPrompt.contains("tap $cn") ||
                lowerPrompt.contains("点击$cn") || lowerPrompt.contains("点$cn")
            ) {
                return """{"action":"tap","x":540,"y":1200,"target":"${escapeJson(en)}"}"""
            }
        }

        // If there's a task description but no clear action, analyze screen context
        if (lowerPrompt.contains("task:") || lowerPrompt.contains("analyze") ||
            lowerPrompt.contains("screen") || lowerPrompt.contains("page")
        ) {
            // Default: try tapping center of screen (most common action for initial interaction)
            return """{"action":"tap","x":540,"y":1200}"""
        }

        // Ultimate fallback: return a wait action
        Log.d(TAG, "Rule-based no match for prompt, returning wait action")
        return """{"action":"wait","durationMs":1000}"""
    }

    /**
     * Escape a string for inclusion in JSON.
     */
    private fun escapeJson(text: String): String {
        return text
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
    }

    // ── JNI native method declarations ──

    /**
     * Initialize MNN model and return native session pointer.
     *
     * @param modelPath Path to .mnn model file.
     * @param configPath Path to tokenizer configuration.
     * @return Opaque session pointer, or 0 on failure.
     */
    @JvmStatic
    private external fun nativeInit(modelPath: String, configPath: String): Long

    /**
     * Run a single generation pass.
     *
     * @param sessionPtr Native session pointer.
     * @param prompt Input prompt.
     * @param maxTokens Max tokens to generate.
     * @param temperature Sampling temperature.
     * @return Generated text.
     */
    @JvmStatic
    private external fun nativeGenerate(
        sessionPtr: Long,
        prompt: String,
        maxTokens: Int,
        temperature: Float,
    ): String

    /**
     * Run generation with per-token streaming callback.
     *
     * @param sessionPtr Native session pointer.
     * @param prompt Input prompt.
     * @param maxTokens Max tokens to generate.
     * @param temperature Sampling temperature.
     * @param onToken Callback invoked for each token.
     * @return Complete generated text.
     */
    @JvmStatic
    private external fun nativeGenerateStreaming(
        sessionPtr: Long,
        prompt: String,
        maxTokens: Int,
        temperature: Float,
        onToken: (String) -> Unit,
    ): String

    /**
     * Release native MNN session.
     *
     * @param sessionPtr Native session pointer.
     */
    @JvmStatic
    private external fun nativeRelease(sessionPtr: Long)

    // ── Tokenizer helpers (pure Kotlin) ──

    /**
     * Simple Byte-Pair Encoding tokenizer for Qwen2 tokenizer format.
     *
     * This is a minimal implementation that handles basic tokenization
     * for Qwen2-0.5B model format. A full implementation would use a
     * complete BPE vocabulary loaded from tokenizer.json.
     */
    data class TokenizerInfo(
        val vocabSize: Int,
        val maxLength: Int,
        val bosTokenId: Int,
        val eosTokenId: Int,
        val padTokenId: Int,
    )

    /**
     * Parse tokenizer configuration from a JSON file.
     * For Qwen2 models, the tokenizer_config.json has format:
     * {"vocab_size": 151936, "max_length": 32768, ...}
     */
    fun parseTokenizerConfig(configPath: String): TokenizerInfo? {
        return try {
            val content = File(configPath).readText()
            val vocabMatch = Regex(""""vocab_size"\s*:\s*(\d+)""").find(content)
            val maxLenMatch = Regex(""""max_length"\s*:\s*(\d+)""").find(content)
            val bosMatch = Regex(""""bos_token_id"\s*:\s*(\d+)""").find(content)
            val eosMatch = Regex(""""eos_token_id"\s*:\s*(\d+)""").find(content)
            val padMatch = Regex(""""pad_token_id"\s*:\s*(\d+)""").find(content)

            TokenizerInfo(
                vocabSize = vocabMatch?.groupValues?.get(1)?.toIntOrNull() ?: 151936,
                maxLength = maxLenMatch?.groupValues?.get(1)?.toIntOrNull() ?: 32768,
                bosTokenId = bosMatch?.groupValues?.get(1)?.toIntOrNull() ?: 151643,
                eosTokenId = eosMatch?.groupValues?.get(1)?.toIntOrNull() ?: 151645,
                padTokenId = padMatch?.groupValues?.get(1)?.toIntOrNull() ?: 151643,
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse tokenizer config: ${e.message}")
            null
        }
    }
}
