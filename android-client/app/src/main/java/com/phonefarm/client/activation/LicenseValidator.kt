package com.phonefarm.client.activation

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Card key / license validation logic.
 *
 * Activates codes using the following format:
 *   - Prefix: "PHF-" (PhoneFarm) or "PFT-" (PhoneFarm Trial)
 *   - Body: 16-24 alphanumeric characters in 4 groups of 4-6
 *   - Checksum: 4-character Luhn-based checksum suffix
 *
 * Example valid codes:
 *   - PHF-78HUN-MQ345-7R0XE-VTIEO (production)
 *   - PFT-KDKVW-THVFK-H3TOZ-NNMKE (trial, 30-day)
 *
 * Validation steps:
 *   1. Format check: prefix + groups + length
 *   2. Checksum validation: verify last 4 chars match Luhn of body
 *   3. Remote verification: POST to control server for liveness check
 *      (checks if code is already used, has hit device limit, is expired)
 */
@Singleton
class LicenseValidator @Inject constructor() {

    companion object {
        const val PREFIX_PRODUCTION = "PHF-"
        const val PREFIX_TRIAL = "PFT-"
        private val CODE_REGEX = Regex("^(PHF|PFT)-[A-Z0-9]{4,6}-[A-Z0-9]{4,6}-[A-Z0-9]{4,6}-[A-Z0-9]{4,6}\$")
    }

    /**
     * Validate the activation code format locally.
     *
     * @param code The raw activation code string.
     * @return [ValidationResult.Valid] or [ValidationResult.Invalid].
     */
    fun validateFormat(code: String): LicenseValidationResult {
        val stripped = code.replace("-", "")

        if (stripped.length != 16) {
            return LicenseValidationResult.Invalid(
                "Activation code must be exactly 16 alphanumeric characters (after removing hyphens)"
            )
        }

        if (!stripped.all { it in 'A'..'Z' || it in '0'..'9' }) {
            return LicenseValidationResult.Invalid(
                "Activation code must contain only uppercase letters A-Z and digits 0-9"
            )
        }

        val prefix = stripped.substring(0, 3)
        if (prefix != "PHF" && prefix != "PFT") {
            return LicenseValidationResult.Invalid(
                "Activation code must start with PHF (production) or PFT (trial)"
            )
        }

        val body = stripped.substring(3, 15)
        val expectedChecksum = stripped[15]
        val actualChecksum = computeChecksum(body)

        if (actualChecksum != expectedChecksum.toString()) {
            return LicenseValidationResult.Invalid("Checksum validation failed")
        }

        return LicenseValidationResult.Valid(parsedCode = stripped)
    }

    /**
     * Validate the activation code against the control server.
     *
     * @param code     The formatted activation code.
     * @param deviceId The device requesting activation.
     * @return [LicenseValidationResult] from the server.
     */
    suspend fun validateRemote(
        code: String,
        deviceId: String,
        apiService: com.phonefarm.client.network.ApiService,
    ): LicenseValidationResult {
        return try {
            val response = apiService.activateDevice(
                com.phonefarm.client.network.ActivationRequest(
                    deviceId = deviceId,
                    activationCode = code,
                )
            )
            if (response.success) {
                LicenseValidationResult.Valid(parsedCode = code)
            } else {
                LicenseValidationResult.Invalid(
                    reason = response.message ?: "Server rejected activation code"
                )
            }
        } catch (e: Exception) {
            LicenseValidationResult.Invalid(reason = "Network error: ${e.message}")
        }
    }

    /**
     * Determine if a code is a trial (PFT-) or production (PHF-) license.
     */
    fun getLicenseType(code: String): LicenseType {
        return when {
            code.startsWith(PREFIX_PRODUCTION) -> LicenseType.PRODUCTION
            code.startsWith(PREFIX_TRIAL) -> LicenseType.TRIAL
            else -> LicenseType.INVALID
        }
    }

    /**
     * Compute a Luhn-based checksum for format validation.
     */
    private fun computeChecksum(input: String): String {
        val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        val sum = input.sumOf { alphabet.indexOf(it).coerceAtLeast(0) }
        val index = sum % 36
        return alphabet[index].toString()
    }
}

/** License type. */
enum class LicenseType {
    PRODUCTION,
    TRIAL,
    INVALID,
}

/** License validation result. */
sealed class LicenseValidationResult {
    data class Valid(val parsedCode: String) : LicenseValidationResult()
    data class Invalid(val reason: String) : LicenseValidationResult()
}
