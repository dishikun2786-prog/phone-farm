package com.phonefarm.client.ui.screens

import androidx.compose.animation.*
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

data class PluginInfo(
    val id: String,
    val name: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val version: String,
    val sizeBytes: Long,
    val status: PluginStatus,
    val progress: Float = 0f // 0f..1f for download/install progress
)

enum class PluginStatus {
    INSTALLED, DOWNLOADING, WAITING, FAILED
}

data class PluginSetupUiState(
    val plugins: List<PluginInfo> = listOf(
        PluginInfo("p1", "DeekeScript", Icons.Default.Android, "12.4.0", 24_500_000, PluginStatus.INSTALLED),
        PluginInfo("p2", "PhoneFarm Bridge", Icons.Default.Cable, "1.2.0", 1_200_000, PluginStatus.WAITING),
        PluginInfo("p3", "scrcpy Relay", Icons.Default.SmartDisplay, "2.7", 3_800_000, PluginStatus.WAITING),
        PluginInfo("p4", "Headscale VPN", Icons.Default.VpnKey, "1.72.0", 18_200_000, PluginStatus.WAITING),
        PluginInfo("p5", "VLM Support", Icons.Default.AutoAwesome, "0.5.0", 45_000_000, PluginStatus.WAITING)
    ),
    val allInstalled: Boolean = false,
    val overallProgress: Float = 0f
)

@HiltViewModel
class PluginSetupViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(PluginSetupUiState())
    val uiState: StateFlow<PluginSetupUiState> = _uiState.asStateFlow()

    fun startInstallation() {
        viewModelScope.launch {
            val currentPlugins = _uiState.value.plugins.toMutableList()

            for (i in currentPlugins.indices) {
                if (currentPlugins[i].status == PluginStatus.INSTALLED) continue

                // Start downloading
                currentPlugins[i] = currentPlugins[i].copy(
                    status = PluginStatus.DOWNLOADING,
                    progress = 0f
                )
                _uiState.value = _uiState.value.copy(plugins = currentPlugins)

                // Simulate download progress
                for (p in 1..10) {
                    delay(200)
                    currentPlugins[i] = currentPlugins[i].copy(progress = p / 10f)
                    _uiState.value = _uiState.value.copy(plugins = currentPlugins)
                }

                // Simulate installation
                currentPlugins[i] = currentPlugins[i].copy(
                    status = PluginStatus.INSTALLED,
                    progress = 1f
                )
                _uiState.value = _uiState.value.copy(plugins = currentPlugins)
            }

            // Check all installed
            val allDone = currentPlugins.all { it.status == PluginStatus.INSTALLED }
            _uiState.value = _uiState.value.copy(
                allInstalled = allDone,
                overallProgress = if (allDone) 1f else
                    currentPlugins.count { it.status == PluginStatus.INSTALLED } / currentPlugins.size.toFloat()
            )
        }
    }

    fun updateOverallProgress() {
        val allDone = _uiState.value.plugins.all { it.status == PluginStatus.INSTALLED }
        _uiState.value = _uiState.value.copy(allInstalled = allDone)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PluginSetupScreen(
    onSkip: () -> Unit,
    viewModel: PluginSetupViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.startInstallation()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("插件安装") }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Overall progress
            if (state.overallProgress < 1f) {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "整体安装进度",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "${(state.overallProgress * 100).toInt()}%",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    LinearProgressIndicator(
                        progress = { state.overallProgress },
                        modifier = Modifier.fillMaxWidth(),
                        color = MaterialTheme.colorScheme.primary,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                }
            }

            // Plugin list
            LazyColumn(
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(state.plugins) { plugin ->
                    PluginProgressCard(plugin = plugin)
                }

                item {
                    Spacer(modifier = Modifier.height(16.dp))
                }
            }

            // Bottom area
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shadowElevation = 8.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onSkip,
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp),
                        shape = MaterialTheme.shapes.medium
                    ) {
                        Text("跳过，进入主页")
                    }

                    if (state.allInstalled) {
                        Button(
                            onClick = onSkip,
                            modifier = Modifier
                                .weight(1f)
                                .height(48.dp),
                            shape = MaterialTheme.shapes.medium
                        ) {
                            Text("进入主页")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PluginProgressCard(plugin: PluginInfo) {
    val statusColor = when (plugin.status) {
        PluginStatus.INSTALLED -> Success
        PluginStatus.DOWNLOADING -> MaterialTheme.colorScheme.primary
        PluginStatus.WAITING -> MaterialTheme.colorScheme.onSurfaceVariant
        PluginStatus.FAILED -> Error
    }

    val statusText = when (plugin.status) {
        PluginStatus.INSTALLED -> "已安装"
        PluginStatus.DOWNLOADING -> "下载中 ${(plugin.progress * 100).toInt()}%"
        PluginStatus.WAITING -> "等待中"
        PluginStatus.FAILED -> "失败"
    }

    Card(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    modifier = Modifier.size(40.dp),
                    shape = MaterialTheme.shapes.small,
                    color = statusColor.copy(alpha = 0.1f)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (plugin.status == PluginStatus.INSTALLED) {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = statusColor,
                                modifier = Modifier.size(24.dp)
                            )
                        } else {
                            Icon(
                                plugin.icon,
                                contentDescription = null,
                                tint = statusColor,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = plugin.name,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "v${plugin.version} | ${formatFileSize(plugin.sizeBytes)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Surface(
                    shape = MaterialTheme.shapes.small,
                    color = statusColor.copy(alpha = 0.1f)
                ) {
                    Text(
                        text = statusText,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = statusColor,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            // Progress bar for downloading
            if (plugin.status == PluginStatus.DOWNLOADING) {
                Spacer(modifier = Modifier.height(10.dp))
                LinearProgressIndicator(
                    progress = { plugin.progress },
                    modifier = Modifier.fillMaxWidth(),
                    color = statusColor,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )
            }
        }
    }
}

private fun formatFileSize(bytes: Long): String {
    val mb = bytes / 1_000_000f
    return if (mb >= 1000) "%.1f GB".format(mb / 1000) else "%.1f MB".format(mb)
}
