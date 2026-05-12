package com.phonefarm.client.data.local

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * AndroidKeyStore-backed encrypted key-value storage (AES-256-GCM).
 *
 * Wraps [EncryptedSharedPreferences] with a simpler get/put/remove/clear
 * API. The master key is generated on first use and stored in the Android
 * Keystore backed by hardware (TEE/StrongBox where available).
 *
 * All values are encrypted at rest. Keys are stored in plaintext
 * (SharedPreferences key names are not encrypted — store only
 * non-sensitive key names).
 *
 * Typical usage:
 *  - Platform account passwords and session cookies
 *  - Device auth tokens
 *  - API keys
 *  - WebSocket connection secrets
 */
@Singleton
class SecurePreferences @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    companion object {
        private const val PREFERENCES_NAME = "phonefarm_secure_prefs"

        /** TEE/StrongBox preference — defaults to TEE, prefers StrongBox if available. */
        private const val USE_STRONGBOX = true
    }

    /**
     * The underlying encrypted SharedPreferences instance.
     * Lazily initialized — the MasterKey creation involves Keystore
     * operations that should not happen during class loading.
     */
    @Volatile
    private var prefs: SharedPreferences? = null

    private fun ensureInitialized(): SharedPreferences {
        return prefs ?: synchronized(this) {
            prefs ?: createEncryptedPrefs().also { prefs = it }
        }
    }

    private fun createEncryptedPrefs(): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyGenParameterSpec(
                KeyGenParameterSpec.Builder(
                    MasterKey.DEFAULT_MASTER_KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .apply {
                        if (USE_STRONGBOX && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                            setIsStrongBoxBacked(true)
                        }
                    }
                    .build()
            )
            .build()

        return EncryptedSharedPreferences.create(
            context,
            PREFERENCES_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    // ---- public API ----

    /**
     * Store a string value encrypted.
     *
     * @param key   Preference key (plaintext).
     * @param value Value to encrypt and store.
     */
    fun putString(key: String, value: String) {
        ensureInitialized().edit().putString(key, value).apply()
    }

    /**
     * Retrieve and decrypt a string value.
     *
     * @param key Preference key.
     * @return Decrypted value, or null if not found.
     */
    fun getString(key: String): String? {
        return ensureInitialized().getString(key, null)
    }

    /**
     * Store a boolean value encrypted.
     */
    fun putBoolean(key: String, value: Boolean) {
        ensureInitialized().edit().putBoolean(key, value).apply()
    }

    /**
     * Retrieve a boolean value.
     */
    fun getBoolean(key: String, defaultValue: Boolean = false): Boolean {
        return ensureInitialized().getBoolean(key, defaultValue)
    }

    /**
     * Store a long value encrypted.
     */
    fun putLong(key: String, value: Long) {
        ensureInitialized().edit().putLong(key, value).apply()
    }

    /**
     * Retrieve a long value.
     */
    fun getLong(key: String, defaultValue: Long = 0L): Long {
        return ensureInitialized().getLong(key, defaultValue)
    }

    /**
     * Store an integer value encrypted.
     */
    fun putInt(key: String, value: Int) {
        ensureInitialized().edit().putInt(key, value).apply()
    }

    /**
     * Retrieve an integer value.
     */
    fun getInt(key: String, defaultValue: Int = 0): Int {
        return ensureInitialized().getInt(key, defaultValue)
    }

    /**
     * Remove a single key-value pair.
     *
     * @param key Preference key to remove.
     */
    fun remove(key: String) {
        ensureInitialized().edit().remove(key).apply()
    }

    /**
     * Clear all stored preferences.
     *
     * This completely wipes the encrypted preferences file.
     * Use with caution — this will remove all accounts, tokens, and secrets.
     */
    fun clear() {
        ensureInitialized().edit().clear().apply()
    }

    /**
     * Check whether a key exists.
     */
    fun contains(key: String): Boolean {
        return ensureInitialized().contains(key)
    }

    /**
     * Get all keys stored in this preferences file.
     *
     * @return List of all preference keys.
     */
    fun getAllKeys(): List<String> {
        return ensureInitialized().all.keys.toList()
    }
}
