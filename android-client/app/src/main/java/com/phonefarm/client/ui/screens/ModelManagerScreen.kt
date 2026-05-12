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

enum class InferenceMode(val label: String) {
    LOCAL("本地"), CLOUD("云端"), AUTO("自动")
}

data class ModelItem(
    val modelId: String,
    val displayName: String,
    val version: String,
    val quantization: String?,
    val fileSizeBytes: Long,
    val minRamMb: Int,
    val status: String, // not_downloaded, downloading, ready, loaded, error
    val downloadedBytes: Long = 0,
    val backend: String?
)

data class DeviceCapability(
    val totalRamMb: Int = 8192,
    val availableRamMb: Int = 4200,
    val hasGpu: Boolean = true,
    val hasNpu: Boolean = false,
    val hasVulkan: Boolean = true,
    val totalStorageGb: Int = 128,
    val usedStorageGb: Int = 45
)

data class ModelManagerUiState(
    val inferenceMode: InferenceMode = InferenceMode.AUTO,
    val activeModel: String = "AutoGLM-Phone-9B",
    val activeModelMetrics: String = "响应: 320ms | 内存: 1.2GB",
    val deviceCapability: DeviceCapability = DeviceCapability(),
    val installedModels: List<ModelItem> = emptyList(),
    val availableModels: List<ModelItem> = emptyList(),
    val isLoading: Boolean = true
)

