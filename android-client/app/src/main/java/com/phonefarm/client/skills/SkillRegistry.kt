package com.phonefarm.client.skills

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Loads Skill definitions from assets/skills.json and filters by
 * which related apps are installed on the device.
 */
@Singleton
class SkillRegistry @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val json = Json { ignoreUnknownKeys = true }

    private var allSkills: List<SkillConfig> = emptyList()
    private var installedPackages: Set<String> = emptySet()

    /** Load skills from bundled JSON asset. Call once at app startup. */
    suspend fun initialize() {
        withContext(Dispatchers.IO) {
            allSkills = loadFromAsset()
            installedPackages = scanInstalledPackages()
        }
    }

    /** Reload installed packages (call when apps are installed/uninstalled). */
    suspend fun refreshInstalledApps() {
        withContext(Dispatchers.IO) {
            installedPackages = scanInstalledPackages()
        }
    }

    /** All loaded skills. */
    fun getAll(): List<SkillConfig> = allSkills

    /** Skills that have at least one installed related app. */
    fun getAvailable(): List<SkillConfig> = allSkills.filter { skill ->
        skill.relatedApps.any { it.`package` in installedPackages }
    }

    /**
     * For a given skill, return related apps ordered by priority (highest first),
     * filtered to only installed apps.
     */
    fun getAvailableApps(skill: SkillConfig): List<RelatedApp> =
        skill.relatedApps
            .filter { it.`package` in installedPackages }
            .sortedByDescending { it.priority }

    /** Best available app for a skill (highest priority installed). */
    fun getBestApp(skill: SkillConfig): RelatedApp? =
        getAvailableApps(skill).firstOrNull()

    /** Check if a specific package is installed. */
    fun isInstalled(pkg: String): Boolean = pkg in installedPackages

    /** Get a skill by its ID. */
    fun getById(id: String): SkillConfig? = allSkills.find { it.id == id }

    // ── Internal ──

    private fun loadFromAsset(): List<SkillConfig> {
        return try {
            val input = context.assets.open("skills.json")
            val text = input.bufferedReader().use { it.readText() }
            parseSkills(text)
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun parseSkills(jsonText: String): List<SkillConfig> {
        return try {
            val root = json.parseToJsonElement(jsonText).jsonObject
            val skillsArray = root["skills"]?.jsonArray ?: return emptyList()

            skillsArray.map { el ->
                val obj = el.jsonObject
                SkillConfig(
                    id = obj["id"]?.jsonPrimitive?.content ?: "",
                    name = obj["name"]?.jsonPrimitive?.content ?: "",
                    description = obj["description"]?.jsonPrimitive?.content ?: "",
                    category = obj["category"]?.jsonPrimitive?.content ?: "",
                    keywords = obj["keywords"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                    params = obj["params"]?.jsonArray?.map { p ->
                        val po = p.jsonObject
                        SkillParam(
                            name = po["name"]?.jsonPrimitive?.content ?: "",
                            type = po["type"]?.jsonPrimitive?.content ?: "string",
                            description = po["description"]?.jsonPrimitive?.content ?: "",
                            required = po["required"]?.jsonPrimitive?.content?.toBoolean() ?: false,
                        )
                    } ?: emptyList(),
                    relatedApps = obj["relatedApps"]?.jsonArray?.map { a ->
                        val ao = a.jsonObject
                        RelatedApp(
                            `package` = ao["package"]?.jsonPrimitive?.content ?: "",
                            name = ao["name"]?.jsonPrimitive?.content ?: "",
                            type = ao["type"]?.jsonPrimitive?.content ?: "gui_automation",
                            priority = ao["priority"]?.jsonPrimitive?.content?.toIntOrNull() ?: 50,
                            deepLink = ao["deepLink"]?.jsonPrimitive?.content,
                            steps = ao["steps"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
                        )
                    } ?: emptyList(),
                    promptHint = obj["promptHint"]?.jsonPrimitive?.content ?: "",
                )
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun scanInstalledPackages(): Set<String> {
        return try {
            context.packageManager.getInstalledApplications(0)
                .map { it.packageName }
                .toSet()
        } catch (_: Exception) {
            emptySet()
        }
    }
}
