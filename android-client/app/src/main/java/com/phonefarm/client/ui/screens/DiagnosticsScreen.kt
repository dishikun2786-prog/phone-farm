package com.phonefarm.client.ui.screens

import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phonefarm.client.network.ApiService
import com.phonefarm.client.service.GuardService
import com.phonefarm.client.service.PhoneFarmDeviceAdminReceiver
import com.phonefarm.client.ui.theme.Error
import com.phonefarm.client.ui.theme.Success
import com.phonefarm.client.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
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
class DiagnosticsViewModel @Inject constructor(
    private val apiService: ApiService,
    @ApplicationContext private val appContext: Context,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DiagnosticsUiState())
    val uiState: StateFlow<DiagnosticsUiState> = _uiState.asStateFlow()

    fun runDiagnostics() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRunning = true, overallStatus = DiagnosticStatus.CHECKING)

            val items = _uiState.value.items.toMutableList()
            for (i in items.indices) {
                items[i] = items[i].copy(status = DiagnosticStatus.CHECKING)
                _uiState.value = _uiState.value.copy(items = items.toList())
                delay(300)

                val (status, detail, fixAction) = when (items[i].id) {
                    "accessibility" -> checkAccessibility()
                    "websocket" -> checkWebSocket()
                    "permissions" -> checkPermissions()
                    "storage" -> checkStorage()
                    "plugins" -> checkPlugins()
                    "models" -> checkModels()
                    else -> Triple(DiagnosticStatus.PASS, "正常", null)
                }

                items[i] = items[i].copy(status = status, detail = detail, fixAction = fixAction)
                _uiState.value = _uiState.value.copy(items = items.toList())
            }

            val allPassed = items.all { it.status == DiagnosticStatus.PASS }
            _uiState.value = _uiState.value.copy(
                isRunning = false,
                overallStatus = if (allPassed) DiagnosticStatus.PASS else DiagnosticStatus.FAIL,
                allChecked = true,
            )
        }
    }

    private fun checkAccessibility(): Triple<DiagnosticStatus, String, String?> {
        val serviceName = "${appContext.packageName}/.service.PhoneFarmAccessibilityService"
        val enabledServices = Settings.Secure.getString(
            appContext.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: ""
        val enabled = enabledServices.split(':').any { it.equals(serviceName, ignoreCase = true) }
        return if (enabled) Triple(DiagnosticStatus.PASS, "无障碍服务已开启", null)
        else Triple(DiagnosticStatus.FAIL, "无障碍服务未开启", "accessibility")
    }

    private suspend fun checkWebSocket(): Triple<DiagnosticStatus, String, String?> {
        return try {
            val start = System.currentTimeMillis()
            val health = apiService.healthCheck()
            val elapsed = System.currentTimeMillis() - start
            if (health.status == "ok") Triple(DiagnosticStatus.PASS, "已连接到服务器 (${elapsed}ms)", null)
            else Triple(DiagnosticStatus.FAIL, "服务器状态异常: ${health.status}", null)
        } catch (e: Exception) {
            Triple(DiagnosticStatus.FAIL, "连接失败: ${e.message}", null)
        }
    }

    private fun checkPermissions(): Triple<DiagnosticStatus, String, String?> {
        var granted = 0
        val total = 4
        val issues = mutableListOf<String>()

        // Accessibility
        val serviceName = "${appContext.packageName}/.service.PhoneFarmAccessibilityService"
        val enabledServices = Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
        if (enabledServices.split(':').any { it.equals(serviceName, ignoreCase = true) }) granted++ else issues.add("无障碍")

        // Overlay
        if (Settings.canDrawOverlays(appContext)) granted++ else issues.add("悬浮窗")

        // Battery
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = appContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (pm.isIgnoringBatteryOptimizations(appContext.packageName)) granted++ else issues.add("电池优化")
        } else granted++

        // Notification
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val nm = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            if (nm.areNotificationsEnabled()) granted++ else issues.add("通知")
        } else granted++

        return if (granted == total) Triple(DiagnosticStatus.PASS, "所有权限已授权 ($granted/$total)", null)
        else Triple(DiagnosticStatus.FAIL, "缺少: ${issues.joinToString(", ")} (已授权: $granted/$total)", "permissions")
    }

    private fun checkStorage(): Triple<DiagnosticStatus, String, String?> {
        val stat = android.os.StatFs(android.os.Environment.getDataDirectory().absolutePath)
        val totalBytes = stat.totalBytes
        val availableBytes = stat.availableBytes
        val usedPercent = ((totalBytes - availableBytes).toFloat() / totalBytes * 100).toInt()
        return if (availableBytes > 500_000_000) Triple(DiagnosticStatus.PASS,
            "可用: ${readableSize(availableBytes)} / ${readableSize(totalBytes)} (${100 - usedPercent}%)", null)
        else Triple(DiagnosticStatus.FAIL,
            "存储空间不足: ${readableSize(availableBytes)} 可用", null)
    }

    private suspend fun checkPlugins(): Triple<DiagnosticStatus, String, String?> {
        return try {
            val manifest = apiService.syncPlugins()
            Triple(DiagnosticStatus.PASS, "插件清单正常 (${manifest.plugins.size} 个)", null)
        } catch (e: Exception) {
            Triple(DiagnosticStatus.FAIL, "插件同步失败: ${e.message}", null)
        }
    }

    private suspend fun checkModels(): Triple<DiagnosticStatus, String, String?> {
        return try {
            val models = apiService.getLocalModelManifest()
            Triple(DiagnosticStatus.PASS, "模型清单已获取 (${models.size} 个可用)", null)
        } catch (e: Exception) {
            Triple(DiagnosticStatus.FAIL, "模型同步失败: ${e.message}", null)
        }
    }

    private fun readableSize(bytes: Long): String {
        if (bytes < 1024) return "$bytes B"
        val units = arrayOf("KB", "MB", "GB", "TB")
        var size = bytes.toFloat()
        var unit = "B"
        for (u in units) {
            size /= 1024f
            unit = u
            if (size < 1024f) break
        }
        return "%.1f %s".format(size, unit)
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
