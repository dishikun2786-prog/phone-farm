package com.phonefarm.client.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.text.style.TextOverflow
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

data class NotificationItem(
    val id: Long,
    val type: String, // task, system, update, alert
    val title: String,
    val body: String,
    val timestamp: Long,
    val isRead: Boolean,
    val actionUrl: String? = null
)

enum class NotificationFilter(val label: String, val type: String?) {
    ALL("全部", null),
    TASK("任务", "task"),
    SYSTEM("系统", "system"),
    UPDATE("更新", "update"),
    ALERT("提醒", "alert")
}

data class NotificationsCenterUiState(
    val notifications: List<NotificationItem> = emptyList(),
    val selectedFilter: NotificationFilter = NotificationFilter.ALL,
    val isLoading: Boolean = true,
    val unreadCount: Int = 0
)

@HiltViewModel
class NotificationsCenterViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(NotificationsCenterUiState())
    val uiState: StateFlow<NotificationsCenterUiState> = _uiState.asStateFlow()

    private val allNotifications = mutableListOf<NotificationItem>()

    init {
        loadNotifications()
    }

    fun loadNotifications() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            delay(400)

            // TODO: Load from NotificationDao
            allNotifications.clear()
            allNotifications.addAll(listOf(
                NotificationItem(1, "task", "任务执行完成", "抖音推荐营销 在 Pixel 7 Pro 上执行成功", System.currentTimeMillis() - 300_000, false),
                NotificationItem(2, "alert", "设备离线", "Galaxy S24 已断开连接超过5分钟", System.currentTimeMillis() - 1_800_000, false),
                NotificationItem(3, "update", "脚本更新可用", "task_dy_toker.js v2.5 可用", System.currentTimeMillis() - 3_600_000, true),
                NotificationItem(4, "system", "系统维护通知", "计划于 2026-05-12 02:00 进行系统维护", System.currentTimeMillis() - 24 * 3_600_000, true),
                NotificationItem(5, "task", "任务执行失败", "快手搜索营销 在 OnePlus 12 上执行失败: 网络超时", System.currentTimeMillis() - 36_000_000, true, "/taskLog"),
                NotificationItem(6, "system", "插件已安装", "Headscale VPN 1.72.0 安装完成", System.currentTimeMillis() - 48 * 3_600_000, true)
            ))

            applyFilter()
        }
    }

    fun setFilter(filter: NotificationFilter) {
        _uiState.value = _uiState.value.copy(selectedFilter = filter)
        applyFilter()
    }

    fun markAsRead(id: Long) {
        val index = allNotifications.indexOfFirst { it.id == id }
        if (index >= 0) {
            allNotifications[index] = allNotifications[index].copy(isRead = true)
            applyFilter()
        }
    }

    fun markAllAsRead() {
        allNotifications.forEachIndexed { i, item ->
            allNotifications[i] = item.copy(isRead = true)
        }
        applyFilter()
    }

    fun deleteNotification(id: Long) {
        allNotifications.removeAll { it.id == id }
        applyFilter()
    }

    fun onNotificationClick(item: NotificationItem) {
        // Mark as read and navigate
        markAsRead(item.id)
    }

    private fun applyFilter() {
        val filter = _uiState.value.selectedFilter
        val filtered = when (filter) {
            NotificationFilter.ALL -> allNotifications.toList()
            else -> allNotifications.filter { it.type == filter.type }
        }

        val unread = allNotifications.count { !it.isRead }
        _uiState.value = _uiState.value.copy(
            notifications = filtered,
            isLoading = false,
            unreadCount = unread
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsCenterScreen(
    onBack: () -> Unit,
    onNavigateToAction: (String) -> Unit,
    viewModel: NotificationsCenterViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = { Text("通知中心") },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                        }
                    },
                    actions = {
                        if (state.unreadCount > 0) {
                            TextButton(onClick = viewModel::markAllAsRead) {
                                Text("全部已读")
                            }
                        }
                    }
                )

                TabRow(selectedTabIndex = NotificationFilter.entries.indexOf(state.selectedFilter)) {
                    NotificationFilter.entries.forEach { filter ->
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
            }
        }
    ) { padding ->
        if (state.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else if (state.notifications.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(32.dp)
                ) {
                    Icon(
                        Icons.Default.NotificationsNone,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "暂无通知",
                        style = MaterialTheme.typography.titleMedium
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(vertical = 8.dp)
            ) {
                items(
                    items = state.notifications,
                    key = { it.id }
                ) { notification ->
                    NotificationCard(
                        notification = notification,
                        onClick = {
                            viewModel.onNotificationClick(notification)
                            notification.actionUrl?.let { onNavigateToAction(it) }
                        },
                        onDelete = { viewModel.deleteNotification(notification.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun NotificationCard(
    notification: NotificationItem,
    onClick: () -> Unit,
    onDelete: () -> Unit
) {
    val typeIcon = when (notification.type) {
        "task" -> Icons.Default.TaskAlt
        "alert" -> Icons.Default.Warning
        "update" -> Icons.Default.SystemUpdate
        "system" -> Icons.Default.Info
        else -> Icons.Default.CircleNotifications
    }

    val typeColor = when (notification.type) {
        "task" -> Success
        "alert" -> Error
        "update" -> MaterialTheme.colorScheme.primary
        "system" -> MaterialTheme.colorScheme.secondary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) {
                onDelete()
                true
            } else false
        }
    )

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Default.Delete,
                    contentDescription = "删除",
                    tint = Error
                )
            }
        },
        enableDismissFromStartToEnd = false
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick),
            colors = CardDefaults.cardColors(
                containerColor = if (notification.isRead)
                    MaterialTheme.colorScheme.surface
                else
                    MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.15f)
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalAlignment = Alignment.Top
            ) {
                // Type icon
                Surface(
                    modifier = Modifier.size(36.dp),
                    shape = MaterialTheme.shapes.small,
                    color = typeColor.copy(alpha = 0.1f)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            typeIcon,
                            contentDescription = null,
                            tint = typeColor,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = notification.title,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = if (!notification.isRead) FontWeight.SemiBold else FontWeight.Normal,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            text = formatTimestamp(notification.timestamp),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    Text(
                        text = notification.body,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )

                    if (!notification.isRead) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Surface(
                                modifier = Modifier.size(8.dp),
                                shape = MaterialTheme.shapes.extraSmall,
                                color = MaterialTheme.colorScheme.primary
                            ) {}
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "未读",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun formatTimestamp(timestamp: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - timestamp
    return when {
        diff < 60_000 -> "刚刚"
        diff < 3_600_000 -> "${diff / 60_000}分钟前"
        diff < 86_400_000 -> "${diff / 3_600_000}小时前"
        diff < 604_800_000 -> "${diff / 86_400_000}天前"
        else -> {
            val sdf = java.text.SimpleDateFormat("MM-dd", java.util.Locale.getDefault())
            sdf.format(java.util.Date(timestamp))
        }
    }
}
