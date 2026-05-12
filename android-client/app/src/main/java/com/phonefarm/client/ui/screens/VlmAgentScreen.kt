package com.phonefarm.client.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.phonefarm.client.ui.components.*
import com.phonefarm.client.ui.theme.Error
import com.phonefarm.client.ui.theme.Success
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChatMessage(
    val id: String,
    val role: String,
    val content: String,
    val type: String = "text",
    val actionStatus: ActionStatus? = null,
)

data class VlmAgentUiState(
    val taskInput: String = "",
    val selectedModel: String = "AutoGLM-Phone-9B",
    val availableModels: List<String> = listOf("AutoGLM-Phone-9B", "Qwen3-VL-8B", "UI-TARS-7B", "GUI-Owl"),
    val quickTemplates: List<String> = listOf(
        "浏览抖音推荐页，点赞并评论前5条视频",
        "在微信视频号搜索'科技'，关注前3个账号并私信",
        "打开小红书搜索'美食'，浏览并收藏相关笔记",
    ),
    val isExecuting: Boolean = false,
    val isRecording: Boolean = false,
    val showModelDropdown: Boolean = false,
    val currentStep: Int = 0,
    val totalSteps: Int = 0,
    val currentThinking: String = "",
    val currentAction: String = "",
    val messages: List<ChatMessage> = emptyList(),
    val isThinkingExpanded: Boolean = true,
    val elapsedMs: Long = 0,
    val steps: List<StepInfo> = emptyList(),
)

data class StepInfo(
    val stepNumber: Int,
    val action: String,
    val status: ActionStatus,
    val durationMs: Long,
)

@HiltViewModel
class VlmAgentViewModel @Inject constructor() : ViewModel() {
    private val _uiState = MutableStateFlow(VlmAgentUiState())
    val uiState: StateFlow<VlmAgentUiState> = _uiState.asStateFlow()

    init {
        _uiState.value = _uiState.value.copy(
            messages = listOf(
                ChatMessage(
                    id = "welcome",
                    role = "ai",
                    content = "你好！我是 VLM Agent。请告诉我你想执行的自动化任务，我会一步步完成。",
                    type = "text",
                ),
            ),
        )
    }

    fun updateTaskInput(input: String) { _uiState.value = _uiState.value.copy(taskInput = input) }

    fun selectModel(model: String) { _uiState.value = _uiState.value.copy(selectedModel = model, showModelDropdown = false) }

    fun toggleModelDropdown() { _uiState.value = _uiState.value.copy(showModelDropdown = !_uiState.value.showModelDropdown) }

    fun selectTemplate(template: String) { _uiState.value = _uiState.value.copy(taskInput = template) }

    fun toggleThinkingExpanded() { _uiState.value = _uiState.value.copy(isThinkingExpanded = !_uiState.value.isThinkingExpanded) }

    fun executeTask() {
        viewModelScope.launch {
            val s = _uiState.value
            if (s.taskInput.isBlank()) return@launch

            val userMsg = ChatMessage("msg_${System.currentTimeMillis()}", "user", s.taskInput, "text")
            _uiState.value = s.copy(
                isExecuting = true, isRecording = true,
                currentStep = 1, totalSteps = 5, elapsedMs = 0,
                messages = s.messages + userMsg,
                taskInput = "",
            )

            // Simulate VLM execution with conversation-style steps
            val thinkingSteps = listOf(
                "分析当前屏幕截图...\n识别到抖音推荐页，包含6个视频卡片，布局为2列3行",
                "规划动作：点击第1个视频卡片（位于屏幕上部）\n坐标估算：(540, 800)\n执行 Click(540, 800)",
                "等待视频加载完成...\n分析评论区布局\n识别到点赞按钮位于右下角",
                "执行点赞操作\n识别到评论输入框，计算评论内容坐标",
                "任务完成\n总计互动：点赞3次，评论2次，关注1个账号",
            )
            val actions = listOf(
                "Screenshot → Analyze → Recognize 6 video cards",
                "Click(540, 800) → Video opens",
                "Screenshot → Identify like button at (980, 1820)",
                "Click(980, 1820) → InputText(540, 2100, \"太棒了\") → Click(1000, 2100)",
                "Swipe(540,1800→540,800) → TaskComplete",
            )

            for (i in thinkingSteps.indices) {
                delay(2000)
                val thinking = thinkingSteps[i]
                val action = actions[i]
                val isLast = i == thinkingSteps.size - 1

                val thinkingMsg = ChatMessage("think_${i}_${System.currentTimeMillis()}", "ai", thinking, "thinking")
                val actionMsg = ChatMessage(
                    "act_${i}_${System.currentTimeMillis()}", "ai", action, "action",
                    actionStatus = if (isLast) ActionStatus.EXECUTED else ActionStatus.EXECUTED,
                )

                val currentMsgs = _uiState.value.messages
                _uiState.value = _uiState.value.copy(
                    currentStep = i + 1, totalSteps = thinkingSteps.size,
                    currentThinking = thinking, currentAction = action,
                    elapsedMs = (i + 1) * 2000L,
                    messages = currentMsgs + thinkingMsg + actionMsg,
                    steps = _uiState.value.steps + StepInfo(i + 1, action, ActionStatus.EXECUTED, 2000),
                )
            }

            val doneMsg = ChatMessage("done_${System.currentTimeMillis()}", "system", "任务完成！可保存生成的脚本以便复用。", "save_prompt")
            _uiState.value = _uiState.value.copy(
                isExecuting = false, isRecording = false,
                messages = _uiState.value.messages + doneMsg,
            )
        }
    }