@HiltViewModel
class ModelManagerViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(ModelManagerUiState())
    val uiState: StateFlow<ModelManagerUiState> = _uiState.asStateFlow()

    init {
        loadData()
    }

    fun loadData() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            delay(500)

            // TODO: Load from ModelRegistryDao
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                installedModels = listOf(
                    ModelItem("m1", "AutoGLM-Phone-9B", "v2.1", "q4_K_M", 4_800_000_000L, 6000, "loaded", 4_800_000_000L, "vulkan"),
                    ModelItem("m2", "Qwen3-VL-2B", "v1.0", "q4_0", 1_200_000_000L, 2000, "ready", 1_200_000_000L, "cpu")
                ),
                availableModels = listOf(
                    ModelItem("m3", "UI-TARS-7B", "v1.3", "q4_K_M", 3_800_000_000L, 5000, "not_downloaded", 0, null),
                    ModelItem("m4", "GUI-Owl", "v0.8", "q5_K_M", 2_500_000_000L, 3500, "not_downloaded", 0, null),
                    ModelItem("m5", "Qwen3-VL-8B", "v2.0", "q8_0", 8_500_000_000L, 8000, "not_downloaded", 0, null)
                )
            )
        }
    }

    fun setInferenceMode(mode: InferenceMode) {
        _uiState.value = _uiState.value.copy(inferenceMode = mode)
    }

    fun loadModel(modelId: String) {
        viewModelScope.launch {
            // TODO: Load model via MLC/MNN backend
            _uiState.value = _uiState.value.copy(
                activeModel = modelId
            )
        }
    }

    fun unloadModel(modelId: String) {
        viewModelScope.launch {
            // TODO: Unload model from memory
        }
    }

    fun deleteModel(modelId: String) {
        viewModelScope.launch {
            // TODO: Delete model files
        }
    }

    fun downloadModel(modelId: String) {
        viewModelScope.launch {
            // TODO: Download model via artifact manager
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModelManagerScreen(
    onBack: () -> Unit,
    viewModel: ModelManagerViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("模型管理") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                }
            )
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
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Inference mode selector
                item {
                    Text(
                        text = "推理模式",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        InferenceMode.entries.forEach { mode ->
                            FilterChip(
                                selected = state.inferenceMode == mode,
                                onClick = { viewModel.setInferenceMode(mode) },
                                label = { Text(mode.label) },
                                leadingIcon = {
                                    Icon(
                                        when (mode) {
                                            InferenceMode.LOCAL -> Icons.Default.PhoneAndroid
                                            InferenceMode.CLOUD -> Icons.Default.Cloud
                                            InferenceMode.AUTO -> Icons.Default.Tune
                                        },
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            )
                        }
                    }
                }

                // Current active model
                item {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                        )
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.Tungsten,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "当前活跃模型",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = state.activeModel,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = state.activeModelMetrics,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                // Device capability panel
                item {
                    DeviceCapabilityPanel(capability = state.deviceCapability)
                }

                // Installed models
                item {
                    Text(
                        text = "已安装模型",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                items(state.installedModels) { model ->
                    ModelCard(
                        model = model,
                        onLoad = { viewModel.loadModel(model.modelId) },
                        onUnload = { viewModel.unloadModel(model.modelId) },
                        onDelete = { viewModel.deleteModel(model.modelId) },
                        isActive = model.modelId == state.activeModel
                    )
                }

                // Available models
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "可下载模型",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                items(state.availableModels) { model ->
                    ModelCard(
                        model = model,
                        onDownload = { viewModel.downloadModel(model.modelId) }
                    )
                }

                item { Spacer(modifier = Modifier.height(80.dp)) }
            }
        }
    }
}

@Composable
private fun DeviceCapabilityPanel(capability: DeviceCapability) {
    Card {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "设备能力",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CapabilityChip(
                    label = "RAM",
                    value = "${capability.availableRamMb}MB / ${capability.totalRamMb}MB",
                    modifier = Modifier.weight(1f)
                )
                CapabilityChip(
                    label = "GPU",
                    value = if (capability.hasGpu) "可用" else "不可用",
                    isAvailable = capability.hasGpu,
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CapabilityChip(
                    label = "NPU",
                    value = if (capability.hasNpu) "可用" else "不可用",
                    isAvailable = capability.hasNpu,
                    modifier = Modifier.weight(1f)
                )
                CapabilityChip(
                    label = "Vulkan",
                    value = if (capability.hasVulkan) "支持" else "不支持",
                    isAvailable = capability.hasVulkan,
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CapabilityChip(
                    label = "存储",
                    value = "${capability.usedStorageGb}GB / ${capability.totalStorageGb}GB",
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun CapabilityChip(
    label: String,
    value: String,
    isAvailable: Boolean = true,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = if (isAvailable) Success.copy(alpha = 0.1f) else Error.copy(alpha = 0.1f)
    ) {
        Column(
            modifier = Modifier.padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = value,
                style = MaterialTheme.typography.labelMedium,
                color = if (isAvailable) Success else Error,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
private fun ModelCard(
    model: ModelItem,
    onLoad: (() -> Unit)? = null,
    onUnload: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null,
    onDownload: (() -> Unit)? = null,
    isActive: Boolean = false
) {
    val statusColor = when (model.status) {
        "loaded" -> Success
        "ready" -> MaterialTheme.colorScheme.primary
        "downloading" -> Warning
        "error" -> Error
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        border = if (isActive) androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
        else null
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = model.displayName,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium
                    )
                    if (isActive) {
                        Spacer(modifier = Modifier.width(8.dp))
                        Surface(
                            shape = MaterialTheme.shapes.small,
                            color = Success.copy(alpha = 0.15f)
                        ) {
                            Text(
                                text = "活跃",
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall,
                                color = Success
                            )
                        }
                    }
                }
                Text(
                    text = "v${model.version} | ${model.quantization ?: "N/A"} | ${formatBytes(model.fileSizeBytes)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (model.minRamMb > 0) {
                    Text(
                        text = "最低内存: ${model.minRamMb}MB",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                // Download progress
                if (model.status == "downloading" && model.fileSizeBytes > 0) {
                    Spacer(modifier = Modifier.height(4.dp))
                    LinearProgressIndicator(
                        progress = { model.downloadedBytes.toFloat() / model.fileSizeBytes },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Actions
            when {
                onDownload != null && model.status == "not_downloaded" -> {
                    Button(
                        onClick = onDownload,
                        shape = MaterialTheme.shapes.small,
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                    ) {
                        Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("下载", style = MaterialTheme.typography.labelMedium)
                    }
                }
                onLoad != null && model.status == "ready" -> {
                    Button(
                        onClick = onLoad,
                        shape = MaterialTheme.shapes.small,
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                    ) {
                        Text("加载", style = MaterialTheme.typography.labelMedium)
                    }
                }
                onUnload != null && model.status == "loaded" -> {
                    OutlinedButton(
                        onClick = onUnload,
                        shape = MaterialTheme.shapes.small,
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                    ) {
                        Text("卸载", style = MaterialTheme.typography.labelMedium)
                    }
                }
                onDelete != null -> {
                    IconButton(onClick = onDelete) {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = "删除",
                            tint = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        }
    }
}

private fun formatBytes(bytes: Long): String {
    val gb = bytes / 1_000_000_000f
    return if (gb >= 1) "%.1f GB".format(gb) else "%.0f MB".format(bytes / 1_000_000f)
}
