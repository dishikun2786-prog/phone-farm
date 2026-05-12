package com.phonefarm.client.account

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Central manager for platform account CRUD and encrypted storage.
 *
 * Accounts (username + password + session cookies) are stored encrypted using
 * the AndroidKeyStore-backed SecurePreferences. Each account is associated
 * with a platform (e.g., "wechat", "douyin", "kuaishou", "xiaohongshu")
 * and can be linked to a specific device via deviceId.
 */
@Singleton
class AccountManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    data class PlatformAccount(
        val id: String,
        val platform: String,
        val username: String,
        val password: String,       // encrypted at rest
        val cookies: String?,       // session cookie JSON, encrypted at rest
        val deviceId: String?,
        val healthStatus: AccountHealthStatus,
        val lastCheckedAt: Long?,
        val createdAt: Long,
    )

    enum class AccountHealthStatus {
        UNKNOWN,
        HEALTHY,        // login still valid
        EXPIRED,        // session/cookie expired, re-login needed
        LOCKED,         // account locked by platform
        RATE_LIMITED,   // temporary rate limit
        BANNED,         // permanently banned
        ERROR,          // check failed for unknown reason
    }

    private val _accounts = MutableStateFlow<List<PlatformAccount>>(emptyList())
    val accounts: StateFlow<List<PlatformAccount>> = _accounts.asStateFlow()

    // ---- public API ----

    /**
     * Add a new platform account or update an existing one.
     *
     * @param platform  Platform identifier (wechat, douyin, kuaishou, xiaohongshu, etc.).
     * @param username  Plaintext username.
     * @param password  Plaintext password (will be stored encrypted).
     * @param cookies   Optional session cookies JSON string from WebView login.
     * @param deviceId  Optional device binding.
     * @return The created/updated [PlatformAccount].
     */
    suspend fun addAccount(
        platform: String,
        username: String,
        password: String,
        cookies: String? = null,
        deviceId: String? = null,
    ): PlatformAccount {
        // TODO: Encrypt password and cookies via SecurePreferences.
        // TODO: Generate unique account ID (UUID).
        // TODO: Persist to Room (AccountEntity) or local encrypted file.
        // TODO: Update _accounts StateFlow.
        throw NotImplementedError("AccountManager.addAccount not yet implemented")
    }

    /**
     * Delete an account by ID.
     *
     * @param id The account UUID.
     */
    suspend fun deleteAccount(id: String) {
        // TODO: Remove from storage.
        // TODO: Update _accounts StateFlow.
        throw NotImplementedError("AccountManager.deleteAccount not yet implemented")
    }

    /**
     * Check the health of a single account (login validity, rate limit, ban status).
     *
     * Performs an HTTP health-check call via the platform's API, or a
     * simple cookie validity check against the platform's home page.
     *
     * @param id  The account UUID.
     * @return Updated [AccountHealthStatus].
     */
    suspend fun checkAccountHealth(id: String): AccountHealthStatus {
        // TODO: Load account credentials.
        // TODO: Perform platform-specific health check (HTTP head request with cookies).
        // TODO: Update health status in storage.
        // TODO: Update _accounts StateFlow.
        throw NotImplementedError("AccountManager.checkAccountHealth not yet implemented")
    }

    /**
     * Get accounts filtered by platform.
     */
    fun getAccountsByPlatform(platform: String): List<PlatformAccount> {
        return _accounts.value.filter { it.platform == platform }
    }

    /**
     * Get accounts filtered by device binding.
     */
    fun getAccountsByDevice(deviceId: String): List<PlatformAccount> {
        return _accounts.value.filter { it.deviceId == deviceId }
    }

    /**
     * Reload accounts from storage and update the StateFlow.
     */
    suspend fun refresh() {
        // TODO: Reload from SecurePreferences / Room.
        // TODO: Update _accounts.value.
    }
}
