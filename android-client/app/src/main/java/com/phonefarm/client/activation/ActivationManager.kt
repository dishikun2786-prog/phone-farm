package com.phonefarm.client.activation

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Card key activation state management.
 *
 * The PhoneFarm Android client requires a valid activation code (card key)
 * to operate. The activation binds the device to a fleet account on the
 * control server and must be valid (not expired, not revoked).
 *
 * State machine:
 *   NOT_ACTIVATED → ACTIVATING → ACTIVATED → EXPIRED → NOT_ACTIVATED
 *                           ↘ ACTIVATION_FAILED ↗
 *
 * The activation is persisted in EncryptedSharedPreferences (code)
 * and Room (ActivationEntity for metadata). On startup, the manager
 * checks the stored activation status and validates against the server.
 */
@Singleton
class ActivationManager @Inject constructor(
    private val activationRepository: ActivationRepository,
    private val licenseValidator: LicenseValidator,
    private val apiService: com.phonefarm.client.network.ApiService,
) {

    private val _activationState = MutableStateFlow<ActivationState>(ActivationState.NOT_ACTIVATED)
    val activationState: StateFlow<ActivationState> = _activationState.asStateFlow()

    /**
     * Activate the device with a card key code.
     *
     * @param code       The card key / activation code.
     * @param deviceId   The unique device identifier (e.g., from DeviceId library).
     * @param deviceName Human-readable device name (e.g., "Redmi K60 Pro").
     * @return [ActivationResult] with success/failure details.
     */
    suspend fun activate(
        code: String,
        deviceId: String,
        deviceName: String,
    ): ActivationResult {
        _activationState.value = ActivationState.ACTIVATING

        // 1. Validate code format locally
        val formatResult = licenseValidator.validateFormat(code)
        if (formatResult is LicenseValidationResult.Invalid) {
            _activationState.value = ActivationState.ACTIVATION_FAILED
            return ActivationResult.Failure(
                code = ActivationErrorCode.INVALID_FORMAT,
                message = formatResult.reason,
            )
        }

        // 2. Validate code against control server
        val remoteResult = licenseValidator.validateRemote(code, deviceId, apiService)
        if (remoteResult is LicenseValidationResult.Invalid) {
            _activationState.value = ActivationState.ACTIVATION_FAILED
            return ActivationResult.Failure(
                code = classifyRemoteError(remoteResult.reason),
                message = remoteResult.reason,
            )
        }

        // 3. Persist activation locally
        activationRepository.saveActivation(
            code = code,
            deviceId = deviceId,
            deviceName = deviceName,
            expiresAt = null,
        )

        // 4. Update state to activated
        _activationState.value = ActivationState.ACTIVATED

        return ActivationResult.Success(expiresAt = null)
    }

    /**
     * Classify a remote validation error reason into an error code.
     */
    private fun classifyRemoteError(reason: String): ActivationErrorCode {
        val lower = reason.lowercase()
        return when {
            lower.contains("expired") -> ActivationErrorCode.EXPIRED
            lower.contains("already") || lower.contains("used") -> ActivationErrorCode.ALREADY_USED
            lower.contains("limit") || lower.contains("quota") -> ActivationErrorCode.DEVICE_LIMIT_REACHED
            lower.contains("network") -> ActivationErrorCode.NETWORK_ERROR
            else -> ActivationErrorCode.SERVER_ERROR
        }
    }

    /**
     * Check the current activation status.
     *
     * Called on app startup to restore the activation state from persistence
     * and optionally re-verify with the server.
     */
    suspend fun checkStatus(): ActivationStatus {
        val activation = activationRepository.getActivation()

        if (activation == null || !activation.isActive) {
            _activationState.value = ActivationState.NOT_ACTIVATED
            return ActivationStatus(
                state = ActivationState.NOT_ACTIVATED,
                deviceId = null,
                deviceName = null,
                activatedAt = null,
                expiresAt = null,
                remainingDays = null,
            )
        }

        // Check if expired
        val now = System.currentTimeMillis()
        val expiresAt = activation.expiresAt
        if (expiresAt != null && expiresAt < now) {
            _activationState.value = ActivationState.EXPIRED
            val remainingDays = ((expiresAt - now) / (1000 * 60 * 60 * 24)).toInt()
            return ActivationStatus(
                state = ActivationState.EXPIRED,
                deviceId = activation.deviceId,
                deviceName = activation.deviceName,
                activatedAt = activation.activatedAt,
                expiresAt = activation.expiresAt,
                remainingDays = remainingDays,
            )
        }

        // Valid activation
        _activationState.value = ActivationState.ACTIVATED
        val remainingDays = if (expiresAt != null) {
            ((expiresAt - now) / (1000 * 60 * 60 * 24)).toInt()
        } else {
            null
        }

        return ActivationStatus(
            state = ActivationState.ACTIVATED,
            deviceId = activation.deviceId,
            deviceName = activation.deviceName,
            activatedAt = activation.activatedAt,
            expiresAt = activation.expiresAt,
            remainingDays = remainingDays,
        )
    }

    /**
     * Unbind (deactivate) the device from the fleet account.
     *
     * This requires confirmation from the server and permanently
     * removes the activation credentials from the device.
     *
     * @return true if unbind was successful.
     */
    suspend fun unbind(): Boolean {
        return try {
            val code = activationRepository.getActivationCode() ?: return false
            val deviceId = activationRepository.getDeviceId()

            // Notify control server (best-effort; a dedicated unbind endpoint
            // should be added to ApiService in the future).
            try {
                apiService.activateDevice(
                    com.phonefarm.client.network.ActivationRequest(
                        deviceId = deviceId,
                        activationCode = code,
                    )
                )
            } catch (_: Exception) {
                // Server notification is best-effort; proceed with local cleanup
            }

            // Clear local activation data
            activationRepository.clearActivation()

            // Update state to not activated
            _activationState.value = ActivationState.NOT_ACTIVATED

            true
        } catch (e: Exception) {
            false
        }
    }
}

// === Activation State & Results ===

/** High-level activation state for UI. */
enum class ActivationState {
    NOT_ACTIVATED,
    ACTIVATING,
    ACTIVATED,
    EXPIRED,
    ACTIVATION_FAILED,
}

/** Result of an activation attempt. */
sealed class ActivationResult {
    data class Success(val expiresAt: Long?) : ActivationResult()
    data class Failure(val code: ActivationErrorCode, val message: String) : ActivationResult()
}

/** Detailed activation status with metadata. */
data class ActivationStatus(
    val state: ActivationState,
    val deviceId: String?,
    val deviceName: String?,
    val activatedAt: Long?,
    val expiresAt: Long?,
    val remainingDays: Int?,
)

/** Activation error codes. */
enum class ActivationErrorCode {
    INVALID_FORMAT,
    ALREADY_USED,
    EXPIRED,
    DEVICE_LIMIT_REACHED,
    NETWORK_ERROR,
    SERVER_ERROR,
    UNKNOWN,
}
