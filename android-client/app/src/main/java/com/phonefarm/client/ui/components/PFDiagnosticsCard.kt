package com.phonefarm.client.ui.components

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

enum class DiagnosticResult {
    PASS, FAIL, CHECKING, PENDING
}

@Composable
fun PFDiagnosticsCard(
    title: String,
    icon: ImageVector,
    result: DiagnosticResult,
    modifier: Modifier = Modifier,
    detail: String = "",
    fixLabel: String = "去修复",
    onFix: (() -> Unit)? = null
) {
    val (statusColor, statusIcon, statusText) = when (result) {
        DiagnosticResult.PASS -> Triple(
            com.phonefarm.client.ui.theme.Success,
            Icons.Default.CheckCircle,
            "通过"
        )
        DiagnosticResult.FAIL -> Triple(
            com.phonefarm.client.ui.theme.Error,
            Icons.Default.Cancel,
            "失败"
        )
        DiagnosticResult.CHECKING -> Triple(
            com.phonefarm.client.ui.theme.Warning,
            Icons.Default.HourglassTop,
            "检查中"
        )
        DiagnosticResult.PENDING -> Triple(
            MaterialTheme.colorScheme.onSurfaceVariant,
            Icons.Default.RadioButtonUnchecked,
            "待检查"
        )
    }

    Card(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Status result icon
            if (result == DiagnosticResult.CHECKING) {
                CircularProgressIndicator(
                    modifier = Modifier.size(28.dp),
                    strokeWidth = 2.5.dp
                )
            } else {
                Icon(
                    statusIcon,
                    contentDescription = null,
                    tint = statusColor,
                    modifier = Modifier.size(28.dp)
                )
            }

            Spacer(modifier = Modifier.width(14.dp))

            // Item content
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        icon,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = title,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                if (detail.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = detail,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Status badge or fix button
            Spacer(modifier = Modifier.width(8.dp))

            if (result == DiagnosticResult.FAIL && onFix != null) {
                TextButton(
                    onClick = onFix,
                    contentPadding = PaddingValues(horizontal = 12.dp)
                ) {
                    Text(
                        text = fixLabel,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            } else {
                Surface(
                    shape = MaterialTheme.shapes.small,
                    color = statusColor.copy(alpha = 0.1f)
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
        }
    }
}