    fun stopExecution() {
        val stopMsg = ChatMessage("stop_${System.currentTimeMillis()}", "system", "执行已停止", "text")
        _uiState.value = _uiState.value.copy(
            isExecuting = false, isRecording = false,
            messages = _uiState.value.messages + stopMsg,
        )
    }
}

@Composable
fun VlmAgentScreen(
    onBack: () -> Unit = {},
    onStopAndCompile: () -> Unit = {},
    onNavigateToEpisode: (String) -> Unit = {},
    viewModel: VlmAgentViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()

    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) {
            listState.animateScrollToItem(state.messages.size - 1)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Model selector bar
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
            tonalElevation = 1.dp,
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "返回")
                }

                Box {
                    FilterChip(
                        selected = false,
                        onClick = viewModel::toggleModelDropdown,
                        label = { Text(state.selectedModel) },
                        leadingIcon = {
                            Icon(Icons.Default.Tungsten, contentDescription = null, modifier = Modifier.size(16.dp))
                        },
                    )
                    DropdownMenu(
                        expanded = state.showModelDropdown,
                        onDismissRequest = { viewModel.toggleModelDropdown() },
                    ) {
                        state.availableModels.forEach { model ->
                            DropdownMenuItem(
                                text = { Text(model) },
                                onClick = { viewModel.selectModel(model) },
                                leadingIcon = {
                                    if (model == state.selectedModel)
                                        Icon(Icons.Default.Check, contentDescription = null)
                                },
                            )
                        }
                    }
                }

                if (state.isRecording) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(Modifier.size(8.dp), RoundedCornerShape(4.dp), color = androidx.compose.ui.graphics.Color.Red) {}
                        Spacer(Modifier.width(6.dp))
                        Text("录制中", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                    }
                } else {
                    Spacer(Modifier.width(40.dp))
                }
            }
        }

        // Chat messages
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            state = listState,
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        ) {
            items(state.messages, key = { it.id }) { msg ->
                when (msg.type) {
                    "thinking" -> ThinkingBlock(
                        thinking = msg.content,
                        isExpanded = state.isThinkingExpanded,
                        onToggle = viewModel::toggleThinkingExpanded,
                    )
                    "action" -> ActionCard(
                        action = msg.content,
                        status = msg.actionStatus ?: ActionStatus.EXECUTED,
                    )
                    else -> ChatBubble(
                        role = msg.role,
                        content = msg.content,
                    )
                }
            }

            // Progress during execution
            if (state.isExecuting) {
                item {
                    LinearProgressIndicator(
                        progress = { if (state.totalSteps > 0) state.currentStep.toFloat() / state.totalSteps else 0f },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            "步骤 ${state.currentStep}/${state.totalSteps}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            formatElapsed(state.elapsedMs),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        // Screenshot preview
        if (state.isExecuting) {
            ScreenshotPreview(
                modifier = Modifier.padding(horizontal = 16.dp),
            )
            Spacer(Modifier.height(8.dp))
        }

        // Input or control buttons
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
            shadowElevation = 4.dp,
        ) {
            if (!state.isExecuting) {
                Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                    // Quick templates
                    LazyColumn {
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                state.quickTemplates.forEach { template ->
                                    SuggestionChip(
                                        onClick = { viewModel.selectTemplate(template) },
                                        label = {
                                            Text(template, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                                        },
                                    )
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                        }
                    }

                    ChatInputBar(
                        value = state.taskInput,
                        onValueChange = viewModel::updateTaskInput,
                        onSend = viewModel::executeTask,
                        enabled = true,
                    )
                }
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    OutlinedButton(
                        onClick = viewModel::stopExecution,
                        modifier = Modifier.weight(1f).height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Error),
                    ) {
                        Icon(Icons.Default.Stop, contentDescription = null)
                        Spacer(Modifier.width(4.dp))
                        Text("停止")
                    }
                    Button(
                        onClick = onStopAndCompile,
                        modifier = Modifier.weight(1f).height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Icon(Icons.Default.Build, contentDescription = null)
                        Spacer(Modifier.width(4.dp))
                        Text("停止并编译")
                    }
                }
            }
        }
    }
}

private fun formatElapsed(ms: Long): String {
    val s = ms / 1000
    val m = s / 60
    return if (m > 0) "${m}m${s % 60}s" else "${s}s"
}
