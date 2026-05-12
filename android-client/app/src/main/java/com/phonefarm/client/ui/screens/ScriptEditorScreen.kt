package com.phonefarm.client.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

data class ScriptEditorUiState(
    val scriptName: String = "untitled.js",
    val codeContent: String = "",
    val originalContent: String = "",
    val isModified: Boolean = false,
    val isTestRunning: Boolean = false,
    val testLogs: List<String> = emptyList(),
    val cursorLine: Int = 1,
    val cursorColumn: Int = 1,
    val showSearchBar: Boolean = false,
    val searchQuery: String = "",
    val undoStack: List<String> = emptyList(),
    val redoStack: List<String> = emptyList()
)

@HiltViewModel
class ScriptEditorViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(ScriptEditorUiState())
    val uiState: StateFlow<ScriptEditorUiState> = _uiState.asStateFlow()

    fun initialize(scriptId: String) {
        viewModelScope.launch {
            delay(300)

            // TODO: Load from SavedScriptDao
            val sampleCode = """
// PhoneFarm Automation Script
// Generated: 2026-05-11
// Platform: 抖音

function main() {
    log("Starting task...");

    // Open app
    app.launch("com.ss.android.ugc.aweme");
    sleep(3000);

    // Wait for main page
    waitForElement(text("推荐"), 5000);

    // Browse 5 videos
    for (let i = 0; i < 5; i++) {
        log("Watching video " + (i + 1));
        sleep(5000);

        // Like the video
        click(480, 1850);
        sleep(500);

        // Swipe to next
        swipe(540, 1600, 540, 400, 500);
        sleep(1000);
    }

    log("Task completed!");
}
            """.trimIndent()

            _uiState.value = _uiState.value.copy(
                codeContent = sampleCode,
                originalContent = sampleCode
            )
        }
    }

    fun updateCode(code: String) {
        val current = _uiState.value
        val isModified = code != current.originalContent
        val newUndoStack = current.undoStack + current.codeContent
        val newRedoStack = if (isModified) current.redoStack else emptyList()

        _uiState.value = current.copy(
            codeContent = code,
            isModified = isModified,
            undoStack = newUndoStack.takeLast(50),
            redoStack = newRedoStack
        )
    }

    fun undo() {
        val current = _uiState.value
        if (current.undoStack.isNotEmpty()) {
            val prevContent = current.undoStack.last()
            _uiState.value = current.copy(
                codeContent = prevContent,
                undoStack = current.undoStack.dropLast(1),
                redoStack = current.redoStack + current.codeContent,
                isModified = prevContent != current.originalContent
            )
        }
    }

    fun redo() {
        val current = _uiState.value
        if (current.redoStack.isNotEmpty()) {
            val nextContent = current.redoStack.last()
            _uiState.value = current.copy(
                codeContent = nextContent,
                redoStack = current.redoStack.dropLast(1),
                undoStack = current.undoStack + current.codeContent,
                isModified = nextContent != current.originalContent
            )
        }
    }

    fun toggleSearch() {
        _uiState.value = _uiState.value.copy(showSearchBar = !_uiState.value.showSearchBar)
    }

    fun updateSearchQuery(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
    }

    fun save() {
        viewModelScope.launch {
            // TODO: Save to repository
            _uiState.value = _uiState.value.copy(
                originalContent = _uiState.value.codeContent,
                isModified = false
            )
        }
    }

    fun testRun() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isTestRunning = true,
                testLogs = emptyList()
            )

            // Simulate test execution
            val logLines = listOf(
                "[INFO] 初始化运行环境...",
                "[INFO] 加载脚本: ${_uiState.value.scriptName}",
                "[INFO] 检查无障碍服务状态... OK",
                "[INFO] 连接到目标应用...",
                "[INFO] 执行步骤 1: launch app",
                "[WARN] 应用启动耗时: 3200ms",
                "[INFO] 执行步骤 2: 浏览推荐页",
                "[INFO] 点赞第1个视频",
                "[INFO] 滑动到下一个...",
                "[INFO] 执行完成: 共5步, 耗时28s",
                "[INFO] 任务成功完成"
            )

            for (line in logLines) {
                delay(400)
                _uiState.value = _uiState.value.copy(
                    testLogs = _uiState.value.testLogs + line
                )
            }

            _uiState.value = _uiState.value.copy(isTestRunning = false)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScriptEditorScreen(
    scriptId: String,
    onBack: () -> Unit,
    viewModel: ScriptEditorViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(scriptId) {
        viewModel.initialize(scriptId)
    }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(state.scriptName)
                            if (state.isModified) {
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "●",
                                    color = Warning,
                                    fontSize = 10.sp
                                )
                            }
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                        }
                    },
                    actions = {
                        IconButton(onClick = viewModel::undo) {
                            Icon(Icons.Default.Undo, contentDescription = "撤销")
                        }
                        IconButton(onClick = viewModel::redo) {
                            Icon(Icons.Default.Redo, contentDescription = "重做")
                        }
                        IconButton(onClick = viewModel::toggleSearch) {
                            Icon(Icons.Default.Search, contentDescription = "搜索")
                        }
                    }
                )

                // Toolbar
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TextButton(
                            onClick = viewModel::save,
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                        ) {
                            Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("保存", style = MaterialTheme.typography.labelMedium)
                        }

                        TextButton(
                            onClick = viewModel::testRun,
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                            enabled = !state.isTestRunning
                        ) {
                            Icon(
                                if (state.isTestRunning) Icons.Default.HourglassTop else Icons.Default.PlayArrow,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                if (state.isTestRunning) "运行中..." else "测试运行",
                                style = MaterialTheme.typography.labelMedium
                            )
                        }
                    }
                }

                // Search bar
                AnimatedVisibility(visible = state.showSearchBar) {
                    OutlinedTextField(
                        value = state.searchQuery,
                        onValueChange = viewModel::updateSearchQuery,
                        placeholder = { Text("搜索代码...") },
                        leadingIcon = {
                            Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        singleLine = true,
                        textStyle = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    ) { padding ->
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Line numbers
            CodeLineNumbers(
                lines = state.codeContent.lines().size,
                modifier = Modifier
                    .width(40.dp)
                    .fillMaxHeight()
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
            )

            // Code editor area
            Column(modifier = Modifier.weight(1f)) {
                // Code input area - takes half the screen
                OutlinedTextField(
                    value = state.codeContent,
                    onValueChange = viewModel::updateCode,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    textStyle = MaterialTheme.typography.bodySmall.copy(
                        fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp,
                        lineHeight = 20.sp
                    ),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color.Transparent,
                        unfocusedBorderColor = Color.Transparent
                    )
                )

                HorizontalDivider()

                // Log output panel
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(0.5f)
                        .background(MaterialTheme.colorScheme.surface)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "输出日志",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Medium
                        )
                        if (state.isTestRunning) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(12.dp),
                                    strokeWidth = 1.5.dp
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "运行中",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Warning
                                )
                            }
                        }
                    }

                    if (state.testLogs.isEmpty()) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "点击 [测试运行] 查看输出",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(8.dp)
                        ) {
                            items(state.testLogs) { log ->
                                val logColor = when {
                                    log.contains("[ERROR]") -> Error
                                    log.contains("[WARN]") -> Warning
                                    log.contains("成功") || log.contains("OK") -> Success
                                    else -> MaterialTheme.colorScheme.onSurface
                                }
                                Text(
                                    text = log,
                                    style = MaterialTheme.typography.bodySmall.copy(
                                        fontFamily = FontFamily.Monospace,
                                        fontSize = 11.sp
                                    ),
                                    color = logColor,
                                    modifier = Modifier.padding(vertical = 1.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CodeLineNumbers(
    lines: Int,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier.padding(vertical = 16.dp),
        horizontalAlignment = Alignment.End
    ) {
        items(minOf(lines, 1000)) { index ->
            Text(
                text = "${index + 1}",
                style = MaterialTheme.typography.bodySmall.copy(
                    fontFamily = FontFamily.Monospace,
                    fontSize = 13.sp,
                    lineHeight = 20.sp
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.padding(end = 8.dp)
            )
        }
    }
}
