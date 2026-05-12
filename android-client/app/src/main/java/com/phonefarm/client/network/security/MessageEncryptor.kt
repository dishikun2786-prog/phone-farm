package com.phonefarm.client.network.security

import android.util.Base64
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import javax.inject.Inject
import javax.inject.Singleton

/**
 * AES-256-GCM encrypt/decrypt for sensitive WebSocket payloads.
 *
 * Used for messages that contain credentials, tokens, personal data,
 * or any content that should not be readable in transit even over TLS.
 *
 * Key is derived from the device-specific secret exchanged during activation.
 * IV is randomly generated per message and prepended to the ciphertext.
 *
 * Format: base64( IV[12 bytes] + ciphertext + tag[16 bytes] )
 */
@Singleton
class MessageEncryptor @Inject constructor() {

    companion object {
        private const val ALGORITHM = "AES"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH = 128 // bits
        private const val IV_LENGTH = 12 // bytes (recommended for GCM)
    }

    private var secretKey: SecretKeySpec? = null

    /**
     * Initialize the encryptor with a device-specific key.
     * [keyBase64] is a base64-encoded 256-bit AES key obtained during activation.
     */
    fun initialize(keyBase64: String) {
        val keyBytes = Base64.decode(keyBase64, Base64.NO_WRAP)
        require(keyBytes.size == 32) { "AES-256 requires a 32-byte key" }
        secretKey = SecretKeySpec(keyBytes, ALGORITHM)
    }

    /**
     * Check whether the encryptor has been initialized with a key.
     */
    fun isInitialized(): Boolean = secretKey != null

    /**
     * Encrypt [plaintext] using AES-256-GCM.
     *
     * 1. Generate a random 12-byte IV.
     * 2. Encrypt the plaintext bytes.
     * 3. Return base64(IV + ciphertext + GCM tag).
     *
     * Returns null if not initialized or encryption fails.
     */
    fun encrypt(plaintext: String): String? {
        val key = secretKey ?: return null
        return try {
            val iv = ByteArray(IV_LENGTH).also { SecureRandom().nextBytes(it) }
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
            cipher.init(Cipher.ENCRYPT_MODE, key, spec)

            val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
            // Prepend IV to ciphertext for transport.
            val combined = iv + ciphertext
            Base64.encodeToString(combined, Base64.NO_WRAP)
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Decrypt [ciphertextBase64] using AES-256-GCM.
     *
     * 1. Decode base64 to get IV + ciphertext.
     * 2. Extract IV (first 12 bytes).
     * 3. Decrypt the remaining bytes.
     * 4. Return the plaintext string.
     *
     * Returns null if not initialized or decryption fails.
     */
    fun decrypt(ciphertextBase64: String): String? {
        val key = secretKey ?: return null
        return try {
            val combined = Base64.decode(ciphertextBase64, Base64.NO_WRAP)
            require(combined.size > IV_LENGTH) { "Invalid ciphertext length" }

            val iv = combined.copyOfRange(0, IV_LENGTH)
            val ciphertext = combined.copyOfRange(IV_LENGTH, combined.size)

            val cipher = Cipher.getInstance(TRANSFORMATION)
            val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
            cipher.init(Cipher.DECRYPT_MODE, key, spec)

            val plaintext = cipher.doFinal(ciphertext)
            String(plaintext, Charsets.UTF_8)
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Encrypt binary data (for screenshots, file transfers).
     */
    fun encryptBytes(data: ByteArray): ByteArray? {
        val key = secretKey ?: return null
        return try {
            val iv = ByteArray(IV_LENGTH).also { SecureRandom().nextBytes(it) }
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
            cipher.init(Cipher.ENCRYPT_MODE, key, spec)
            iv + cipher.doFinal(data)
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Decrypt binary data.
     */
    fun decryptBytes(data: ByteArray): ByteArray? {
        val key = secretKey ?: return null
        return try {
            require(data.size > IV_LENGTH) { "Invalid ciphertext length" }
            val iv = data.copyOfRange(0, IV_LENGTH)
            val ciphertext = data.copyOfRange(IV_LENGTH, data.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
            cipher.init(Cipher.DECRYPT_MODE, key, spec)
            cipher.doFinal(ciphertext)
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Clear the secret key from memory.
     */
    fun clear() {
        secretKey = null
    }
}
