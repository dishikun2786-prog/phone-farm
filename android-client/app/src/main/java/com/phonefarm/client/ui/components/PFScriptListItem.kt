package com.phonefarm.client.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun PFScriptListItem(
    name: String,
    platform: String,
    version: String,
    sizeBytes: Long,
    modifier: Modifier = Modifier,
    hasUpdate: Boolean = false,
    isSelected: Boolean = false,
    isBatchMode: Boolean = false,
    onSelectToggle: (() -> Unit)? = null,
    onExecute: (() -> Unit)? = null,
    onClick: (() -> Unit)? = null
) {
    val platformColor = when (platform) {
        "抖音" -> Color(0xFF000000)
        "快手" -> com.phonefarm.client.ui.theme.Warning
        "微信" -> com.phonefarm.client.ui.theme.Success
        "小红书" -> Color(0xFFFF2442)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .then(
                if (onClick != null) Modifier.clickable(onClick = onClick)
                else Modifier
            )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isBatchMode && onSelectToggle != null) {
                Checkbox(
                    checked = isSelected,
                    onCheckedChange = { onSelectToggle() }
                )
                Spacer(modifier = Modifier.width(4.dp))
            }

            // Platform icon square
            Surface(
                modifier = Modifier.size(42.dp),
                shape = MaterialTheme.shapes.small,
                color = platformColor.copy(alpha = 0.1f)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = platform.take(2),
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
                        text = name,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Medium
                    )
                    if (hasUpdate) {
                        Spacer(modifier = Modifier.width(6.dp))
                        PFStatusBadge(
                            text = "更新",
                            color = com.phonefarm.client.ui.theme.Warning
                        )
                    }
                }
                Text(
                    text = "v$version | ${formatSize(sizeBytes)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Platform label
            PFStatusBadge(
                text = platform,
                color = platformColor,
                modifier = Modifier.padding(end = 8.dp)
            )

            // Execute button
            if (!isBatchMode && onExecute != null) {
                IconButton(
                    onClick = onExecute,
                    modifier = Modifier.size(40.dp)
                ) {
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
