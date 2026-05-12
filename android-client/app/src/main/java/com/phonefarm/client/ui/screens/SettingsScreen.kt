package com.phonefarm.client.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phonefarm.client.ui.components.*
import com.phonefarm.client.ui.theme.AccentColor
import com.phonefarm.client.ui.theme.Error
import com.phonefarm.client.ui.theme.Success
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SettingsUiState(
    val serverUrl: String = "https://your-server:8443",
    val serverStatus: String = "已连接",
    val serverLatency: Long = 42,
    val deviceName: String = "Pixel 7 Pro",
    val heartbeatInterval: Int = 30,
    val screenshotQuality: Int = 80,
    val vlmMode: String = "cloud",
    val vlmModel: String = "AutoGLM-Phone-9B",
    val accent: AccentColor = AccentColor.OCEAN_BLUE,
    val darkMode: ThemeMode = ThemeMode.SYSTEM,
    val glassEnabled: Boolean = true,
    val fontScale: Float = 1.0f,
    val installedModels: List<String> = listOf("Qwen3-VL-2B-q4", "AutoGLM-Phone-9B"),
    val storageUsed: Long = 3_200_000_000,
    val storageTotal: Long = 16_000_000_000,
    val installedPlugins: List<String> = listOf("PluginEngine 1.0", "scrcpy 2.7"),
    val lastSyncTime: String = "2026-05-12 14:30",
    val appVersion: String = "1.0.0",
    val showDeleteDialog: Boolean = false,
    val showDeregisterDialog: Boolean = false,
)

enum class ThemeMode(val label: String) { LIGHT("浅色"), DARK("深色"), SYSTEM("跟随系统") }

@HiltViewModel
class SettingsViewModel @Inject constructor() : ViewModel() {
    private val _ui = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _ui.asStateFlow()

    fun updateServerUrl(url: String) { _ui.value = _ui.value.copy(serverUrl = url) }
    fun setThemeMode(mode: ThemeMode) { _ui.value = _ui.value.copy(darkMode = mode) }
    fun setVlmMode(mode: String) { _ui.value = _ui.value.copy(vlmMode = mode) }
    fun setAccent(accent: AccentColor) { _ui.value = _ui.value.copy(accent = accent) }
    fun toggleGlass() { _ui.value = _ui.value.copy(glassEnabled = !_ui.value.glassEnabled) }
    fun setFontScale(scale: Float) { _ui.value = _ui.value.copy(fontScale = scale) }

    fun testConnection() {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(serverStatus = "检查中...")
            delay(1000)
            _ui.value = _ui.value.copy(serverStatus = "已连接", serverLatency = (30..80).random().toLong())
        }
    }

    fun reconnect() {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(serverStatus = "重连中...")
            delay(1500)
            _ui.value = _ui.value.copy(serverStatus = "已连接")
        }
    }

    fun manualSync() {
        viewModelScope.launch {
            _ui.value = _ui.value.copy(lastSyncTime = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.getDefault()).format(java.util.Date()))
        }
    }

    fun showDeleteDialog(v: Boolean) { _ui.value = _ui.value.copy(showDeleteDialog = v) }
    fun showDeregisterDialog(v: Boolean) { _ui.value = _ui.value.copy(showDeregisterDialog = v) }
    fun deleteAllData() { viewModelScope.launch { _ui.value = _ui.value.copy(showDeleteDialog = false) } }
}

