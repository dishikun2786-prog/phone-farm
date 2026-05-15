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
     * Authenticate with username/phone + password.
     */
    @POST("/api/v1/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    /**
     * Login with phone + SMS verification code.
     */
    @POST("/api/v1/auth/login-phone")
    suspend fun loginByPhone(@Body request: PhoneLoginRequest): LoginResponse

    /**
     * Register a new account with phone + SMS code.
     */
    @POST("/api/v1/auth/register")
    suspend fun register(@Body request: RegisterRequest): LoginResponse

    /**
     * Send SMS verification code.
     */
    @POST("/api/v1/auth/send-sms")
    suspend fun sendSms(@Body request: SmsRequest): SmsResponse

    /**
     * Verify an SMS code without consuming it.
     */
    @POST("/api/v1/auth/verify-sms")
    suspend fun verifySms(@Body request: SmsVerifyRequest): SmsVerifyResponse

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

    // ── Billing & Plans ──

    @GET("/api/v2/billing/plans")
    suspend fun getBillingPlans(): BillingPlansResponse

    @POST("/api/v2/billing/subscribe")
    suspend fun subscribePlan(@Body request: SubscribePlanRequest)

    @GET("/api/v2/billing/subscription")
    suspend fun getSubscription(): SubscriptionResponse

    // ── Usage Stats ──

    @GET("/api/v2/portal/usage")
    suspend fun getUsageStats(
        @Query("from") from: Long? = null,
        @Query("to") to: Long? = null,
    ): UsageStatsResponse

    // ── Support Tickets ──

    @GET("/api/v2/support/tickets")
    suspend fun getSupportTickets(): SupportTicketsResponse

    @POST("/api/v2/support/tickets")
    suspend fun createSupportTicket(@Body request: CreateTicketRequest)

    // ── Agent Dashboard ──

    @GET("/api/v2/agent/dashboard")
    suspend fun getAgentDashboard(): AgentDashboardResponse

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

    // ---- AI Assistant ----

    /**
     * Get assistant configuration (models, credits, limits).
     */
    @GET("/api/v1/assistant/config")
    suspend fun getAssistantConfig(): AssistantConfigResponse

    /**
     * Brain LLM chat (DeepSeek via server proxy).
     */
    @POST("/api/v1/assistant/chat")
    suspend fun assistantChat(@Body request: AssistantChatRequest): AssistantChatResponse

    /**
     * Phone Agent vision (QwenVL via server proxy).
     */
    @POST("/api/v1/assistant/vision")
    suspend fun assistantVision(@Body request: AssistantVisionRequest): AssistantVisionResponse

    /**
     * Create a new assistant session.
     */
    @POST("/api/v1/assistant/sessions")
    suspend fun createAssistantSession(@Body request: AssistantSessionCreate): AssistantSessionCreateResponse

    /**
     * Update assistant session (tokens, steps, status).
     */
    @PUT("/api/v1/assistant/sessions/{sessionId}")
    suspend fun updateAssistantSession(
        @Path("sessionId") sessionId: String,
        @Body request: AssistantSessionUpdate,
    )

    // ---- Credits ----

    /**
     * Get user credit balance.
     */
    @GET("/api/v1/credits/balance")
    suspend fun getCreditBalance(): CreditBalanceResponse

    /**
     * Check if user has enough credits.
     */
    @POST("/api/v1/credits/check")
    suspend fun checkCredits(@Body request: CreditCheckRequest): CreditCheckResponse

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
    val account: String,
    val password: String,
)

@Serializable
data class PhoneLoginRequest(
    val phone: String,
    val code: String,
)

@Serializable
data class RegisterRequest(
    val phone: String,
    val code: String,
    val username: String? = null,
    val password: String? = null,
)

@Serializable
data class SmsRequest(
    val phone: String,
    val scene: String,
)

@Serializable
data class SmsVerifyRequest(
    val phone: String,
    val code: String,
    val scene: String,
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
    val refreshToken: String? = null,
    val user: LoginUser? = null,
)

@Serializable
data class LoginUser(
    val id: String,
    val username: String,
    val role: String,
    val phone: String? = null,
)

@Serializable
data class SmsResponse(
    val ok: Boolean,
    val error: String? = null,
)

