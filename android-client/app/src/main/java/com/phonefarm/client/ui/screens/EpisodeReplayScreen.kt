package com.phonefarm.client.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
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

data class EpisodeStep(
    val stepNumber: Int,
    val actionType: String,
    val coordinates: String,
    val uiSelector: String,
    val stabilityScore: Float,
    val screenshotPath: String?
)

data class EpisodeReplayUiState(
    val episodeId: String = "",
    val title: String = "",
    val currentStepIndex: Int = 0,
    val totalSteps: Int = 0,
    val playbackSpeed: Float = 1f,
    val isPlaying: Boolean = false,
    val steps: List<EpisodeStep> = emptyList(),
    val codePreview: String = "",
    val showCodeExpanded: Boolean = false
)

@HiltViewModel
class EpisodeReplayViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(EpisodeReplayUiState())
    val uiState: StateFlow<EpisodeReplayUiState> = _uiState.asStateFlow()

    fun initialize(episodeId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(episodeId = episodeId)

            // TODO: Load episode from EpisodeDao
            delay(300)
            _uiState.value = _uiState.value.copy(
                title = "抖音推荐页浏览任务",
                totalSteps = 8,
                steps = listOf(
                    EpisodeStep(1, "Click", "(540, 800)", "id=video_card_1", 0.95f, null),
                    EpisodeStep(2, "Swipe", "(540, 1600)->(540, 400)", "className=RecyclerView", 0.85f, null),
                    EpisodeStep(3, "Click", "(480, 1850)", "id=like_button", 0.92f, null),
                    EpisodeStep(4, "Sleep", "2000", "N/A", 1f, null),
                    EpisodeStep(5, "Click", "(540, 1900)", "id=comment_input", 0.88f, null),
                    EpisodeStep(6, "Input", "\"太棒了\"", "id=comment_edit", 0.90f, null),
                    EpisodeStep(7, "Click", "(540, 1950)", "id=send_button", 0.93f, null),
                    EpisodeStep(8, "Swipe", "(540, 1600)->(540, 400)", "className=RecyclerView", 0.85f, null)
                ),
                codePreview = """
// Auto-generated script
function main() {
    click(540, 800);
    sleep(1000);
    swipe(540, 1600, 540, 400, 500);
    sleep(500);
    click(480, 1850);
    sleep(2000);
}
                """.trimIndent()
            )
        }
    }

    fun previousStep() {
        val current = _uiState.value
        if (current.currentStepIndex > 0) {
            _uiState.value = current.copy(currentStepIndex = current.currentStepIndex - 1)
        }
    }

    fun nextStep() {
        val current = _uiState.value
        if (current.currentStepIndex < current.totalSteps - 1) {
            _uiState.value = current.copy(currentStepIndex = current.currentStepIndex + 1)
        }
    }

    fun goToFirstStep() {
        _uiState.value = _uiState.value.copy(currentStepIndex = 0)
    }

    fun goToLastStep() {
        _uiState.value = _uiState.value.copy(currentStepIndex = maxOf(0, _uiState.value.totalSteps - 1))
    }

    fun togglePlay() {
        viewModelScope.launch {
            val state = _uiState.value
            _uiState.value = state.copy(isPlaying = !state.isPlaying)

            if (!state.isPlaying) {
                // Start auto-play
                while (_uiState.value.isPlaying && _uiState.value.currentStepIndex < _uiState.value.totalSteps - 1) {
                    delay((1000 / _uiState.value.playbackSpeed).toLong())
                    nextStep()
                }
                if (_uiState.value.currentStepIndex >= _uiState.value.totalSteps - 1) {
                    _uiState.value = _uiState.value.copy(isPlaying = false)
                }
            }
        }
    }

    fun setSpeed(speed: Float) {
        _uiState.value = _uiState.value.copy(playbackSpeed = speed)
    }

    fun toggleCodeExpanded() {
        _uiState.value = _uiState.value.copy(showCodeExpanded = !_uiState.value.showCodeExpanded)
    }

    fun compile() { /* TODO */ }
    fun export() { /* TODO */ }
    fun share() { /* TODO */ }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EpisodeReplayScreen(
    episodeId: String,
    onBack: () -> Unit,
    onCompile: () -> Unit,
    viewModel: EpisodeReplayViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(episodeId) {
        viewModel.initialize(episodeId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Episode 回放",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = state.title,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        },
        bottomBar = {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shadowElevation = 8.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = onCompile,
                        modifier = Modifier.weight(1f),
                        shape = MaterialTheme.shapes.small
                    ) {
                        Text("编译")
                    }
                    OutlinedButton(
                        onClick = viewModel::export,
                        modifier = Modifier.weight(1f),
                        shape = MaterialTheme.shapes.small
                    ) {
                        Text("导出")
                    }
                    OutlinedButton(
                        onClick = viewModel::share,
                        modifier = Modifier.weight(1f),
                        shape = MaterialTheme.shapes.small
                    ) {
                        Text("分享")
                    }
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
        ) {
            // Screenshot viewer area (240x400dp)
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(240.dp)
                    .padding(16.dp),
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surfaceVariant,
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.Smartphone,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "步骤 ${state.currentStepIndex + 1}/${state.totalSteps}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Playback controls
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = viewModel::goToFirstStep) {
                    Icon(Icons.Default.SkipPrevious, contentDescription = "第一步")
                }
                Spacer(modifier = Modifier.width(8.dp))
                IconButton(onClick = viewModel::previousStep) {
                    Icon(Icons.Default.FastRewind, contentDescription = "上一步")
                }
                Spacer(modifier = Modifier.width(16.dp))
                FilledIconButton(
                    onClick = viewModel::togglePlay,
                    modifier = Modifier.size(56.dp)
                ) {
                    Icon(
                        if (state.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = if (state.isPlaying) "暂停" else "播放",
                        modifier = Modifier.size(32.dp)
                    )
                }
                Spacer(modifier = Modifier.width(16.dp))
                IconButton(onClick = viewModel::nextStep) {
                    Icon(Icons.Default.FastForward, contentDescription = "下一步")
                }
                Spacer(modifier = Modifier.width(8.dp))
                IconButton(onClick = viewModel::goToLastStep) {
                    Icon(Icons.Default.SkipNext, contentDescription = "最后一步")
                }
            }

            // Speed selector
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "速度:",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                val speeds = listOf(0.5f, 1f, 2f, 4f)
                speeds.forEach { speed ->
                    FilterChip(
                        selected = state.playbackSpeed == speed,
                        onClick = { viewModel.setSpeed(speed) },
                        label = { Text("${speed}x") }
                    )
                }
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            // Step detail panel
            if (state.currentStepIndex < state.steps.size) {
                val step = state.steps[state.currentStepIndex]
                StepDetailPanel(step = step)
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

            // Code preview
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .clickable(onClick = viewModel::toggleCodeExpanded),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                )
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "代码预览",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Medium
                        )
                        Icon(
                            if (state.showCodeExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                            contentDescription = null
                        )
                    }

                    AnimatedVisibility(visible = state.showCodeExpanded) {
                        Text(
                            text = state.codePreview,
                            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier
                                .background(
                                    MaterialTheme.colorScheme.surface,
                                    MaterialTheme.shapes.small
                                )
                                .padding(8.dp)
                                .fillMaxWidth()
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(100.dp))
        }
    }
}

@Composable
private fun StepDetailPanel(step: EpisodeStep) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
    ) {
        Text(
            text = "步骤 ${step.stepNumber} 详情",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onBackground
        )

        Spacer(modifier = Modifier.height(8.dp))

        StepDetailRow(label = "动作类型", value = step.actionType)
        StepDetailRow(label = "坐标", value = step.coordinates)
        StepDetailRow(label = "UI 选择器", value = step.uiSelector)
        StepDetailRow(
            label = "稳定性评分",
            value = "${(step.stabilityScore * 100).toInt()}%",
            trailing = {
                LinearProgressIndicator(
                    progress = { step.stabilityScore },
                    modifier = Modifier
                        .width(60.dp)
                        .height(6.dp),
                    color = when {
                        step.stabilityScore >= 0.9f -> Success
                        step.stabilityScore >= 0.7f -> Warning
                        else -> MaterialTheme.colorScheme.error
                    },
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )
            }
        )
    }
}

@Composable
private fun StepDetailRow(
    label: String,
    value: String,
    trailing: (@Composable () -> Unit)? = null
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(90.dp)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f)
        )
        trailing?.invoke()
    }
}
