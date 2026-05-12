package com.phonefarm.client.account

import com.phonefarm.client.data.local.SecurePreferences
import com.phonefarm.client.data.local.dao.PlatformAccountDao
import com.phonefarm.client.data.local.entity.PlatformAccountEntity
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Central manager for platform account CRUD and encrypted storage.
 *
 * Accounts metadata is persisted in Room (PlatformAccountEntity).
 * Passwords and session cookies are stored encrypted via SecurePreferences,
 * keyed by account ID — they never touch Room in plaintext.
 */
@Singleton
class AccountManager @Inject constructor(
    private val dao: PlatformAccountDao,
    private val securePrefs: SecurePreferences,
) {

    data class PlatformAccount(
        val id: String,
        val platform: String,
        val username: String,
        val password: String,
        val cookies: String?,
        val deviceId: String?,
        val healthStatus: AccountHealthStatus,
        val lastCheckedAt: Long?,
        val createdAt: Long,
    )

    enum class AccountHealthStatus {
        UNKNOWN,
        HEALTHY,
        EXPIRED,
        LOCKED,
        RATE_LIMITED,
        BANNED,
        ERROR,
    }

    companion object {
        private const val TAG = "AccountManager"
        private const val PREF_PASSWORD_PREFIX = "acct_pwd_"
        private const val PREF_COOKIES_PREFIX = "acct_ck_"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob() + CoroutineName("AccountManager"))

    private val _accounts = MutableStateFlow<List<PlatformAccount>>(emptyList())
    val accounts: StateFlow<List<PlatformAccount>> = _accounts.asStateFlow()

    init {
        scope.launch { loadFromStorage() }
    }

    // ---- public API ----

    suspend fun addAccount(
        platform: String,
        username: String,
        password: String,
        cookies: String? = null,
        deviceId: String? = null,
    ): PlatformAccount {
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()

        val entity = PlatformAccountEntity(
            id = id,
            platform = platform,
            username = username,
            deviceId = deviceId,
            healthStatus = AccountHealthStatus.UNKNOWN.name,
            lastCheckedAt = null,
            createdAt = now,
            updatedAt = now,
        )
        dao.upsert(entity)

        securePrefs.putString(PREF_PASSWORD_PREFIX + id, password)
        if (cookies != null) {
            securePrefs.putString(PREF_COOKIES_PREFIX + id, cookies)
        }

        loadFromStorage()
        return PlatformAccount(
            id = id,
            platform = platform,
            username = username,
            password = password,
            cookies = cookies,
            deviceId = deviceId,
            healthStatus = AccountHealthStatus.UNKNOWN,
            lastCheckedAt = null,
            createdAt = now,
        )
    }

    suspend fun deleteAccount(id: String) {
        dao.deleteById(id)
        securePrefs.remove(PREF_PASSWORD_PREFIX + id)
        securePrefs.remove(PREF_COOKIES_PREFIX + id)
        loadFromStorage()
    }

    suspend fun updateAccountHealth(
        id: String,
        status: AccountHealthStatus,
    ) {
        val entity = dao.getById(id) ?: return
        dao.upsert(entity.copy(
            healthStatus = status.name,
            lastCheckedAt = System.currentTimeMillis(),
            updatedAt = System.currentTimeMillis(),
        ))
        loadFromStorage()
    }

    suspend fun checkAccountHealth(id: String): AccountHealthStatus {
        val entity = dao.getById(id) ?: return AccountHealthStatus.ERROR
        val cookies = securePrefs.getString(PREF_COOKIES_PREFIX + id)

        val status = try {
            performHealthCheck(entity.platform, entity.username, cookies)
        } catch (e: Exception) {
            android.util.Log.w(TAG, "Health check failed for ${entity.username}: ${e.message}")
            AccountHealthStatus.ERROR
        }

        dao.upsert(entity.copy(
            healthStatus = status.name,
            lastCheckedAt = System.currentTimeMillis(),
            updatedAt = System.currentTimeMillis(),
        ))
        loadFromStorage()
        return status
    }

    fun getAccountsByPlatform(platform: String): List<PlatformAccount> {
        return _accounts.value.filter { it.platform == platform }
    }

    fun getAccountsByDevice(deviceId: String): List<PlatformAccount> {
        return _accounts.value.filter { it.deviceId == deviceId }
    }

    suspend fun refresh() {
        loadFromStorage()
    }

    // ---- private helpers ----

    private suspend fun loadFromStorage() {
        val entities = dao.getAll()
        val accounts = entities.map { entity ->
            PlatformAccount(
                id = entity.id,
                platform = entity.platform,
                username = entity.username,
                password = securePrefs.getString(PREF_PASSWORD_PREFIX + entity.id) ?: "",
                cookies = securePrefs.getString(PREF_COOKIES_PREFIX + entity.id),
                deviceId = entity.deviceId,
                healthStatus = try {
                    AccountHealthStatus.valueOf(entity.healthStatus)
                } catch (_: IllegalArgumentException) {
                    AccountHealthStatus.UNKNOWN
                },
                lastCheckedAt = entity.lastCheckedAt,
                createdAt = entity.createdAt,
            )
        }
        _accounts.value = accounts
    }

    private fun performHealthCheck(
        platform: String,
        username: String,
        cookies: String?,
    ): AccountHealthStatus {
        // Platform-specific health check via HTTP
        // For now, check if cookies exist as a baseline
        if (cookies.isNullOrBlank()) {
            return AccountHealthStatus.EXPIRED
        }
        // TODO: Perform actual HTTP request to platform's home page
        // to validate cookie/session validity
        return AccountHealthStatus.UNKNOWN
    }
}
