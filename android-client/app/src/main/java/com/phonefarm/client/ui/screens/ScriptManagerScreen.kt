package com.phonefarm.client.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phonefarm.client.ui.theme.Success
import com.phonefarm.client.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ScriptItem(
    val id: String,
    val name: String,
    val platform: String,
    val version: String,
    val sizeBytes: Long,
    val hasUpdate: Boolean = false,
    val isSelected: Boolean = false
)

data class ScriptManagerUiState(
    val isLoading: Boolean = true,
    val scripts: List<ScriptItem> = emptyList(),
    val selectedPlatform: String = "全部",
    val searchQuery: String = "",
    val sortMode: SortMode = SortMode.NAME,
    val isBatchMode: Boolean = false,
    val selectedCount: Int = 0
)

enum class SortMode { NAME, PLATFORM, SIZE, VERSION }

@HiltViewModel
class ScriptManagerViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(ScriptManagerUiState())
    val uiState: StateFlow<ScriptManagerUiState> = _uiState.asStateFlow()

    private val allScripts = mutableListOf<ScriptItem>()

    init {
        loadScripts()
    }

    fun loadScripts() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            delay(600)

            // TODO: Load from ScriptFileDao
            allScripts.clear()
            allScripts.addAll(listOf(
                ScriptItem("s1", "task_dy_toker.js", "抖音", "2.4.1", 45_200),
                ScriptItem("s2", "task_dy_toker_city.js", "抖音", "1.8.0", 38_100),
                ScriptItem("s3", "task_dy_search_user.js", "抖音", "2.1.0", 32_500, hasUpdate = true),
                ScriptItem("s4", "task_ks_toker.js", "快手", "3.0.1", 52_300),
                ScriptItem("s5", "task_ks_search_user.js", "快手", "2.5.0", 41_800),
                ScriptItem("s6", "task_wx_toker.js", "微信", "1.9.2", 28_600),
                ScriptItem("s7", "task_xhs_toker.js", "小红书", "2.2.0", 35_700),
                ScriptItem("s8", "task_xhs_fans.js", "小红书", "1.6.1", 29_100)
            ))

            applyFilters()
        }
    }

    fun selectPlatform(platform: String) {
        _uiState.value = _uiState.value.copy(selectedPlatform = platform)
        applyFilters()
    }

    fun updateSearchQuery(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
        applyFilters()
    }

    fun setSortMode(mode: SortMode) {
        _uiState.value = _uiState.value.copy(sortMode = mode)
        applyFilters()
    }

    fun toggleBatchMode() {
        val current = _uiState.value
        if (current.isBatchMode) {
            // Exit batch mode
            allScripts.forEachIndexed { i, item ->
                allScripts[i] = item.copy(isSelected = false)
            }
            _uiState.value = current.copy(isBatchMode = false, selectedCount = 0)
            applyFilters()
        } else {
            _uiState.value = current.copy(isBatchMode = true)
        }
    }

    fun toggleScriptSelected(id: String) {
        val index = allScripts.indexOfFirst { it.id == id }
        if (index >= 0) {
            allScripts[index] = allScripts[index].copy(isSelected = !allScripts[index].isSelected)
            _uiState.value = _uiState.value.copy(selectedCount = allScripts.count { it.isSelected })
            applyFilters()
        }
    }

    fun selectAll() {
        _uiState.value.scripts.forEach { script ->
            val idx = allScripts.indexOfFirst { it.id == script.id }
            if (idx >= 0) allScripts[idx] = allScripts[idx].copy(isSelected = true)
        }
        _uiState.value = _uiState.value.copy(selectedCount = allScripts.count { it.isSelected })
        applyFilters()
    }

    fun clearSelection() {
        allScripts.forEachIndexed { i, _ -> allScripts[i] = allScripts[i].copy(isSelected = false) }
        _uiState.value = _uiState.value.copy(isBatchMode = false, selectedCount = 0)
        applyFilters()
    }

    private fun applyFilters() {
        val state = _uiState.value
        var filtered = allScripts.toList()

        // Platform filter
        if (state.selectedPlatform != "全部") {
            filtered = filtered.filter { it.platform == state.selectedPlatform }
        }

        // Search
        if (state.searchQuery.isNotBlank()) {
            filtered = filtered.filter {
                it.name.contains(state.searchQuery, ignoreCase = true)
            }
        }

        // Sort
        filtered = when (state.sortMode) {
            SortMode.NAME -> filtered.sortedBy { it.name }
            SortMode.PLATFORM -> filtered.sortedBy { it.platform }
            SortMode.SIZE -> filtered.sortedBy { it.sizeBytes }
            SortMode.VERSION -> filtered.sortedBy { it.version }
        }

        _uiState.value = state.copy(scripts = filtered, isLoading = false)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScriptManagerScreen(
    onBack: () -> Unit,
    onExecuteScript: (String) -> Unit,
    viewModel: ScriptManagerViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()
    var showSortDropdown by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("脚本管理") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "返回")
                    }
                },
                actions = {
                    if (state.isBatchMode) {
                        TextButton(onClick = viewModel::selectAll) {
                            Text("全选")
                        }
                    }
                    IconButton(onClick = viewModel::toggleBatchMode) {
                        Icon(
                            if (state.isBatchMode) Icons.Default.Close else Icons.Default.Checklist,
                            contentDescription = if (state.isBatchMode) "退出选择" else "批量选择"
                        )
                    }
                }
            )
        },
        bottomBar = {
            AnimatedVisibility(
                visible = state.isBatchMode && state.selectedCount > 0,
                enter = slideInVertically(initialOffsetY = { it }),
                exit = slideOutVertically(targetOffsetY = { it })
            ) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shadowElevation = 8.dp,
                    color = MaterialTheme.colorScheme.surface
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "已选 ${state.selectedCount} 项",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { /* Batch delete */ }) {
                                Text("删除")
                            }
                            Button(onClick = { /* Batch execute */ }) {
                                Text("批量执行")
                            }
                        }
                    }
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Platform filter chips
            val platforms = listOf("全部", "抖音", "快手", "微信", "小红书")
            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(platforms.size) { index ->
                    val platform = platforms[index]
                    FilterChip(
                        selected = state.selectedPlatform == platform,
                        onClick = { viewModel.selectPlatform(platform) },
                        label = { Text(platform) }
                    )
                }
            }

            // Search and sort row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = state.searchQuery,
                    onValueChange = viewModel::updateSearchQuery,
                    placeholder = { Text("搜索脚本...") },
                    leadingIcon = {
                        Icon(Icons.Default.Search, contentDescription = null)
                    },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )

                Box {
                    IconButton(onClick = { showSortDropdown = true }) {
                        Icon(Icons.Default.Sort, contentDescription = "排序")
                    }
                    DropdownMenu(
                        expanded = showSortDropdown,
                        onDismissRequest = { showSortDropdown = false }
                    ) {
                        SortMode.entries.forEach { mode ->
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        text = when (mode) {
                                            SortMode.NAME -> "按名称"
                                            SortMode.PLATFORM -> "按平台"
                                            SortMode.SIZE -> "按大小"
                                            SortMode.VERSION -> "按版本"
                                        }
                                    )
                                },
                                onClick = {
                                    viewModel.setSortMode(mode)
                                    showSortDropdown = false
                                },
                                leadingIcon = {
                                    if (state.sortMode == mode) {
                                        Icon(Icons.Default.Check, contentDescription = null)
                                    }
                                }
                            )
                        }
                    }
                }
            }

            // Script list
            if (state.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else if (state.scripts.isEmpty()) {
                EmptyScriptState(
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                PullToRefreshBox(
                    isRefreshing = state.isLoading,
                    onRefresh = { viewModel.loadScripts() },
                    modifier = Modifier.fillMaxSize()
                ) {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(state.scripts) { script ->
                            ScriptListItem(
                                script = script,
                                isBatchMode = state.isBatchMode,
                                onToggleSelect = { viewModel.toggleScriptSelected(script.id) },
                                onExecute = { onExecuteScript(script.id) },
                                onClick = {
                                    if (state.isBatchMode) {
                                        viewModel.toggleScriptSelected(script.id)
                                    }
                                }
                            )
                        }

                        item { Spacer(modifier = Modifier.height(80.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyScriptState(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp)
        ) {
            Icon(
                Icons.Default.Code,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "暂无脚本",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "请先同步脚本或从 VLM 编译生成",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = { /* TODO: sync */ }) {
                Text("同步脚本")
            }
        }
    }
}

@Composable
private fun ScriptListItem(
    script: ScriptItem,
    isBatchMode: Boolean,
    onToggleSelect: () -> Unit,
    onExecute: () -> Unit,
    onClick: () -> Unit
) {
    val platformColor = when (script.platform) {
        "抖音" -> androidx.compose.ui.graphics.Color(0xFF000000)
        "快手" -> Warning
        "微信" -> Success
        "小红书" -> androidx.compose.ui.graphics.Color(0xFFFF2442)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isBatchMode) {
                Checkbox(
                    checked = script.isSelected,
                    onCheckedChange = { onToggleSelect() }
                )
                Spacer(modifier = Modifier.width(4.dp))
            }

            Surface(
                modifier = Modifier.size(40.dp),
                shape = MaterialTheme.shapes.small,
                color = platformColor.copy(alpha = 0.1f)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = script.platform.take(1),
                        style = MaterialTheme.typography.labelLarge,
                        color = platformColor,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = script.name,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    if (script.hasUpdate) {
                        Spacer(modifier = Modifier.width(6.dp))
                        Surface(
                            shape = MaterialTheme.shapes.small,
                            color = Warning.copy(alpha = 0.15f)
                        ) {
                            Text(
                                text = "更新",
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall,
                                color = Warning
                            )
                        }
                    }
                }
                Text(
                    text = "v${script.version} | ${formatSize(script.sizeBytes)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            Surface(
                shape = MaterialTheme.shapes.small,
                color = platformColor.copy(alpha = 0.1f)
            ) {
                Text(
                    text = script.platform,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = platformColor
                )
            }

            if (!isBatchMode) {
                Spacer(modifier = Modifier.width(8.dp))
                IconButton(onClick = onExecute) {
                    Icon(
                        Icons.Default.PlayArrow,
                        contentDescription = "执行",
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}

private fun formatSize(bytes: Long): String {
    val kb = bytes / 1000f
    return if (kb >= 1000) "%.1f MB".format(kb / 1000) else "%.1f KB".format(kb)
}
