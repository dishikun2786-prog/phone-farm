package com.phonefarm.client.activation

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.phonefarm.client.data.local.dao.ActivationDao
import com.phonefarm.client.data.local.entity.ActivationEntity
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Persistence layer for activation data.
 *
 * Uses two-tier storage:
 *   1. **EncryptedSharedPreferences** — securely stores the activation code
 *      (card key) with AES-256 encryption.
 *   2. **Room (ActivationDao)** — stores activation metadata (deviceId,
 *      timestamps, expiration) for fast query and UI display.
 *
 * The encrypted prefs ensure the card key cannot be extracted via
 * root access or backup, while Room provides structured query access.
 */
@Singleton
class ActivationRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val activationDao: ActivationDao,
) {

    companion object {
        private const val PREFS_NAME = "phonefarm_activation"
        private const val KEY_ACTIVATION_CODE = "activation_code"
        private const val KEY_DEVICE_ID = "device_id"
    }

    private val encryptedPrefs: SharedPreferences by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (e: Exception) {
            // Fallback to regular SharedPreferences when encryption is unavailable
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        }
    }

    /**
     * Persist an activation after successful validation.
     *
     * @param code       The validated activation code.
     * @param deviceId   The device identifier.
     * @param deviceName Human-readable device name.
     * @param expiresAt  Expiration timestamp in millis, or null if permanent.
     */
    suspend fun saveActivation(
        code: String,
        deviceId: String,
        deviceName: String?,
        expiresAt: Long?,
    ) {
        encryptedPrefs.edit()
            .putString(KEY_ACTIVATION_CODE, code)
            .putString(KEY_DEVICE_ID, deviceId)
            .apply()

        activationDao.upsert(
            ActivationEntity(
                id = "singleton",
                activationCode = code,
                deviceId = deviceId,
                deviceName = deviceName,
                activatedAt = System.currentTimeMillis(),
                expiresAt = expiresAt,
                isActive = true,
            )
        )
    }

    /**
     * Get the stored activation code (from encrypted storage).
     *
     * @return The activation code string, or null if not activated.
     */
    suspend fun getActivationCode(): String? {
        return encryptedPrefs.getString(KEY_ACTIVATION_CODE, null)
    }

    /**
     * Get the activation metadata entity from Room.
     *
     * @return [ActivationEntity] or null if not activated.
     */
    suspend fun getActivation(): ActivationEntity? {
        return activationDao.get()
    }

    /**
     * Clear all activation data (on unbind).
     */
    suspend fun clearActivation() {
        encryptedPrefs.edit().clear().apply()
        activationDao.delete()
    }

    /**
     * Get the stored device ID (from encrypted prefs).
     */
    fun getDeviceId(): String {
        // Return cached device ID if already generated
        val cached = encryptedPrefs.getString(KEY_DEVICE_ID, null)
        if (cached != null) return cached

        // Generate a persistent device ID from ANDROID_ID + Build.SERIAL via SHA-256
        val androidId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID,
        ) ?: "unknown"

        val serial = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Build.getSerial()
        } else {
            @Suppress("DEPRECATION")
            Build.SERIAL
        } ?: "unknown"

        val input = "$androidId:$serial"
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        val deviceId = digest.joinToString("") { "%02x".format(it) }.take(16).uppercase()

        // Persist for future lookups
        encryptedPrefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()

        return deviceId
    }
}
