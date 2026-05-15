package com.phonefarm.client.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phonefarm.client.network.ApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PlanItem(
    val id: String,
    val name: String,
    val tier: String,
    val priceYuan: Double,
    val maxDevices: Int,
    val maxVlmPerDay: Int,
    val features: List<String>,
)

data class UpgradePlanUiState(
    val plans: List<PlanItem> = emptyList(),
    val loading: Boolean = false,
    val error: String = "",
    val subscribingPlanId: String? = null,
    val subscribeSuccess: Boolean = false,
)

@HiltViewModel
class UpgradePlanViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(UpgradePlanUiState())
    val uiState: StateFlow<UpgradePlanUiState> = _uiState.asStateFlow()

    init { loadPlans() }

    private fun loadPlans() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(loading = true)
            try {
                val response = apiService.getBillingPlans()
                val plans = response.plans.map { plan ->
                    PlanItem(
                        id = plan.id,
                        name = plan.name,
                        tier = plan.tier,
                        priceYuan = (plan.monthlyPriceCents ?: 0) / 100.0,
                        maxDevices = plan.maxDevices ?: 1,
                        maxVlmPerDay = plan.maxVlmCallsPerDay ?: 100,
                        features = (plan.features as? List<*>)?.map { it.toString() } ?: emptyList(),
                    )
                }
                _uiState.value = _uiState.value.copy(plans = plans, loading = false)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "加载失败", loading = false)
            }
        }
    }

    fun subscribe(planId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(subscribingPlanId = planId)
            try {
                apiService.subscribePlan(planId)
                _uiState.value = _uiState.value.copy(subscribingPlanId = null, subscribeSuccess = true)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    subscribingPlanId = null,
                    error = e.message ?: "订阅失败"
                )
            }
        }
    }

    fun clearError() { _uiState.value = _uiState.value.copy(error = "") }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpgradePlanScreen(
    onBack: () -> Unit,
    viewModel: UpgradePlanViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("升级套餐") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        }
    ) { padding ->
        if (state.loading) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (state.error.isNotEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(text = state.error, color = MaterialTheme.colorScheme.error)
                    Spacer(modifier = Modifier.height(8.dp))
                    TextButton(onClick = { viewModel.clearError() }) { Text("重试") }
                }
            }
        } else if (state.subscribeSuccess) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("订阅成功！", style = MaterialTheme.typography.titleLarge)
                    Spacer(modifier = Modifier.height(8.dp))
                    TextButton(onClick = onBack) { Text("返回") }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(state.plans) { plan ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = if (plan.tier == "pro") CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer
                        ) else CardDefaults.cardColors()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(plan.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                if (plan.tier == "pro") {
                                    Spacer(modifier = Modifier.width(8.dp))
                                    SuggestionChip(
                                        onClick = {},
                                        label = { Text("推荐") }
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("${plan.priceYuan.toInt()} 元/月", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("最多 ${plan.maxDevices} 台设备")
                            Text("每日 ${plan.maxVlmPerDay} 次 VLM 调用")
                            plan.features.forEach { feature ->
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(feature, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = { viewModel.subscribe(plan.id) },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = state.subscribingPlanId != plan.id
                            ) {
                                if (state.subscribingPlanId == plan.id) {
                                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                } else {
                                    Text(if (plan.priceYuan == 0.0) "当前套餐" else "立即订阅")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
