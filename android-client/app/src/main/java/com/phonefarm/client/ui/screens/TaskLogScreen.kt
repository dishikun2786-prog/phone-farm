package com.phonefarm.client.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
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

data class TaskLogItem(
    val id: String,
    val scriptName: String,
    val deviceName: String,
    val platform: String,
    val status: String, // running, completed, failed, stopped
    val startedAt: Long,
    val finishedAt: Long?,
    val durationMs: Long
)

enum class TaskStatusFilter(val label: String) {
    ALL("全部"), SUCCESS("成功"), FAILED("失败"), RUNNING("运行中")
}

data class TaskLogUiState(
    val isLoading: Boolean = true,
    val tasks: List<TaskLogItem> = emptyList(),
    val selectedFilter: TaskStatusFilter = TaskStatusFilter.ALL,
    val searchQuery: String = "",
    val showDatePicker: Boolean = false
)

@HiltViewModel
class TaskLogViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(TaskLogUiState())
    val uiState: StateFlow<TaskLogUiState> = _uiState.asStateFlow()

    private val allTasks = mutableListOf<TaskLogItem>()

    init {
        loadTasks()
    }

    fun loadTasks() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            delay(500)

            // TODO: Load from TaskLogDao
            allTasks.clear()
            allTasks.addAll(listOf(
                TaskLogItem("t1", "抖音推荐营销", "Pixel 7 Pro", "抖音", "completed", System.currentTimeMillis() - 300_000, System.currentTimeMillis() - 100_000, 200_000),
                TaskLogItem("t2", "快手搜索营销", "Galaxy S24", "快手", "running", System.currentTimeMillis() - 600_000, null, 600_000),
                TaskLogItem("t3", "微信视频号营销", "OnePlus 12", "微信", "failed", System.currentTimeMillis() - 1_800_000, System.currentTimeMillis() - 1_750_000, 50_000),
                TaskLogItem("t4", "小红书养号", "Pixel 7 Pro", "小红书", "completed", System.currentTimeMillis() - 3_600_000, System.currentTimeMillis() - 2_400_000, 1_200_000),
                TaskLogItem("t5", "抖音评论互动", "Galaxy S24", "抖音", "completed", System.currentTimeMillis() - 5_400_000, System.currentTimeMillis() - 4_800_000, 600_000)
            ))

            applyFilters()
        }
    }

    fun setFilter(filter: TaskStatusFilter) {
        _uiState.value = _uiState.value.copy(selectedFilter = filter)
        applyFilters()
    }

    fun updateSearchQuery(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
        applyFilters()
    }

    private fun applyFilters() {
        val state = _uiState.value
        var filtered = allTasks.toList()

        when (state.selectedFilter) {
            TaskStatusFilter.ALL -> {}
            TaskStatusFilter.SUCCESS -> filtered = filtered.filter { it.status == "completed" }
            TaskStatusFilter.FAILED -> filtered = filtered.filter { it.status == "failed" }
            TaskStatusFilter.RUNNING -> filtered = filtered.filter { it.status == "running" }
        }

        if (state.searchQuery.isNotBlank()) {
            filtered = filtered.filter {
                it.scriptName.contains(state.searchQuery, ignoreCase = true) ||
                        it.deviceName.contains(state.searchQuery, ignoreCase = true)
            }
        }

        _uiState.value = state.copy(tasks = filtered, isLoading = false)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskLogScreen(
    onBack: () -> Unit,
    viewModel: TaskLogViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("任务日志") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Status filter chips
            ScrollableTabRow(
                selectedTabIndex = TaskStatusFilter.entries.indexOf(state.selectedFilter),
                modifier = Modifier.fillMaxWidth(),
                edgePadding = 16.dp
            ) {
                TaskStatusFilter.entries.forEach { filter ->
                    Tab(
                        selected = state.selectedFilter == filter,
                        onClick = { viewModel.setFilter(filter) },
                        text = {
                            Text(
                                text = filter.label,
                                fontWeight = if (state.selectedFilter == filter) FontWeight.Medium else FontWeight.Normal
                            )
                        }
                    )
                }
            }

            // Search bar
            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = viewModel::updateSearchQuery,
                placeholder = { Text("搜索任务或设备...") },
                leadingIcon = {
                    Icon(Icons.Default.Search, contentDescription = null)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                singleLine = true
            )

            // Task list
            if (state.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else if (state.tasks.isEmpty()) {
                EmptyTaskLogState(modifier = Modifier.fillMaxSize())
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(state.tasks) { task ->
                        TaskLogCard(task = task)
                    }

                    item { Spacer(modifier = Modifier.height(16.dp)) }
                }
            }
        }
    }
}

@Composable
private fun EmptyTaskLogState(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp)
        ) {
            Icon(
                Icons.Default.History,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "暂无执行记录",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "执行脚本后将在此显示历史记录",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun TaskLogCard(task: TaskLogItem) {
    val statusColor = when (task.status) {
        "completed" -> Success
        "running" -> Warning
        "failed" -> Error
        else -> MaterialTheme.colorScheme.outline
    }
    val statusLabel = when (task.status) {
        "completed" -> "成功"
        "running" -> "运行中"
        "failed" -> "失败"
        "stopped" -> "已停止"
        else -> task.status
    }
    val statusIcon = when (task.status) {
        "completed" -> Icons.Default.CheckCircle
        "running" -> Icons.Default.HourglassBottom
        "failed" -> Icons.Default.Error
        else -> Icons.Default.Info
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    statusIcon,
                    contentDescription = null,
                    tint = statusColor,
                    modifier = Modifier.size(24.dp)
                )

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = task.scriptName,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = "${task.deviceName} | ${task.platform}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Surface(
                    shape = MaterialTheme.shapes.small,
                    color = statusColor.copy(alpha = 0.1f)
                ) {
                    Text(
                        text = statusLabel,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = statusColor,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = formatTimestamp(task.startedAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Text(
                    text = formatDuration(task.durationMs),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

private fun formatTimestamp(timestamp: Long): String {
    val sdf = java.text.SimpleDateFormat("MM-dd HH:mm", java.util.Locale.getDefault())
    return sdf.format(java.util.Date(timestamp))
}

private fun formatDuration(ms: Long): String {
    if (ms <= 0) return "--"
    val seconds = ms / 1000
    val minutes = seconds / 60
    val hours = minutes / 60
    return when {
        hours > 0 -> "${hours}h${minutes % 60}m"
        minutes > 0 -> "${minutes}m${seconds % 60}s"
        else -> "${seconds}s"
    }
}
