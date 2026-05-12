package com.phonefarm.client.data.repository

import com.phonefarm.client.data.local.dao.EpisodeDao
import com.phonefarm.client.data.local.entity.EpisodeEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for VLM (Vision Language Model) episode recording persistence.
 *
 * Episodes are recordings of VLM-driven task exploration sessions, capturing
 * the entire decision chain: screenshots, model reasoning, actions taken, and outcomes.
 *
 * Each episode has a unique episodeId and contains metadata such as task prompt,
 * model used, total steps, and final status.
 */
@Singleton
class EpisodeRepository @Inject constructor(
    private val episodeDao: EpisodeDao,
) {

    /**
     * TODO: Observe all episodes ordered by start time descending.
     * Returns a Flow that emits the updated list whenever the episodes table changes.
     */
    fun getAllEpisodes(): Flow<List<EpisodeEntity>> {
        return episodeDao.observeAll()
    }

    /**
     * TODO: Get a single episode by its ID.
     * Returns null if no episode with the given ID exists.
     */
    suspend fun getEpisode(id: String): EpisodeEntity? {
        return episodeDao.get(id)
    }

    /**
     * TODO: Save (insert or update) an episode.
     * Uses REPLACE conflict strategy to overwrite existing episodes with the same ID.
     */
    suspend fun saveEpisode(episode: EpisodeEntity) {
        episodeDao.upsert(episode)
    }

    /**
     * TODO: Create a new episode with initial metadata.
     *
     * @param episodeId Unique identifier for the episode (UUID or server-assigned).
     * @param taskPrompt The natural language task prompt used for this episode.
     * @param modelName Name of the VLM model (e.g., "autoglm-phone-9b").
     * @param modelType "cloud" or "local".
     */
    suspend fun createEpisode(
        episodeId: String,
        taskPrompt: String,
        modelName: String,
        modelType: String = "cloud",
    ): EpisodeEntity {
        val episode = EpisodeEntity(
            episodeId = episodeId,
            taskPrompt = taskPrompt,
            modelName = modelName,
            modelType = modelType,
            status = "running",
            totalSteps = 0,
            startedAt = System.currentTimeMillis(),
            finishedAt = null,
            summary = null,
            episodeJsonPath = null,
        )
        episodeDao.upsert(episode)
        return episode
    }

    /**
     * TODO: Mark an episode as completed with a summary.
     *
     * @param episodeId The episode to finalize.
     * @param totalSteps Total number of steps taken.
     * @param summary JSON summary of the episode (actions taken, success/failure, timing).
     * @param episodeJsonPath Optional file path to the full episode JSON export.
     */
    suspend fun completeEpisode(
        episodeId: String,
        totalSteps: Int,
        summary: String? = null,
        episodeJsonPath: String? = null,
    ) {
        val existing = episodeDao.get(episodeId)
        if (existing != null) {
            val updated = existing.copy(
                status = "completed",
                totalSteps = totalSteps,
                finishedAt = System.currentTimeMillis(),
                summary = summary,
                episodeJsonPath = episodeJsonPath,
            )
            episodeDao.upsert(updated)
        }
    }

    /**
     * TODO: Mark an episode as failed.
     */
    suspend fun failEpisode(
        episodeId: String,
        reason: String? = null,
    ) {
        val existing = episodeDao.get(episodeId)
        if (existing != null) {
            val updated = existing.copy(
                status = "failed",
                finishedAt = System.currentTimeMillis(),
                summary = reason,
            )
            episodeDao.upsert(updated)
        }
    }

    /**
     * TODO: Increment the step count for a running episode.
     */
    suspend fun incrementSteps(episodeId: String, delta: Int = 1) {
        val existing = episodeDao.get(episodeId) ?: return
        val updated = existing.copy(totalSteps = existing.totalSteps + delta)
        episodeDao.upsert(updated)
    }

    /**
     * TODO: Delete an episode and all its associated steps.
     */
    suspend fun deleteEpisode(id: String) {
        episodeDao.delete(id)
        // TODO: Also delete associated VLM steps via VlmStepDao.
    }

    /**
     * TODO: Count total episodes.
     */
    suspend fun countEpisodes(): Int {
        // TODO: Add count query to EpisodeDao or collect the flow and count.
        return 0
    }
}
