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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun PFDeviceCard(
    deviceName: String,
    deviceModel: String,
    androidVersion: String,
    isOnline: Boolean,
    status: String, // idle, executing, error, offline
    statusLabel: String = "",
    modifier: Modifier = Modifier,
    batteriesLevel: Int? = null,
    onClick: (() -> Unit)? = null,
    onExecute: (() -> Unit)? = null,
    onScreenshot: (() -> Unit)? = null,
    onSettings: (() -> Unit)? = null
) {
    val onlineColor = if (isOnline) com.phonefarm.client.ui.theme.Success else com.phonefarm.client.ui.theme.Error

    val statusColor = when (status) {
        "idle" -> com.phonefarm.client.ui.theme.Success
        "executing" -> com.phonefarm.client.ui.theme.Warning
        "error" -> com.phonefarm.client.ui.theme.Error
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    val statusText = statusLabel.ifEmpty {
        when (status) {
            "idle" -> "就绪"
            "executing" -> "运行中"
            "error" -> "异常"
            "offline" -> "离线"
            else -> status
        }
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .then(
                if (onClick != null) Modifier.clickable(onClick = onClick)
                else Modifier
            ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Top row: Online indicator + Name + Status
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Online dot
                Surface(
                    modifier = Modifier.size(10.dp),
                    shape = MaterialTheme.shapes.extraSmall,
                    color = onlineColor
                ) {}

                Spacer(modifier = Modifier.width(10.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = deviceName,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = "$deviceModel | Android $androidVersion",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                // Status badge
                Surface(
                    shape = MaterialTheme.shapes.small,
                    color = statusColor.copy(alpha = 0.12f)
                ) {
                    Text(
                        text = statusText,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = statusColor,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            // Battery level
            if (batteriesLevel != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        if (batteriesLevel > 20) Icons.Default.BatteryFull else Icons.Default.BatteryAlert,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = if (batteriesLevel > 20) MaterialTheme.colorScheme.onSurfaceVariant
                        else com.phonefarm.client.ui.theme.Error
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "$batteriesLevel%",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    LinearProgressIndicator(
                        progress = { batteriesLevel / 100f },
                        modifier = Modifier
                            .width(60.dp)
                            .height(4.dp),
                        color = when {
                            batteriesLevel > 50 -> com.phonefarm.client.ui.theme.Success
                            batteriesLevel > 20 -> com.phonefarm.client.ui.theme.Warning
                            else -> com.phonefarm.client.ui.theme.Error
                        },
                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                }
            }

            // Action buttons
            if (isOnline && (onExecute != null || onScreenshot != null || onSettings != null)) {
                Spacer(modifier = Modifier.height(12.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    if (onExecute != null) {
                        TextButton(onClick = onExecute, contentPadding = PaddingValues(horizontal = 8.dp)) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("执行", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                    if (onScreenshot != null) {
                        TextButton(onClick = onScreenshot, contentPadding = PaddingValues(horizontal = 8.dp)) {
                            Icon(Icons.Default.Screenshot, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("截图", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                    if (onSettings != null) {
                        TextButton(onClick = onSettings, contentPadding = PaddingValues(horizontal = 8.dp)) {
                            Icon(Icons.Default.Settings, contentDescription = null, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }
        }
    }
}
