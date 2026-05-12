package com.phonefarm.client.network

import kotlinx.serialization.Serializable
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * REST API interface for the PhoneFarm control server.
 *
 * All calls are suspend functions returning deserialized response types.
 * Authentication is handled transparently by an OkHttp interceptor that
 * adds the Bearer JWT token obtained from login().
 */
interface ApiService {

    // ---- Auth ----

    /**
     * Authenticate with username/password, returning a JWT token pair.
     */
    @POST("/api/v1/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    /**
     * Refresh the JWT token before expiry.
     */
    @POST("/api/v1/auth/refresh")
    suspend fun refreshToken(@Body request: RefreshRequest): LoginResponse

    // ---- Activation ----

    /**
     * Activate this device with an activation code.
     */
    @POST("/api/v1/activation/bind")
    suspend fun activateDevice(
        @Body request: ActivationRequest,
    ): ActivationResponse

    /**
     * Check the current activation status.
     */
    @GET("/api/v1/activation/status/{deviceId}")
    suspend fun getActivationStatus(
        @Path("deviceId") deviceId: String,
    ): ActivationStatusResponse

    // ---- Device Config ----

    /**
     * Pull the full device configuration from the server.
     */
    @GET("/api/v1/device/config")
    suspend fun getDeviceConfig(
        @Query("deviceId") deviceId: String,
    ): DeviceConfigResponse

    /**
     * Report device info and heartbeat data to the server.
     */
    @POST("/api/v1/device/heartbeat")
    suspend fun reportDeviceHeartbeat(
        @Body heartbeat: DeviceHeartbeatRequest,
    )

    // ---- Scripts and Plugins ----

    /**
     * Sync plugin manifest (list of available plugins with versions).
     */
    @GET("/api/v1/plugins/manifest")
    suspend fun syncPlugins(
    ): PluginManifest

    /**
     * Download a script by name. Returns raw response body for streaming.
     */
    @GET("/api/v1/scripts/{name}/download")
    suspend fun downloadScript(
        @Path("name") scriptName: String,
    ): ResponseBody

    /**
     * Get the full script manifest (all script names to sha256 hashes).
     */
    @GET("/api/v1/scripts/manifest")
    suspend fun getScriptManifest(
        @Query("runtime") runtime: String = "phonefarm-native",
    ): Map<String, String>

    // ---- Tasks ----

    /**
     * Report a task execution result back to the server.
     */
    @POST("/api/v1/tasks/{taskId}/result")
    suspend fun reportTaskResult(
        @Path("taskId") taskId: String,
        @Body result: TaskResultRequest,
    )

    // ---- VLM ----

    /**
     * Report a VLM step to the server.
     */
    @POST("/api/v1/vlm/episodes/{episodeId}/steps")
    suspend fun reportVlmStep(
        @Path("episodeId") episodeId: String,
        @Body step: VlmStepRequest,
    )

    // ---- Alerts ----

    /**
     * Push a local crash report to the server.
     */
    @POST("/api/v1/crash")
    suspend fun reportCrash(
        @Body crash: CrashReportRequest,
    )

    // ---- Model Manifest ----

    /**
     * Get the list of AI models available for local inference.
     */
    @GET("/api/v1/models/manifest")
    suspend fun getLocalModelManifest(
    ): List<LocalModelManifest>

    // ---- System ----

    /**
     * Health check (no auth required).
     */
    @GET("/api/v1/health")
    suspend fun healthCheck(): HealthResponse
}

// ---- Request types ----

@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
)

@Serializable
data class RefreshRequest(
    val refreshToken: String,
)

@Serializable
data class ActivationRequest(
    val deviceId: String,
    val activationCode: String,
)

// ---- Response types ----

@Serializable
data class LoginResponse(
    val token: String,
    val refreshToken: String,
    val expiresAt: Long,
    val username: String,
)

@Serializable
data class ActivationResponse(
    val success: Boolean,
    val deviceId: String,
    val deviceName: String?,
    val activatedAt: Long,
    val expiresAt: Long?,
    val message: String?,
)

@Serializable
data class ActivationStatusResponse(
    val isActive: Boolean,
    val deviceId: String?,
    val deviceName: String?,
    val expiresAt: Long?,
)

@Serializable
data class DeviceConfigResponse(
    val deviceId: String,
    val deviceName: String,
    val config: Map<String, String>,
    val targetPlatforms: List<String>,
    val cronJobs: List<CronJobConfig>,
    val vlmConfig: VlmConfig?,
    val updatedAt: Long,
)

@Serializable
data class CronJobConfig(
    val jobId: String,
    val scriptName: String,
    val cronExpression: String,
    val config: Map<String, String>,
    val enabled: Boolean,
)

@Serializable
data class VlmConfig(
    val modelName: String,
    val maxSteps: Int,
    val endpointUrl: String,
)

@Serializable
data class DeviceHeartbeatRequest(
    val deviceId: String,
    val timestamp: Long,
    val batteryLevel: Int,
    val batteryCharging: Boolean,
    val screenOn: Boolean,
    val currentPackage: String?,
    val activeTaskCount: Int,
    val memoryMb: Int,
    val cpuUsage: Int,
)

@Serializable
data class PluginManifest(
    val plugins: List<PluginInfo>,
    val updatedAt: Long,
)

@Serializable
data class PluginInfo(
    val pluginId: String,
    val name: String,
    val version: String,
    val downloadUrl: String?,
    val sha256: String?,
    val sizeBytes: Long,
    val isRequired: Boolean,
)

@Serializable
data class ScriptDownloadResponse(
    val name: String,
    val content: String,
    val version: String,
    val platform: String?,
    val checksum: String,
)

@Serializable
data class TaskResultRequest(
    val taskId: String,
    val success: Boolean,
    val stats: Map<String, String>?,
    val errorMessage: String?,
    val durationMs: Long,
)

@Serializable
data class VlmStepRequest(
    val episodeId: String,
    val stepNumber: Int,
    val screenshotBase64: String?,
    val modelThinking: String?,
    val actionJson: String?,
    val durationMs: Long,
)

@Serializable
data class CrashReportRequest(
    val crashType: String,
    val stackTrace: String,
    val deviceInfo: String?,
    val scriptName: String?,
    val timestamp: Long,
)

@Serializable
data class HealthResponse(
    val status: String,
    val version: String,
    val uptime: Long,
)

@Serializable
data class LocalModelManifest(
    val modelId: String,
    val displayName: String,
    val version: String,
    val quantization: String? = null,
    val fileSizeBytes: Long,
    val downloadUrl: String? = null,
    val sha256: String? = null,
    val minRamMb: Int,
    val backend: String? = null,
)
