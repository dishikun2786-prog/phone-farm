package com.phonefarm.client.ui.components

import androidx.compose.animation.*
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

enum class PluginInstallStatus {
    INSTALLED, DOWNLOADING, WAITING, FAILED, VERIFYING, UPDATE_AVAILABLE
}

@Composable
fun PFPluginProgressCard(
    name: String,
    version: String,
    sizeBytes: Long,
    status: PluginInstallStatus,
    progress: Float = 0f,
    modifier: Modifier = Modifier,
    icon: ImageVector = Icons.Default.Extension,
    onInstall: (() -> Unit)? = null,
    onRetry: (() -> Unit)? = null
) {
    val statusColor = when (status) {
        PluginInstallStatus.INSTALLED -> com.phonefarm.client.ui.theme.Success
        PluginInstallStatus.DOWNLOADING -> MaterialTheme.colorScheme.primary
        PluginInstallStatus.WAITING -> MaterialTheme.colorScheme.onSurfaceVariant
        PluginInstallStatus.FAILED -> com.phonefarm.client.ui.theme.Error
        PluginInstallStatus.VERIFYING -> com.phonefarm.client.ui.theme.Warning
        PluginInstallStatus.UPDATE_AVAILABLE -> com.phonefarm.client.ui.theme.Warning
    }

    val statusText = when (status) {
        PluginInstallStatus.INSTALLED -> "已安装"
        PluginInstallStatus.DOWNLOADING -> "下载中 ${(progress * 100).toInt()}%"
        PluginInstallStatus.WAITING -> "等待中"
        PluginInstallStatus.FAILED -> "安装失败"
        PluginInstallStatus.VERIFYING -> "校验中..."
        PluginInstallStatus.UPDATE_AVAILABLE -> "有更新"
    }

    val statusIcon = when (status) {
        PluginInstallStatus.INSTALLED -> Icons.Default.CheckCircle
        PluginInstallStatus.DOWNLOADING -> Icons.Default.Downloading
        PluginInstallStatus.WAITING -> Icons.Default.HourglassEmpty
        PluginInstallStatus.FAILED -> Icons.Default.Error
        PluginInstallStatus.VERIFYING -> Icons.Default.Security
        PluginInstallStatus.UPDATE_AVAILABLE -> Icons.Default.SystemUpdate
    }

    Card(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Icon
                Surface(
                    modifier = Modifier.size(42.dp),
                    shape = MaterialTheme.shapes.small,
                    color = statusColor.copy(alpha = 0.1f)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            statusIcon,
                            contentDescription = null,
                            tint = statusColor,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = name,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "v$version | ${formatFileSize(sizeBytes)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                // Status badge
                PFStatusBadge(
                    text = statusText,
                    color = statusColor
                )
            }

            // Progress bar for downloading
            if (status == PluginInstallStatus.DOWNLOADING) {
                Spacer(modifier = Modifier.height(10.dp))
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth(),
                    color = statusColor,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )

                Spacer(modifier = Modifier.height(4.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "${(progress * 100).toInt()}%",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Text(
                        text = "${formatFileSize((sizeBytes * progress).toLong())} / ${formatFileSize(sizeBytes)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Action buttons
            if (status == PluginInstallStatus.FAILED && onRetry != null) {
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = onRetry,
                    modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.small
                ) {
                    Text("重试")
                }
            }

            if (status == PluginInstallStatus.UPDATE_AVAILABLE && onInstall != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = onInstall,
                    modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.small
                ) {
                    Text("更新")
                }
            }
        }
    }
}

private fun formatFileSize(bytes: Long): String {
    val mb = bytes / 1_000_000f
    return if (mb >= 1000) "%.1f GB".format(mb / 1000) else "%.1f MB".format(mb)
}
