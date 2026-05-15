package com.phonefarm.client.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phonefarm.client.network.ApiService
import com.phonefarm.client.ui.components.*
import com.phonefarm.client.ui.theme.Error
import com.phonefarm.client.ui.theme.Success
import com.phonefarm.client.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val isLoading: Boolean = true,
    val devices: List<DeviceGridItem> = emptyList(),
    val onlineCount: Int = 0,
    val scriptCount: Int = 0,
    val todayExecutionCount: Int = 0,
    val activeTaskCount: Int = 0,
    val activityItems: List<ActivityItem> = emptyList(),
    val errorMessage: String? = null,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val apiService: ApiService,
) : ViewModel() {
    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init { loadDashboardData() }

    fun loadDashboardData() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)

            try {
                // Fetch device config (this device) to confirm connectivity
                val config = apiService.getDeviceConfig(android.provider.Settings.Secure.ANDROID_ID)
                val scriptManifest = apiService.getScriptManifest()

                val deviceItem = DeviceGridItem(
                    id = config.deviceId,
                    name = config.deviceName,
                    subtitle = "Android · ${android.os.Build.MODEL}",
                    isOnline = true,
                    status = "connected",
                    battery = 0,
                    activeTaskCount = 0,
                )

                _uiState.value = HomeUiState(
                    isLoading = false,
                    devices = listOf(deviceItem),
                    onlineCount = 1,
                    scriptCount = scriptManifest.size,
                    todayExecutionCount = 0,
                    activeTaskCount = 0,
                    activityItems = emptyList(),
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = "无法连接服务器: ${e.message}",
                )
            }
        }
    }
}

@Composable
fun HomeScreen(
    onDeviceClick: (String) -> Unit = {},
    onNavigateToNotifications: () -> Unit = {},
    onNavigateToTaskLog: () -> Unit = {},
    onQuickAction: (String) -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 80.dp),
    ) {
        // Status cards
        item {
            LiveStatusCards(
                cards = listOf(
                    StatusCardData("在线设备", "${state.onlineCount}", "🟢", Success),
                    StatusCardData("脚本", "${state.scriptCount}", "📜", MaterialTheme.colorScheme.primary),
                    StatusCardData("今日执行", "${state.todayExecutionCount}", "▶", Warning),
                    StatusCardData("进行中", "${state.activeTaskCount}", "⏳", Warning),
                ),
            )
        }

        // Device section header
        item {
            SectionHeader(
                title = "设备列表",
                action = {
                    TextButton(onClick = { /* filter action */ }) {
                        Text("筛选", style = MaterialTheme.typography.labelMedium)
                    }
                },
            )
        }

        // Device grid
        item {
            DeviceGrid(
                devices = state.devices,
                onDeviceClick = onDeviceClick,
                onAddDevice = { /* add device flow */ },
            )
        }

        // Activity section header
        item {
            SectionHeader(
                title = "最近活动",
                action = {
                    TextButton(onClick = onNavigateToTaskLog) {
                        Text("查看全部", style = MaterialTheme.typography.labelMedium)
                    }
                },
            )
        }

        // Activity feed
        item {
            ActivityFeed(
                items = state.activityItems,
                onViewAll = onNavigateToTaskLog,
            )
        }
    }
}
