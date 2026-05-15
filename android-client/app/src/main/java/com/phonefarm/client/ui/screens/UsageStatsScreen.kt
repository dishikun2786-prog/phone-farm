package com.phonefarm.client.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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

data class UsageStatsUiState(
    val todayVlmCalls: Int = 0,
    val todayScriptExecs: Int = 0,
    val todayScreenStream: Int = 0,
    val vlmLimit: Int = 50,
    val scriptLimit: Int = 200,
    val loading: Boolean = false,
    val error: String = "",
)

@HiltViewModel
class UsageStatsViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {

    private val _uiState = MutableStateFlow(UsageStatsUiState())
    val uiState: StateFlow<UsageStatsUiState> = _uiState.asStateFlow()

    init { loadUsage() }

    private fun loadUsage() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(loading = true)
            try {
                val usage = apiService.getUsageStats()
                _uiState.value = _uiState.value.copy(
                    todayVlmCalls = usage.vlmCall ?: 0,
                    todayScriptExecs = usage.scriptExecution ?: 0,
                    todayScreenStream = usage.screenStreamMinute ?: 0,
                    vlmLimit = usage.limits?.maxVlmCallsPerDay ?: 50,
                    scriptLimit = usage.limits?.maxScriptExecutionsPerDay ?: 200,
                    loading = false,
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message ?: "加载失败", loading = false)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UsageStatsScreen(
    onBack: () -> Unit,
    viewModel: UsageStatsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("用量统计") },
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
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                item {
                    Text("今日用量", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                }

                item { UsageBar(label = "VLM AI 调用", used = state.todayVlmCalls, limit = state.vlmLimit, unit = "次") }
                item { UsageBar(label = "脚本执行", used = state.todayScriptExecs, limit = state.scriptLimit, unit = "次") }
                item { UsageBar(label = "屏幕推流", used = state.todayScreenStream, limit = 60, unit = "分钟") }

                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("套餐限额", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("VLM 调用: ${state.vlmLimit} 次/天", style = MaterialTheme.typography.bodyMedium)
                            Text("脚本执行: ${state.scriptLimit} 次/天", style = MaterialTheme.typography.bodyMedium)
                            Text("用量每日 00:00 重置", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun UsageBar(label: String, used: Int, limit: Int, unit: String) {
    val percent = if (limit > 0) (used.toFloat() / limit).coerceAtMost(1f) else 0f
    val barColor = when {
        percent > 0.9f -> MaterialTheme.colorScheme.error
        percent > 0.7f -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.primary
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(label, style = MaterialTheme.typography.bodyMedium)
                Text("$used / $limit $unit", style = MaterialTheme.typography.bodySmall)
            }
            Spacer(modifier = Modifier.height(8.dp))
            LinearProgressIndicator(
                progress = { percent },
                modifier = Modifier.fillMaxWidth().height(8.dp),
                color = barColor,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )
        }
    }
}
