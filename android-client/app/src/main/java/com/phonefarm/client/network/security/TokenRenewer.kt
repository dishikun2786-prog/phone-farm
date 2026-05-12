package com.phonefarm.client.network.security

import com.phonefarm.client.network.ApiService
import com.phonefarm.client.network.LoginResponse
import com.phonefarm.client.network.RefreshRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import javax.inject.Inject
import javax.inject.Singleton

/**
 * OkHttp Authenticator for automatic JWT token refresh before expiry.
 *
 * Manages the token lifecycle:
 * 1. Stores access token, refresh token, and expiry timestamp.
 * 2. Provides the current token via [accessToken].
 * 3. Proactively refreshes the token 5 minutes before expiry.
 * 4. If the token is expired and refresh fails, clears state and triggers re-login.
 *
 * Can be wired into an OkHttp Interceptor or OkHttp Authenticator to handle
 * 401 responses transparently.
 */
@Singleton
class TokenRenewer @Inject constructor(
    private val apiService: ApiService,
) {

    private val mutex = Mutex()

    private val _accessToken = MutableStateFlow<String?>(null)
    val accessToken: StateFlow<String?> = _accessToken.asStateFlow()

    private var refreshToken: String? = null
    private var expiresAt: Long = 0L

    private val _isAuthenticated = MutableStateFlow(false)
    val isAuthenticated: StateFlow<Boolean> = _isAuthenticated.asStateFlow()

    companion object {
        /** Refresh the token this many milliseconds before actual expiry. */
        private const val REFRESH_BUFFER_MS = 5 * 60 * 1000L // 5 minutes
    }

    /**
     * Store the tokens obtained from a successful login or activation.
     */
    fun setTokens(accessToken: String, refreshToken: String, expiresAt: Long) {
        this.refreshToken = refreshToken
        this.expiresAt = expiresAt
        _accessToken.value = accessToken
        _isAuthenticated.value = true
    }

    /**
     * Return the current valid access token, refreshing if needed.
     * If the token is near expiry, performs a blocking refresh.
     */
    suspend fun getValidToken(): String? = mutex.withLock {
        val current = _accessToken.value ?: return null

        if (isNearExpiry()) {
            // Proactively refresh.
            return try {
                val response = apiService.refreshToken(RefreshRequest(refreshToken ?: return null))
                setTokens(
                    accessToken = response.token,
                    refreshToken = response.refreshToken,
                    expiresAt = response.expiresAt,
                )
                response.token
            } catch (_: Exception) {
                // Refresh failed, return the current (possibly expired) token.
                // The 401 response will trigger a full re-login flow.
                current
            }
        }

        current
    }

    /**
     * Clear all stored tokens (on logout, auth failure, deactivation).
     */
    fun clear() {
        _accessToken.value = null
        refreshToken = null
        expiresAt = 0L
        _isAuthenticated.value = false
    }

    /**
     * Check if the current token is within the refresh buffer window.
     */
    fun isNearExpiry(): Boolean {
        val token = _accessToken.value ?: return true
        if (expiresAt == 0L) return false
        return System.currentTimeMillis() >= (expiresAt - REFRESH_BUFFER_MS)
    }

    /**
     * Check if the current token is already expired.
     */
    fun isExpired(): Boolean {
        if (expiresAt == 0L) return false
        return System.currentTimeMillis() >= expiresAt
    }
}
