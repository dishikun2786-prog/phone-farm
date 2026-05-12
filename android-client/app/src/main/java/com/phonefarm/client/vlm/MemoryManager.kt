package com.phonefarm.client.vlm

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * TF-IDF vector memory for the VLM agent.
 *
 * Stores observations as fact entries that can be queried for relevance
 * to the current task context. This allows the agent to build up
 * knowledge during a task execution (e.g., "login button is at bottom-right",
 * "this app has a swipe-based navigation") and reuse it in later steps.
 *
 * The memory uses a simplified TF-IDF scoring:
 *   - Term Frequency (TF): keyword occurrence in each fact
 *   - Inverse Document Frequency (IDF): penalizes common words
 *   - Cosine similarity for ranking
 */
@Singleton
class MemoryManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private val entries = mutableListOf<MemoryEntry>()
    private val mutex = Mutex()

    /** Global document frequency map across all stored facts. */
    private val df = mutableMapOf<String, Int>()

    /** Maximum memory size before eviction. */
    private val maxEntries = 200

    /** Cached IDF values — refreshed after each addition. */
    private val idf = mutableMapOf<String, Float>()

    private val storageFile: File
        get() = File(context.filesDir, "vlm_memory.json")

    /** Common Chinese/English stop words to exclude from TF-IDF. */
    private val stopWords = setOf(
        "的", "是", "了", "在", "和", "也", "就", "都", "而", "及",
        "与", "着", "或", "一个", "没有", "我们", "你们", "他们",
        "the", "a", "an", "is", "are", "was", "were", "be", "been",
        "in", "on", "at", "to", "for", "of", "and", "or", "with",
        "this", "that", "it", "its", "from", "by", "as", "has", "have",
    )

    init {
        loadFromDisk()
    }

    /**
     * Add a new fact/observation to memory under a given category.
     */
    suspend fun addMemory(fact: String, category: String) {
        mutex.withLock {
            val entry = MemoryEntry(
                fact = fact,
                category = category,
                relevanceScore = 0f,
                timestamp = System.currentTimeMillis(),
            )
            entries.add(entry)

            // Update document frequency
            val tokens = tokenize(fact)
            for (token in tokens.distinct()) {
                df[token] = (df[token] ?: 0) + 1
            }

            // Refresh IDF cache
            val n = entries.size.toFloat()
            for ((token, docFreq) in df) {
                idf[token] = kotlin.math.ln((n + 1f) / (docFreq + 1f)) + 1f
            }

            // Evict oldest if over capacity
            while (entries.size > maxEntries) {
                entries.removeAt(0)
            }

            persistToDisk()
        }
    }

    /**
     * Query memory for the most relevant facts matching the current task context.
     */
    suspend fun query(taskContext: String, topK: Int = 5): List<MemoryEntry> {
        mutex.withLock {
            if (entries.isEmpty()) return emptyList()

            // Build query TF vector
            val queryTokens = tokenize(taskContext)
            val queryTf = computeTf(queryTokens)

            // Compute cosine similarity for each entry
            val scored = entries.map { entry ->
                val docTokens = tokenize(entry.fact)
                val docTf = computeTf(docTokens)

                val similarity = cosineSimilarity(queryTf, docTf)
                entry.copy(relevanceScore = similarity)
            }

            return scored
                .sortedByDescending { it.relevanceScore }
                .take(topK)
                .filter { it.relevanceScore > 0f }
        }
    }

    /**
     * Clear all stored memories.
     */
    suspend fun clear() {
        mutex.withLock {
            entries.clear()
            df.clear()
            idf.clear()
            storageFile.delete()
        }
    }

    /**
     * Return the total number of stored facts.
     */
    suspend fun size(): Int {
        mutex.withLock { return entries.size }
    }

    // --- Tokenization ---

    private fun tokenize(text: String): List<String> {
        // Split on non-alphanumeric characters (Chinese char = single token)
        val words = mutableListOf<String>()
        val sb = StringBuilder()
        for (ch in text) {
            if (ch.isLetterOrDigit()) {
                sb.append(ch.lowercaseChar())
            } else if (ch in '一'..'鿿' || ch in '㐀'..'䶿') {
                // Chinese character: flush current word, emit single char
                if (sb.isNotEmpty()) {
                    words.add(sb.toString())
                    sb.clear()
                }
                words.add(ch.toString())
            } else {
                if (sb.isNotEmpty()) {
                    words.add(sb.toString())
                    sb.clear()
                }
            }
        }
        if (sb.isNotEmpty()) words.add(sb.toString())

        return words
            .filter { it.length > 1 || it.first() in '一'..'鿿' || it.first() in '㐀'..'䶿' }
            .filter { it !in stopWords }
    }

    private fun computeTf(tokens: List<String>): Map<String, Float> {
        if (tokens.isEmpty()) return emptyMap()
        val counts = tokens.groupingBy { it }.eachCount()
        val maxFreq = counts.values.maxOrNull()?.toFloat() ?: 1f
        return counts.mapValues { (token, count) ->
            (count.toFloat() / maxFreq) * (idf[token] ?: 1f)
        }
    }

    private fun cosineSimilarity(
        vec1: Map<String, Float>,
        vec2: Map<String, Float>,
    ): Float {
        var dot = 0f
        var norm1 = 0f
        var norm2 = 0f

        for ((key, v1) in vec1) {
            val v2 = vec2[key] ?: 0f
            dot += v1 * v2
            norm1 += v1 * v1
        }
        for ((_, v2) in vec2) {
            norm2 += v2 * v2
        }

        if (norm1 == 0f || norm2 == 0f) return 0f
        return dot / (kotlin.math.sqrt(norm1) * kotlin.math.sqrt(norm2))
    }

    // --- Persistence ---

    private fun persistToDisk() {
        try {
            val json = JSONObject()
            val arr = JSONArray()
            for (entry in entries) {
                val obj = JSONObject()
                obj.put("fact", entry.fact)
                obj.put("category", entry.category)
                obj.put("timestamp", entry.timestamp)
                arr.put(obj)
            }
            json.put("entries", arr)
            json.put("version", 1)
            storageFile.writeText(json.toString())
        } catch (_: Exception) {
            // Silently ignore persistence errors
        }
    }

    private fun loadFromDisk() {
        try {
            if (!storageFile.exists()) return
            val json = JSONObject(storageFile.readText())
            val arr = json.optJSONArray("entries") ?: return
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                entries.add(
                    MemoryEntry(
                        fact = obj.getString("fact"),
                        category = obj.optString("category", "general"),
                        relevanceScore = 0f,
                        timestamp = obj.optLong("timestamp", System.currentTimeMillis()),
                    )
                )
                // Rebuild DF
                val tokens = tokenize(obj.getString("fact"))
                for (token in tokens.distinct()) {
                    df[token] = (df[token] ?: 0) + 1
                }
            }
            // Refresh IDF
            val n = entries.size.toFloat()
            for ((token, docFreq) in df) {
                idf[token] = kotlin.math.ln((n + 1f) / (docFreq + 1f)) + 1f
            }
        } catch (_: Exception) {
            entries.clear()
            df.clear()
            idf.clear()
        }
    }
}

/**
 * A single fact/observation stored in the agent's memory.
 */
data class MemoryEntry(
    val fact: String,
    val category: String,
    val relevanceScore: Float,
    val timestamp: Long,
)
