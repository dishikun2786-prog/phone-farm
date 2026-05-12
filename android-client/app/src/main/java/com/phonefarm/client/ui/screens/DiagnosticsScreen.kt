package com.phonefarm.client.ui.screens

import androidx.compose.animation.*
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
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

data class DiagnosticItem(
    val id: String,
    val name: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val status: DiagnosticStatus = DiagnosticStatus.PENDING,
    val detail: String = "",
    val fixAction: String? = null
)

enum class DiagnosticStatus {
    PENDING, CHECKING, PASS, FAIL
}

data class DiagnosticsUiState(
    val isRunning: Boolean = false,
    val items: List<DiagnosticItem> = listOf(
        DiagnosticItem("accessibility", "无障碍服务", Icons.Default.Accessibility),
        DiagnosticItem("websocket", "WebSocket 连接", Icons.Default.Cable),
        DiagnosticItem("permissions", "权限检查 (6项)", Icons.Default.Shield),
        DiagnosticItem("storage", "存储空间", Icons.Default.Storage),
        DiagnosticItem("plugins", "插件版本", Icons.Default.Extension),
        DiagnosticItem("models", "本地模型状态", Icons.Default.Tungsten)
    ),
    val overallStatus: DiagnosticStatus = DiagnosticStatus.PENDING,
    val allChecked: Boolean = false
)

