package com.phonefarm.client.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.util.Calendar
import java.util.Date

data class ScheduleConfig(
    val cronExpression: String = "0 * * * *",
    val scriptName: String = "",
    val enabled: Boolean = true,
    val startDate: Date? = null,
    val repeatType: RepeatType = RepeatType.HOURLY
)

enum class RepeatType(val label: String, val cronHint: String) {
    MINUTES("每N分钟", "*/N * * * *"),
    HOURLY("每小时", "0 * * * *"),
    DAILY("每天", "0 H * * *"),
    WEEKLY("每周", "0 H * * D"),
    CUSTOM("自定义", "")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PFSchedulerPicker(
    config: ScheduleConfig,
    onConfigChange: (ScheduleConfig) -> Unit,
    modifier: Modifier = Modifier,
    availableScripts: List<String> = emptyList(),
    onSave: (() -> Unit)? = null
) {
    var showScriptDropdown by remember { mutableStateOf(false) }
    var showRepeatDropdown by remember { mutableStateOf(false) }
    var showTimePicker by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Script picker
        Text(
            text = "选择脚本",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Box {
            OutlinedTextField(
                value = config.scriptName,
                onValueChange = { onConfigChange(config.copy(scriptName = it)) },
                placeholder = { Text("选择或输入脚本名称") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                readOnly = false,
                trailingIcon = {
                    IconButton(onClick = { showScriptDropdown = true }) {
                        Icon(Icons.Default.ArrowDropDown, contentDescription = null)
                    }
                }
            )

            DropdownMenu(
                expanded = showScriptDropdown,
                onDismissRequest = { showScriptDropdown = false }
            ) {
                if (availableScripts.isEmpty()) {
                    DropdownMenuItem(
                        text = { Text("暂无可用脚本") },
                        onClick = { showScriptDropdown = false }
                    )
                }
                availableScripts.forEach { script ->
                    DropdownMenuItem(
                        text = { Text(script) },
                        onClick = {
                            onConfigChange(config.copy(scriptName = script))
                            showScriptDropdown = false
                        }
                    )
                }
            }
        }

        // Cron expression input
        Text(
            text = "Cron 表达式",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        OutlinedTextField(
            value = config.cronExpression,
            onValueChange = { onConfigChange(config.copy(cronExpression = it)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
            supportingText = {
                Text("格式: 分 时 日 月 周")
            }
        )

        // Repeat type selector
        Text(
            text = "重复模式",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            RepeatType.entries.forEach { type ->
                FilterChip(
                    selected = config.repeatType == type,
                    onClick = {
                        onConfigChange(
                            config.copy(
                                repeatType = type,
                                cronExpression = if (type != RepeatType.CUSTOM) type.cronHint else config.cronExpression
                            )
                        )
                    },
                    label = { Text(type.label, style = MaterialTheme.typography.labelSmall) }
                )
            }
        }

        // Quick pick chips
        Text(
            text = "快捷选择",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            val quickPicks = listOf(
                "*/5 * * * *" to "每5分钟",
                "0 * * * *" to "每小时",
                "0 8,12,18 * * *" to "每天3次",
                "0 6 * * *" to "每天早上6点",
                "0 */2 * * *" to "每2小时"
            )
            quickPicks.take(3).forEach { (cron, label) ->
                AssistChip(
                    onClick = { onConfigChange(config.copy(cronExpression = cron)) },
                    label = { Text(label, style = MaterialTheme.typography.labelSmall) }
                )
            }
        }

        // Enabled toggle
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onConfigChange(config.copy(enabled = !config.enabled)) }
                .padding(vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (config.enabled) Icons.Default.ToggleOn else Icons.Default.ToggleOff,
                    contentDescription = null,
                    tint = if (config.enabled) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "启用定时任务",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            Switch(
                checked = config.enabled,
                onCheckedChange = { onConfigChange(config.copy(enabled = it)) }
            )
        }

        // Next execution preview
        if (config.cronExpression.isNotBlank() && config.scriptName.isNotBlank()) {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.2f)
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Schedule,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "预计下次执行",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = "将在约1小时后执行",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }

        // Save button
        if (onSave != null) {
            Button(
                onClick = onSave,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = MaterialTheme.shapes.medium,
                enabled = config.scriptName.isNotBlank() && config.cronExpression.isNotBlank()
            ) {
                Text("保存")
            }
        }
    }
}
