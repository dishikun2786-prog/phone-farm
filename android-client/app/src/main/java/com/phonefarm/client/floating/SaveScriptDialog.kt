package com.phonefarm.client.floating

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/**
 * Save script dialog shown after a VLM task completes successfully.
 *
 * The user can:
 *   - Name the generated script (defaults to task summary)
 *   - Select target platform (douyin, kuaishou, wechat, xiaohongshu, etc.)
 *   - Toggle "Sync to cloud" for fleet-wide deployment
 *   - Toggle "Set as quick chip" for one-tap reuse
 *
 * Actions:
 *   - [onSave]: confirm and save the compiled script.
 *   - [onDiscard]: discard the episode without saving.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SaveScriptDialog(
    episodeSummary: TaskSummary?,
    onSave: (name: String, platform: String, syncToCloud: Boolean, setAsQuickChip: Boolean) -> Unit,
    onDiscard: () -> Unit,
) {
    if (episodeSummary == null) return

    var scriptName by remember { mutableStateOf(episodeSummary.taskPrompt.take(30)) }
    var platform by remember { mutableStateOf("douyin") }
    var syncToCloud by remember { mutableStateOf(true) }
    var setAsQuickChip by remember { mutableStateOf(false) }
    var platformExpanded by remember { mutableStateOf(false) }
    var category by remember { mutableStateOf("") }

    val platforms = listOf(
        "douyin" to "Douyin",
        "kuaishou" to "Kuaishou",
        "wechat" to "WeChat Video",
        "xiaohongshu" to "Xiaohongshu",
        "general" to "General",
    )

    Card(
        modifier = Modifier
            .width(280.dp)
            .padding(4.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            // Title
            Text(
                "Save Script",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )

            // Task summary
            Text(
                "Task: ${episodeSummary.taskPrompt.take(40)}...",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            // Steps and duration info
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    "${episodeSummary.totalSteps} steps",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    formatDuration(episodeSummary.durationMs),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // Script name
            OutlinedTextField(
                value = scriptName,
                onValueChange = { scriptName = it },
                label = { Text("Script Name") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                textStyle = MaterialTheme.typography.bodySmall,
            )

            // Platform dropdown
            ExposedDropdownMenuBox(
                expanded = platformExpanded,
                onExpandedChange = { platformExpanded = it },
            ) {
                OutlinedTextField(
                    value = platforms.firstOrNull { it.first == platform }?.second ?: platform,
                    onValueChange = { },
                    readOnly = true,
                    label = { Text("Platform") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = platformExpanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
                    textStyle = MaterialTheme.typography.bodySmall,
                )
                ExposedDropdownMenu(
                    expanded = platformExpanded,
                    onDismissRequest = { platformExpanded = false },
                ) {
                    platforms.forEach { (key, label) ->
                        DropdownMenuItem(
                            text = { Text(label, style = MaterialTheme.typography.bodySmall) },
                            onClick = {
                                platform = key
                                platformExpanded = false
                            },
                        )
                    }
                }
            }

            // Category
            OutlinedTextField(
                value = category,
                onValueChange = { category = it },
                label = { Text("Category") },
                placeholder = { Text("e.g. marketing, engagement") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                textStyle = MaterialTheme.typography.bodySmall,
            )

            HorizontalDivider()

            // Sync toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Sync to cloud",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.weight(1f),
                )
                Switch(
                    checked = syncToCloud,
                    onCheckedChange = { syncToCloud = it },
                )
            }

            // Quick chip toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Set as quick chip",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text(
                        "One-tap shortcut in chat",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = setAsQuickChip,
                    onCheckedChange = { setAsQuickChip = it },
                )
            }

            // Action buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDiscard) {
                    Text("Discard", style = MaterialTheme.typography.bodySmall)
                }
                Spacer(Modifier.width(8.dp))
                Button(
                    onClick = {
                        onSave(
                            scriptName.ifBlank { episodeSummary.taskPrompt.take(30) },
                            platform,
                            syncToCloud,
                            setAsQuickChip,
                        )
                    },
                    enabled = scriptName.isNotBlank(),
                ) {
                    Text("Save", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

private fun formatDuration(ms: Long): String = when {
    ms < 1000 -> "${ms}ms"
    ms < 60_000 -> "${ms / 1000}s"
    else -> {
        val minutes = ms / 60_000
        val seconds = (ms % 60_000) / 1000
        "${minutes}m ${seconds}s"
    }
}