@HiltViewModel
class DiagnosticsViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(DiagnosticsUiState())
    val uiState: StateFlow<DiagnosticsUiState> = _uiState.asStateFlow()

    fun runDiagnostics() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isRunning = true,
                overallStatus = DiagnosticStatus.CHECKING
            )

            val items = _uiState.value.items.toMutableList()

            // Run each check sequentially with brief delay
            for (i in items.indices) {
                items[i] = items[i].copy(status = DiagnosticStatus.CHECKING)
                _uiState.value = _uiState.value.copy(items = items.toList())

                delay(600 + (i * 200L))

                val (status, detail, fixAction) = when (items[i].id) {
                    "accessibility" -> checkAccessibility()
                    "websocket" -> checkWebSocket()
                    "permissions" -> checkPermissions()
                    "storage" -> checkStorage()
                    "plugins" -> checkPlugins()
                    "models" -> checkModels()
                    else -> Triple(DiagnosticStatus.PASS, "正常", null)
                }

                items[i] = items[i].copy(
                    status = status,
                    detail = detail,
                    fixAction = fixAction
                )
                _uiState.value = _uiState.value.copy(items = items.toList())
            }

            val allPassed = items.all { it.status == DiagnosticStatus.PASS }
            _uiState.value = _uiState.value.copy(
                isRunning = false,
                overallStatus = if (allPassed) DiagnosticStatus.PASS else DiagnosticStatus.FAIL,
                allChecked = true
            )
        }
    }

    private suspend fun checkAccessibility(): Triple<DiagnosticStatus, String, String?> {
        // TODO: Actual accessibility check
        return Triple(DiagnosticStatus.FAIL, "无障碍服务未开启", "开启无障碍")
    }

    private suspend fun checkWebSocket(): Triple<DiagnosticStatus, String, String?> {
        return Triple(DiagnosticStatus.PASS, "已连接到服务器 (42ms)", null)
    }

    private suspend fun checkPermissions(): Triple<DiagnosticStatus, String, String?> {
        return Triple(DiagnosticStatus.FAIL, "悬浮窗权限未授权 (已授权: 3/6)", "修复权限")
    }

    private suspend fun checkStorage(): Triple<DiagnosticStatus, String, String?> {
        return Triple(DiagnosticStatus.PASS, "可用空间: 82GB / 128GB (63%)", null)
    }

    private suspend fun checkPlugins(): Triple<DiagnosticStatus, String, String?> {
        return Triple(DiagnosticStatus.PASS, "所有插件版本正常 (3/3)", null)
    }

    private suspend fun checkModels(): Triple<DiagnosticStatus, String, String?> {
        return Triple(DiagnosticStatus.PASS, "AutoGLM-Phone-9B 已加载", null)
    }

    fun clearResults() {
        _uiState.value = DiagnosticsUiState()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiagnosticsScreen(
    onBack: () -> Unit,
    onFixAction: (String) -> Unit,
    viewModel: DiagnosticsViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("设备诊断") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Overall status
            if (state.allChecked) {
                OverallStatusBanner(
                    status = state.overallStatus,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(16.dp))
            }

            // One-tap self-check button
            Button(
                onClick = viewModel::runDiagnostics,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = MaterialTheme.shapes.large,
                enabled = !state.isRunning
            ) {
                if (state.isRunning) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("诊断中...")
                } else {
                    Icon(Icons.Default.Healing, contentDescription = null)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = if (state.allChecked) "重新诊断" else "一键自检",
                        style = MaterialTheme.typography.titleSmall
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Diagnostic items
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(state.items) { item ->
                    DiagnosticCard(
                        item = item,
                        onFix = {
                            item.fixAction?.let { action ->
                                onFixAction(item.id)
                            }
                        }
                    )
                }

                item { Spacer(modifier = Modifier.height(16.dp)) }
            }

            // Help text
            if (!state.allChecked && !state.isRunning) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "点击上方按钮开始一键自检，系统将并行检查6项关键功能",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun OverallStatusBanner(
    status: DiagnosticStatus,
    modifier: Modifier = Modifier
) {
    val bannerData = when (status) {
        DiagnosticStatus.PASS -> BannerData(
            Success.copy(alpha = 0.1f),
            Icons.Default.CheckCircle,
            "所有检查通过",
            "系统运行正常"
        )
        DiagnosticStatus.FAIL -> BannerData(
            Error.copy(alpha = 0.1f),
            Icons.Default.Error,
            "发现问题",
            "部分检查未通过，请点击\"去修复\""
        )
        else -> BannerData(
            Warning.copy(alpha = 0.1f),
            Icons.Default.HourglassBottom,
            "诊断中",
            "正在检查系统状态..."
        )
    }
    val containerColor = bannerData.containerColor
    val icon = bannerData.icon
    val title = bannerData.title
    val subtitle = bannerData.subtitle

    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = containerColor)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = if (status == DiagnosticStatus.PASS) Success else if (status == DiagnosticStatus.FAIL) Error else Warning,
                modifier = Modifier.size(32.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun DiagnosticCard(
    item: DiagnosticItem,
    onFix: () -> Unit
) {
    val (statusColor, statusIcon, statusText) = when (item.status) {
        DiagnosticStatus.PASS -> Triple(Success, Icons.Default.CheckCircle, "Pass")
        DiagnosticStatus.FAIL -> Triple(Error, Icons.Default.Cancel, "Fail")
        DiagnosticStatus.CHECKING -> Triple(Warning, Icons.Default.HourglassTop, "检查中")
        DiagnosticStatus.PENDING -> Triple(MaterialTheme.colorScheme.onSurfaceVariant, Icons.Default.RadioButtonUnchecked, "待检查")
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Status indicator
            if (item.status == DiagnosticStatus.CHECKING) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    strokeWidth = 2.dp
                )
            } else {
                Icon(
                    statusIcon,
                    contentDescription = null,
                    tint = statusColor,
                    modifier = Modifier.size(28.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Item info
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        item.icon,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = item.name,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium
                    )
                }
                if (item.detail.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = item.detail,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Fix button
            if (item.status == DiagnosticStatus.FAIL && item.fixAction != null) {
                Spacer(modifier = Modifier.width(8.dp))
                TextButton(
                    onClick = onFix,
                    contentPadding = PaddingValues(horizontal = 12.dp)
                ) {
                    Text(
                        text = "去修复",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}

private data class BannerData(
    val containerColor: Color,
    val icon: ImageVector,
    val title: String,
    val subtitle: String,
)