@Composable
fun SettingsScreen(
    onBack: (() -> Unit)? = null,
    onNavigateToModelManager: () -> Unit = {},
    onNavigateToPrivacyPolicy: () -> Unit = {},
    onNavigateToDiagnostics: () -> Unit = {},
    onNavigateToNotifications: () -> Unit = {},
    onNavigateToDataUsage: () -> Unit = {},
    onNavigateToHelp: () -> Unit = {},
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val s by viewModel.uiState.collectAsState()

    // Dialogs
    if (s.showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { viewModel.showDeleteDialog(false) },
            icon = { Icon(Icons.Default.DeleteForever, null, tint = Error) },
            title = { Text("删除我的数据") },
            text = { Text("此操作将删除所有本地缓存、任务日志、脚本和数据，且不可恢复。") },
            confirmButton = { TextButton(onClick = viewModel::deleteAllData) { Text("确定删除", color = Error) } },
            dismissButton = { TextButton(onClick = { viewModel.showDeleteDialog(false) }) { Text("取消") } },
        )
    }

    if (s.showDeregisterDialog) {
        AlertDialog(
            onDismissRequest = { viewModel.showDeregisterDialog(false) },
            icon = { Icon(Icons.Default.ExitToApp, null, tint = Error) },
            title = { Text("注销设备") },
            text = { Text("注销后将从管理平台移除本设备，所有配置将被清除。") },
            confirmButton = { TextButton(onClick = { viewModel.showDeregisterDialog(false) }) { Text("确定注销", color = Error) } },
            dismissButton = { TextButton(onClick = { viewModel.showDeregisterDialog(false) }) { Text("取消") } },
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 80.dp),
    ) {
        Spacer(Modifier.height(8.dp))

        // Server connection
        ConnectionHealthBanner(
            serverUrl = s.serverUrl,
            status = s.serverStatus,
            latency = s.serverLatency,
            version = s.appVersion,
            onTestConnection = viewModel::testConnection,
            onReconnect = viewModel::reconnect,
        )

        // VLM
        SettingsGroupCard(title = "VLM 推理引擎") {
            SettingsRow(label = "推理模式", value = s.vlmMode)
            SettingsRow(label = "当前模型", value = s.vlmModel, onClick = onNavigateToModelManager)
        }

        // Appearance
        SettingsGroupCard(title = "外观") {
            SettingsRow(label = "主题") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ThemeMode.entries.forEach { mode ->
                        FilterChip(
                            selected = s.darkMode == mode,
                            onClick = { viewModel.setThemeMode(mode) },
                            label = { Text(mode.label, style = MaterialTheme.typography.labelSmall) },
                        )
                    }
                }
            }
            AccentPicker(currentAccent = s.accent, onAccentSelected = viewModel::setAccent)
            SettingsRow(label = "液态玻璃效果") {
                Switch(checked = s.glassEnabled, onCheckedChange = { viewModel.toggleGlass() })
            }
            SettingsRow(label = "字体大小", value = "%.0f%%".format(s.fontScale * 100))
            Slider(
                value = s.fontScale,
                onValueChange = viewModel::setFontScale,
                modifier = Modifier.padding(horizontal = 16.dp),
                valueRange = 0.8f..1.4f,
                steps = 5,
            )
        }

        // Plugins
        SettingsGroupCard(title = "插件管理") {
            s.installedPlugins.forEach { plugin ->
                SettingsRow(label = plugin, value = "✓")
            }
            SettingsRow(label = "安装新插件", onClick = { /* PluginSetup */ })
        }

        // Storage
        SettingsGroupCard(title = "存储") {
            StorageBar(usedBytes = s.storageUsed, totalBytes = s.storageTotal)
            SettingsRow(label = "已安装模型", value = "${s.installedModels.size} 个")
            SettingsRow(label = "上次同步", value = s.lastSyncTime)
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(onClick = viewModel::manualSync, modifier = Modifier.weight(1f)) { Text("手动同步") }
                OutlinedButton(onClick = onNavigateToDataUsage, modifier = Modifier.weight(1f)) { Text("流量统计") }
            }
        }

        // About
        SettingsGroupCard(title = "关于") {
            SettingsRow(label = "版本", value = "v${s.appVersion}")
            SettingsRow(label = "诊断", onClick = onNavigateToDiagnostics)
            SettingsRow(label = "通知", onClick = onNavigateToNotifications)
            SettingsRow(label = "隐私政策", onClick = onNavigateToPrivacyPolicy)
            SettingsRow(label = "帮助 FAQ", onClick = onNavigateToHelp)
        }

        // Danger zone
        Spacer(Modifier.height(16.dp))
        Text(
            "数据管理",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = Error,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        Spacer(Modifier.height(8.dp))

        OutlinedButton(
            onClick = { viewModel.showDeleteDialog(true) },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Error),
        ) { Icon(Icons.Default.Delete, null); Spacer(Modifier.width(8.dp)); Text("删除我的数据") }
        Spacer(Modifier.height(8.dp))

        OutlinedButton(
            onClick = { viewModel.showDeregisterDialog(true) },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Error),
        ) { Icon(Icons.Default.ExitToApp, null); Spacer(Modifier.width(8.dp)); Text("注销设备") }
        Spacer(Modifier.height(32.dp))
    }
}
