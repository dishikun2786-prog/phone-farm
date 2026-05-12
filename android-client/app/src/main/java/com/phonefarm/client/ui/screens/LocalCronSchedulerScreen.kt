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
import com.phonefarm.client.ui.theme.Success
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CronJobItem(
    val jobId: String,
    val scriptName: String,
    val cronExpression: String,
    val enabled: Boolean,
    val lastRunAt: Long? = null,
    val nextRunAt: Long? = null,
    val scriptConfig: String? = null
)

data class LocalCronSchedulerUiState(
    val jobs: List<CronJobItem> = emptyList(),
    val isLoading: Boolean = true,
    val showAddEditDialog: Boolean = false,
    val editingJob: CronJobItem? = null,
    // Add/edit form fields
    val formScriptName: String = "",
    val formCronExpression: String = "",
    val formEnabled: Boolean = true
)

@HiltViewModel
class LocalCronSchedulerViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(LocalCronSchedulerUiState())
    val uiState: StateFlow<LocalCronSchedulerUiState> = _uiState.asStateFlow()

    init {
        loadJobs()
    }

    fun loadJobs() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            delay(400)

            // TODO: Load from LocalCronJobDao
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                jobs = listOf(
                    CronJobItem("j1", "抖音推荐营销", "0 8,12,18 * * *", true, System.currentTimeMillis() - 2 * 3_600_000, System.currentTimeMillis() + 3_600_000),
                    CronJobItem("j2", "快手搜索营销", "0 */2 * * *", true, System.currentTimeMillis() - 1_800_000, System.currentTimeMillis() + 1_800_000),
                    CronJobItem("j3", "小红书养号", "0 6 * * *", false, System.currentTimeMillis() - 72 * 3_600_000, null)
                )
            )
        }
    }

    fun toggleJobEnabled(jobId: String) {
        val updated = _uiState.value.jobs.map {
            if (it.jobId == jobId) it.copy(enabled = !it.enabled) else it
        }
        _uiState.value = _uiState.value.copy(jobs = updated)
        // TODO: Persist to repository
    }

    fun deleteJob(jobId: String) {
        _uiState.value = _uiState.value.copy(
            jobs = _uiState.value.jobs.filter { it.jobId != jobId }
        )
    }

    fun showAddDialog() {
        _uiState.value = _uiState.value.copy(
            showAddEditDialog = true,
            editingJob = null,
            formScriptName = "",
            formCronExpression = "0 */3 * * *",
            formEnabled = true
        )
    }

    fun showEditDialog(job: CronJobItem) {
        _uiState.value = _uiState.value.copy(
            showAddEditDialog = true,
            editingJob = job,
            formScriptName = job.scriptName,
            formCronExpression = job.cronExpression,
            formEnabled = job.enabled
        )
    }

    fun dismissDialog() {
        _uiState.value = _uiState.value.copy(showAddEditDialog = false, editingJob = null)
    }

    fun updateFormScriptName(name: String) {
        _uiState.value = _uiState.value.copy(formScriptName = name)
    }

    fun updateFormCronExpression(cron: String) {
        _uiState.value = _uiState.value.copy(formCronExpression = cron)
    }

    fun toggleFormEnabled() {
        _uiState.value = _uiState.value.copy(formEnabled = !_uiState.value.formEnabled)
    }

    fun saveJob() {
        viewModelScope.launch {
            val state = _uiState.value
            val now = System.currentTimeMillis()

            val newJob = CronJobItem(
                jobId = state.editingJob?.jobId ?: "j${System.currentTimeMillis()}",
                scriptName = state.formScriptName,
                cronExpression = state.formCronExpression,
                enabled = state.formEnabled,
                nextRunAt = now + 3_600_000 // Simulated next run
            )

            val updatedJobs = if (state.editingJob != null) {
                state.jobs.map { if (it.jobId == newJob.jobId) newJob else it }
            } else {
                state.jobs + newJob
            }

            _uiState.value = _uiState.value.copy(
                jobs = updatedJobs,
                showAddEditDialog = false,
                editingJob = null
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocalCronSchedulerScreen(
    onBack: () -> Unit,
    viewModel: LocalCronSchedulerViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    // Add/Edit dialog
    if (state.showAddEditDialog) {
        AlertDialog(
            onDismissRequest = viewModel::dismissDialog,
            title = {
                Text(
                    text = if (state.editingJob != null) "编辑定时任务" else "添加定时任务"
                )
            },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedTextField(
                        value = state.formScriptName,
                        onValueChange = viewModel::updateFormScriptName,
                        label = { Text("脚本名称") },
                        placeholder = { Text("例如: 抖音推荐营销") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )

                    OutlinedTextField(
                        value = state.formCronExpression,
                        onValueChange = viewModel::updateFormCronExpression,
                        label = { Text("Cron 表达式") },
                        placeholder = { Text("*/5 * * * *") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        supportingText = {
                            Text("格式: 分 时 日 月 周")
                        }
                    )

                    // Quick picks
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        val quickPicks = listOf(
                            "*/5 * * * *" to "每5分钟",
                            "0 * * * *" to "每小时",
                            "0 8,12,18 * * *" to "每天3次"
                        )
                        quickPicks.forEach { (cron, label) ->
                            AssistChip(
                                onClick = { viewModel.updateFormCronExpression(cron) },
                                label = { Text(label, style = MaterialTheme.typography.labelSmall) }
                            )
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "启用",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Switch(
                            checked = state.formEnabled,
                            onCheckedChange = { viewModel.toggleFormEnabled() }
                        )
                    }

                    if (state.formScriptName.isNotBlank() && state.formCronExpression.isNotBlank()) {
                        Text(
                            text = "预计下次执行: ${estimateNextRun(state.formCronExpression)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = viewModel::saveJob,
                    enabled = state.formScriptName.isNotBlank() && state.formCronExpression.isNotBlank()
                ) {
                    Text("保存")
                }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismissDialog) {
                    Text("取消")
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("定时任务") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::showAddDialog) {
                        Icon(Icons.Default.Add, contentDescription = "添加任务")
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
        } else if (state.jobs.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Default.Schedule,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "暂无定时任务",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "添加定时任务以自动执行脚本",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(onClick = viewModel::showAddDialog) {
                        Icon(Icons.Default.Add, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("添加任务")
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(state.jobs) { job ->
                    CronJobCard(
                        job = job,
                        onToggle = { viewModel.toggleJobEnabled(job.jobId) },
                        onEdit = { viewModel.showEditDialog(job) },
                        onDelete = { viewModel.deleteJob(job.jobId) }
                    )
                }

                item { Spacer(modifier = Modifier.height(80.dp)) }
            }
        }
    }
}

@Composable
private fun CronJobCard(
    job: CronJobItem,
    onToggle: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        Icons.Default.Schedule,
                        contentDescription = null,
                        tint = if (job.enabled) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = job.scriptName,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Medium
                    )
                }
                Switch(
                    checked = job.enabled,
                    onCheckedChange = { onToggle() }
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = job.cronExpression,
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                    ),
                    color = MaterialTheme.colorScheme.primary
                )

                if (job.enabled && job.nextRunAt != null) {
                    Text(
                        text = "下次: ${formatTimestamp(job.nextRunAt)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = Success
                    )
                }
            }

            if (job.lastRunAt != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "上次执行: ${formatTimestamp(job.lastRunAt)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = onEdit) {
                    Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("编辑", style = MaterialTheme.typography.labelMedium)
                }
                TextButton(
                    onClick = onDelete,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("删除", style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

private fun formatTimestamp(timestamp: Long): String {
    val sdf = java.text.SimpleDateFormat("MM-dd HH:mm", java.util.Locale.getDefault())
    return sdf.format(java.util.Date(timestamp))
}

private fun estimateNextRun(cronExpression: String): String {
    // Simplified estimation - in production, use a proper cron parser
    val now = System.currentTimeMillis()
    val estimated = now + 3_600_000
    return formatTimestamp(estimated)
}