@Serializable
data class SmsVerifyResponse(
    val valid: Boolean,
    val error: String? = null,
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

// ── AI Assistant ──

@Serializable
data class AssistantConfigResponse(
    val models: AssistantModelsResponse,
    val credits: CreditBalanceResponse,
    val limits: AssistantLimitsResponse,
)

@Serializable
data class AssistantModelsResponse(
    val brain: List<ModelPricingResponse>,
    val vision: List<ModelPricingResponse>,
)

@Serializable
data class ModelPricingResponse(
    val modelName: String,
    val inputTokensPerCredit: Int,
    val outputTokensPerCredit: Int,
)

@Serializable
data class CreditBalanceResponse(
    val userId: String,
    val balance: Int,
    val totalEarned: Int,
    val totalSpent: Int,
)

@Serializable
data class AssistantLimitsResponse(
    val minCreditsForChat: Int,
    val minCreditsForVision: Int,
    val maxStepsPerSession: Int,
    val stepTimeoutMs: Int,
)

@Serializable
data class AssistantChatRequest(
    val messages: List<AssistantMessage>,
    val systemPrompt: String? = null,
    val sessionId: String? = null,
    val tools: List<ToolDefDto>? = null,
)

@Serializable
data class ToolDefDto(
    val name: String,
    val description: String,
    val parameters: kotlinx.serialization.json.JsonObject,
)

@Serializable
data class AssistantMessage(
    val role: String,
    val content: String? = null,
)

@Serializable
data class AssistantChatResponse(
    val content: String,
    val model: String,
    val usage: AssistantUsage? = null,
    val toolCalls: List<ToolCallDto>? = null,
)

@Serializable
data class ToolCallDto(
    val id: String,
    val name: String,
    val input: kotlinx.serialization.json.JsonObject,
)

@Serializable
data class AssistantVisionRequest(
    val messages: List<AssistantVisionMessage>,
    val sessionId: String? = null,
)

@Serializable
data class AssistantVisionMessage(
    val role: String,
    val content: List<AssistantVisionContent>,
)

@Serializable
data class AssistantVisionContent(
    val type: String,
    val text: String? = null,
    val imageUrl: AssistantImageUrl? = null,
)

@Serializable
data class AssistantImageUrl(
    val url: String,
)

@Serializable
data class AssistantVisionResponse(
    val content: String,
    val model: String,
    val usage: AssistantUsage? = null,
)

@Serializable
data class AssistantUsage(
    val inputTokens: Int,
    val outputTokens: Int,
)

@Serializable
data class AssistantSessionCreate(
    val deviceId: String? = null,
    val title: String? = null,
)

@Serializable
data class AssistantSessionCreateResponse(
    val sessionId: String,
)

@Serializable
data class AssistantSessionUpdate(
    val tokens: Int? = null,
    val steps: Int? = null,
    val status: String? = null,
)

@Serializable
data class CreditCheckRequest(
    val minRequired: Int,
)

@Serializable
data class CreditCheckResponse(
    val enough: Boolean,
    val balance: Int,
    val minRequired: Int,
)

// ── Billing & Plans ──

@Serializable
data class BillingPlansResponse(
    val plans: List<BillingPlanItem>,
)

@Serializable
data class BillingPlanItem(
    val id: String,
    val name: String,
    val tier: String,
    val monthlyPriceCents: Int? = null,
    val maxDevices: Int? = null,
    val maxVlmCallsPerDay: Int? = null,
    val maxScriptExecutionsPerDay: Int? = null,
    val features: kotlinx.serialization.json.JsonElement? = null,
)

@Serializable
data class SubscribePlanRequest(
    val planId: String,
)

@Serializable
data class SubscriptionResponse(
    val subscription: SubscriptionDetail? = null,
)

@Serializable
data class SubscriptionDetail(
    val id: String,
    val planId: String,
    val status: String,
    val currentPeriodStart: String,
    val currentPeriodEnd: String,
    val autoRenew: Boolean,
)

// ── Usage Stats ──

@Serializable
data class UsageStatsResponse(
    val aggregated: Map<String, Int> = emptyMap(),
    val limits: UsageLimits? = null,
)

@Serializable
data class UsageLimits(
    val maxDevices: Int? = null,
    val maxVlmCallsPerDay: Int? = null,
    val maxScriptExecutionsPerDay: Int? = null,
)

// ── Support Tickets ──

@Serializable
data class SupportTicketsResponse(
    val tickets: List<SupportTicketItem> = emptyList(),
)

@Serializable
data class SupportTicketItem(
    val id: String,
    val ticketNumber: String,
    val subject: String,
    val category: String,
    val status: String,
    val updatedAt: String,
)

@Serializable
data class CreateTicketRequest(
    val subject: String,
    val category: String,
    val message: String,
    val priority: String = "normal",
)

// ── Agent Dashboard ──

@Serializable
data class AgentDashboardResponse(
    val totalSold: Int = 0,
    val totalCommission: Double = 0.0,
    val activeCustomers: Int = 0,
)
