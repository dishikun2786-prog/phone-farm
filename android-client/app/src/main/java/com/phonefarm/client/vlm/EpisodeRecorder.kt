package com.phonefarm.client.vlm

import android.content.Context
import android.graphics.Bitmap
import com.phonefarm.client.data.local.dao.EpisodeDao
import com.phonefarm.client.data.local.dao.VlmStepDao
import com.phonefarm.client.data.local.entity.EpisodeEntity
import com.phonefarm.client.data.local.entity.VlmStepEntity
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Record VLM execution episodes: full traces of each step including
 * screenshots, model thinking, and executed actions.
 *
 * Episodes are persisted locally via Room and can later be:
 *   - Uploaded to the control server for fleet training
 *   - Compiled into reusable AutoX v7 .js scripts
 *   - Replayed for debugging
 */
@Singleton
class EpisodeRecorder @Inject constructor(
    @ApplicationContext private val context: Context,
    private val episodeDao: EpisodeDao,
    private val vlmStepDao: VlmStepDao,
) {

    private val mutex = Mutex()

    /** Base directory for storing episode screenshots and metadata. */
    private val episodesDir: File
        get() = File(context.filesDir, "episodes").also { it.mkdirs() }

    /**
     * Start a new episode for a VLM task execution.
     *
     * @param taskPrompt The user's natural-language task description.
     * @param deviceId   The device this task runs on.
     * @param modelName  The VLM model used for inference.
     * @return The generated [episodeId] for subsequent step recording.
     */
    suspend fun startEpisode(
        taskPrompt: String,
        deviceId: String,
        modelName: String,
    ): String {
        mutex.withLock {
            val episodeId = UUID.randomUUID().toString()

            // Create episode directory for screenshots
            val episodeDir = File(episodesDir, episodeId)
            episodeDir.mkdirs()

            val entity = EpisodeEntity(
                episodeId = episodeId,
                taskPrompt = taskPrompt,
                modelName = modelName,
                modelType = if (modelName.contains("local")) "local" else "cloud",
                status = "running",
                totalSteps = 0,
                startedAt = System.currentTimeMillis(),
                finishedAt = null,
                summary = null,
                episodeJsonPath = null,
            )

            episodeDao.upsert(entity)
            return episodeId
        }
    }

    /**
     * Record a single step within an episode.
     *
     * @param episodeId  The owning episode ID.
     * @param step       The VLM step data (reasoning, action, etc.).
     * @param screenshot The screenshot Bitmap captured at this step.
     */
    suspend fun recordStep(
        episodeId: String,
        step: VlmStep,
        screenshot: Bitmap,
    ) {
        mutex.withLock {
            val episodeDir = File(episodesDir, episodeId)
            episodeDir.mkdirs()

            // Save screenshot as PNG
            val screenshotFile = File(episodeDir, "step_${step.stepNum}.png")
            var screenshotPath: String? = null
            try {
                FileOutputStream(screenshotFile).use { out ->
                    screenshot.compress(Bitmap.CompressFormat.PNG, 90, out)
                }
                screenshotPath = screenshotFile.absolutePath
            } catch (e: Exception) {
                android.util.Log.e("EpisodeRecorder", "Failed to save screenshot: ${e.message}")
            }

            // Build action JSON
            val actionJson = actionToJson(step.action)

            val stepEntity = VlmStepEntity(
                episodeId = episodeId,
                stepNumber = step.stepNum,
                screenshotPath = screenshotPath,
                modelThinking = step.reasoning,
                actionJson = actionJson,
                selectorInfoJson = step.selectorInfo,
                durationMs = 0, // will be updated by agent loop
                timestamp = System.currentTimeMillis(),
            )

            vlmStepDao.insert(stepEntity)

            // Update episode step count
            val episode = episodeDao.get(episodeId)
            if (episode != null) {
                episodeDao.upsert(
                    episode.copy(totalSteps = step.stepNum)
                )
            }
        }
    }

    /**
     * Mark an episode as completed.
     *
     * @param episodeId The episode to finalize.
     * @param success   Whether the task completed successfully.
     * @param message   Completion message or error description.
     */
    suspend fun completeEpisode(
        episodeId: String,
        success: Boolean,
        message: String,
    ) {
        mutex.withLock {
            val episode = episodeDao.get(episodeId) ?: return

            // Build summary JSON
            val summary = JSONObject().apply {
                put("success", success)
                put("message", message)
                put("totalSteps", episode.totalSteps)
                put("durationMs", System.currentTimeMillis() - episode.startedAt)
            }

            // Export full episode as JSON
            val episodeJsonPath = exportEpisodeJson(episodeId)

            episodeDao.upsert(
                episode.copy(
                    status = if (success) "completed" else "failed",
                    finishedAt = System.currentTimeMillis(),
                    summary = summary.toString(),
                    episodeJsonPath = episodeJsonPath,
                )
            )
        }
    }

    /**
     * Permanently delete an episode and all its recorded steps.
     */
    suspend fun deleteEpisode(episodeId: String) {
        mutex.withLock {
            // Delete steps from DB
            vlmStepDao.deleteByEpisode(episodeId)

            // Delete episode from DB
            episodeDao.delete(episodeId)

            // Delete screenshot files
            val episodeDir = File(episodesDir, episodeId)
            if (episodeDir.exists()) {
                episodeDir.deleteRecursively()
            }
        }
    }

    /**
     * Retrieve all recorded steps for an episode, sorted by step number.
     */
    suspend fun getSteps(episodeId: String): List<VlmStepEntity> {
        return vlmStepDao.getByEpisode(episodeId)
    }

    // ======== Private helpers ========

    /**
     * Serialize a [VLMAction] to its JSON representation.
     */
    private fun actionToJson(action: VLMAction): String {
        val json = JSONObject()
        when (action) {
            is VLMAction.Tap -> {
                json.put("action", "tap")
                json.put("x", action.x)
                json.put("y", action.y)
            }
            is VLMAction.LongPress -> {
                json.put("action", "long_press")
                json.put("x", action.x)
                json.put("y", action.y)
                json.put("duration_ms", action.durationMs)
            }
            is VLMAction.Swipe -> {
                json.put("action", "swipe")
                json.put("x1", action.x1)
                json.put("y1", action.y1)
                json.put("x2", action.x2)
                json.put("y2", action.y2)
                json.put("duration_ms", action.durationMs)
            }
            is VLMAction.Type -> {
                json.put("action", "type")
                json.put("text", action.text)
            }
            is VLMAction.Back -> json.put("action", "back")
            is VLMAction.Home -> json.put("action", "home")
            is VLMAction.Launch -> {
                json.put("action", "launch")
                json.put("package", action.packageName)
            }
            is VLMAction.Terminate -> {
                json.put("action", "terminate")
                json.put("message", action.message)
            }
        }
        return json.toString()
    }

    /**
     * Export the full episode (metadata + all steps) as a JSON file.
     * Returns the file path.
     */
    private suspend fun exportEpisodeJson(episodeId: String): String? {
        try {
            val episode = episodeDao.get(episodeId) ?: return null
            val steps = vlmStepDao.getByEpisode(episodeId)

            val json = JSONObject()
            json.put("episodeId", episode.episodeId)
            json.put("taskPrompt", episode.taskPrompt)
            json.put("modelName", episode.modelName)
            json.put("modelType", episode.modelType)
            json.put("status", episode.status)
            json.put("startedAt", episode.startedAt)
            json.put("finishedAt", episode.finishedAt)
            json.put("totalSteps", episode.totalSteps)

            val stepsArr = JSONArray()
            for (step in steps) {
                val stepObj = JSONObject()
                stepObj.put("stepNumber", step.stepNumber)
                stepObj.put("screenshotPath", step.screenshotPath ?: JSONObject.NULL)
                stepObj.put("modelThinking", step.modelThinking ?: JSONObject.NULL)
                stepObj.put("actionJson", step.actionJson ?: JSONObject.NULL)
                stepObj.put("selectorInfoJson", step.selectorInfoJson ?: JSONObject.NULL)
                stepObj.put("durationMs", step.durationMs)
                stepObj.put("timestamp", step.timestamp)
                stepsArr.put(stepObj)
            }
            json.put("steps", stepsArr)

            val episodeDir = File(episodesDir, episodeId)
            episodeDir.mkdirs()
            val jsonFile = File(episodeDir, "episode.json")
            jsonFile.writeText(json.toString(2))

            return jsonFile.absolutePath
        } catch (e: Exception) {
            android.util.Log.e("EpisodeRecorder", "Failed to export episode JSON: ${e.message}")
            return null
        }
    }
}
