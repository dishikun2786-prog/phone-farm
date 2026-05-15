package com.phonefarm.client.assistant

import com.phonefarm.client.network.ApiService
import com.phonefarm.client.network.AssistantConfigResponse
import com.phonefarm.client.network.CreditCheckRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Client-side credit balance manager.
 *
 * Caches the user's credit balance locally and syncs with the server.
 * All credit mutation happens server-side; this class tracks the local view
 * and provides optimistic balance updates.
 */
@Singleton
class CreditManager @Inject constructor(
    private val apiService: ApiService,
) {

    private val _balance = MutableStateFlow(0)
    val balance: StateFlow<Int> = _balance.asStateFlow()

    private val _totalEarned = MutableStateFlow(0)
    val totalEarned: StateFlow<Int> = _totalEarned.asStateFlow()

    private val _totalSpent = MutableStateFlow(0)
    val totalSpent: StateFlow<Int> = _totalSpent.asStateFlow()

    private var pendingCost = 0

    /** Fetch balance and assistant config from server. */
    suspend fun refresh(): Result<AssistantConfigResponse> {
        return try {
            val config = apiService.getAssistantConfig()
            _balance.value = config.credits.balance
            _totalEarned.value = config.credits.totalEarned
            _totalSpent.value = config.credits.totalSpent
            pendingCost = 0
            Result.success(config)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Check if user has enough credits locally. */
    fun hasEnough(minRequired: Int): Boolean {
        return _balance.value - pendingCost >= minRequired
    }

    /** Server-side credit check with authoritative balance. */
    suspend fun checkCredits(minRequired: Int): Boolean {
        return try {
            val response = apiService.checkCredits(CreditCheckRequest(minRequired))
            _balance.value = response.balance
            response.enough
        } catch (_: Exception) {
            hasEnough(minRequired)
        }
    }

    /** Track token usage locally (server tracks via LLM proxy endpoints). */
    suspend fun trackUsage(
        sessionId: String,
        model: String,
        inputTokens: Int,
        outputTokens: Int,
    ) {
        val estimatedCost = estimateCreditCost(model, inputTokens, outputTokens)
        pendingCost += estimatedCost
    }

    private fun estimateCreditCost(model: String, inputTokens: Int, outputTokens: Int): Int {
        val inputRate = 5000
        val outputRate = 2000
        return (inputTokens + inputRate - 1) / inputRate + (outputTokens + outputRate - 1) / outputRate
    }

    /** Force a balance refresh from the server. */
    suspend fun syncBalance(): Int {
        refresh()
        return _balance.value
    }
}
