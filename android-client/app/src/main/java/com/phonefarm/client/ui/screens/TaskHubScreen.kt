package com.phonefarm.client.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.phonefarm.client.ui.components.PlatformTabRow
import com.phonefarm.client.ui.components.defaultPlatformTabs
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

data class TaskTemplate(
    val id: String,
    val name: String,
    val platform: String,
    val description: String,
    val category: String,
    val isActive: Boolean,
)

data class TaskHubUiState(
    val templates: List<TaskTemplate> = emptyList(),
    val selectedPlatform: String = "all",
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
)

@HiltViewModel
class TaskHubViewModel @Inject constructor() : ViewModel() {
    private val _uiState = MutableStateFlow(TaskHubUiState())
    val uiState: StateFlow<TaskHubUiState> = _uiState.asStateFlow()

    init { loadTemplates() }

    fun selectPlatform(key: String) {
        _uiState.value = _uiState.value.copy(selectedPlatform = key)
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true)
            delay(500)
            loadTemplates()
            _uiState.value = _uiState.value.copy(isRefreshing = false)
        }
    }

    private fun loadTemplates() {
        _uiState.value = _uiState.value.copy(
            isLoading = false,
            templates = listOf(
                TaskTemplate("t1", "抖音推荐营销", "douyin", "浏览推荐页，点赞、评论、关注视频作者", "互动", true),
                TaskTemplate("t2", "抖音同城营销", "douyin", "浏览同城推荐页，互动同城视频", "互动", true),
                TaskTemplate("t3", "抖音评论区互动", "douyin", "搜索指定关键词，在相关视频评论区互动", "评论", false),
                TaskTemplate("t4", "抖音搜索用户", "douyin", "搜索用户并关注、私信、点赞作品", "搜索", true),
                TaskTemplate("t5", "抖音直播间弹幕", "douyin", "进入直播间发送弹幕互动", "直播", false),
                TaskTemplate("t6", "抖音涨粉操作", "douyin", "一系列操作提升账号活跃度和粉丝数", "涨粉", true),
                TaskTemplate("t7", "快手推荐营销", "kuaishou", "浏览快手推荐页，互动视频内容", "互动", true),
                TaskTemplate("t8", "快手搜索用户", "kuaishou", "搜索用户互动（关注、点赞、评论）", "搜索", true),
                TaskTemplate("t9", "微信视频号推荐", "wechat", "浏览视频号推荐内容并互动", "互动", true),
                TaskTemplate("t10", "微信视频号搜索", "wechat", "搜索视频号内容并私信、关注", "搜索", false),
                TaskTemplate("t11", "小红书推荐营销", "xiaohongshu", "浏览推荐笔记，点赞、收藏、评论", "互动", true),
                TaskTemplate("t12", "小红书涨粉", "xiaohongshu", "系列操作提升小红书账号权重和粉丝", "涨粉", true),
                TaskTemplate("t13", "小红书养号", "xiaohongshu", "模拟正常用户行为养号提权", "养号", false),
                TaskTemplate("t14", "抖音AI智能回复", "douyin", "AI智能生成并发送评论回复", "AI", true),
                TaskTemplate("t15", "小红书AI智能回复", "xiaohongshu", "AI智能生成并发送回复", "AI", false),
            ),
        )
    }
}

@Composable
fun TaskHubScreen(
    onExecuteTemplate: (String) -> Unit = {},
    onEditTemplate: (String) -> Unit = {},
    onNavigateToVlmAgent: () -> Unit = {},
    onNavigateToScriptManager: () -> Unit = {},
    onNavigateToTaskLog: () -> Unit = {},
    viewModel: TaskHubViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    val filteredTemplates = remember(state.templates, state.selectedPlatform) {
        if (state.selectedPlatform == "all") state.templates
        else state.templates.filter { it.platform == state.selectedPlatform }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Platform filter tabs
        PlatformTabRow(
            selectedTab = state.selectedPlatform,
            onTabSelected = viewModel::selectPlatform,
        )

        // Quick action row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AssistChip(
                onClick = onNavigateToVlmAgent,
                label = { Text("VLM Agent") },
                leadingIcon = { Icon(Icons.Default.Tungsten, contentDescription = null, modifier = Modifier.size(18.dp)) },
            )
            AssistChip(
                onClick = onNavigateToScriptManager,
                label = { Text("脚本管理") },
                leadingIcon = { Icon(Icons.Default.Folder, contentDescription = null, modifier = Modifier.size(18.dp)) },
            )
            AssistChip(
                onClick = onNavigateToTaskLog,
                label = { Text("任务日志") },
                leadingIcon = { Icon(Icons.Default.History, contentDescription = null, modifier = Modifier.size(18.dp)) },
            )
        }

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item {
                    Text(
                        text = "任务模板 (${filteredTemplates.size})",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                }

                items(filteredTemplates) { template ->
                    TemplateCard(
                        template = template,
                        onExecute = { onExecuteTemplate(template.id) },
                        onEdit = { onEditTemplate(template.id) },
                    )
                }

                item { Spacer(modifier = Modifier.height(80.dp)) }
            }
        }
    }
}

@Composable
private fun TemplateCard(
    template: TaskTemplate,
    onExecute: () -> Unit,
    onEdit: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = template.name,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = MaterialTheme.colorScheme.primaryContainer,
                    ) {
                        Text(
                            text = template.category,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = template.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                FilledTonalButton(
                    onClick = onExecute,
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    Text("执行", style = MaterialTheme.typography.labelMedium)
                }
                Spacer(modifier = Modifier.height(4.dp))
                TextButton(onClick = onEdit) {
                    Text("编辑", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}
