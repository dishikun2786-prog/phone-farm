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
import com.phonefarm.client.ui.components.*
import com.phonefarm.client.ui.theme.Error
import com.phonefarm.client.ui.theme.Success
import com.phonefarm.client.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
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
)

@HiltViewModel
class HomeViewModel @Inject constructor() : ViewModel() {
    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init { loadDashboardData() }

    fun loadDashboardData() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            delay(800)

            val devices = listOf(
                DeviceGridItem("d1", "Pixel 7 Pro", "Pixel 7 Pro · Android 15", true, "idle", 23, 0),
                DeviceGridItem("d2", "Galaxy S24", "SM-S9210 · Android 14", true, "executing", 18, 3),
                DeviceGridItem("d3", "OnePlus 12", "PJD110 · Android 15", false, "offline", 11, 0),
                DeviceGridItem("d4", "Xiaomi 14", "23127PN0CC · MIUI 15", true, "idle", 31, 0),
            )

            _uiState.value = HomeUiState(
                isLoading = false,
                devices = devices,
                onlineCount = devices.count { it.isOnline },
                scriptCount = 42,
                todayExecutionCount = 156,
                activeTaskCount = devices.sumOf { it.activeTaskCount },
                activityItems = listOf(
                    ActivityItem("t1", "抖音推荐营销", "Pixel 7 Pro", ActivityStatus.COMPLETED, "2分钟前"),
                    ActivityItem("t2", "快手搜索用户", "Galaxy S24", ActivityStatus.RUNNING, "5分钟前"),
                    ActivityItem("t3", "微信视频号推荐", "OnePlus 12", ActivityStatus.FAILED, "15分钟前"),
                    ActivityItem("t4", "小红书涨粉", "Xiaomi 14", ActivityStatus.COMPLETED, "1小时前"),
                    ActivityItem("t5", "抖音同城营销", "Pixel 7 Pro", ActivityStatus.COMPLETED, "2小时前"),
                    ActivityItem("t6", "抖音AI智能回复", "Galaxy S24", ActivityStatus.FAILED, "3小时前"),
                ),
            )
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
