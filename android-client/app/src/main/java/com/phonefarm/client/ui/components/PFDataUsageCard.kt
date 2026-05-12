package com.phonefarm.client.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun PFDataUsageCard(
    label: String,
    usedBytes: Long,
    totalBytes: Long,
    modifier: Modifier = Modifier,
    ringColor: Color = MaterialTheme.colorScheme.primary,
    ringBackgroundColor: Color = MaterialTheme.colorScheme.surfaceVariant,
    strokeWidth: Dp = 8.dp,
    ringSize: Dp = 80.dp
) {
    val progress = if (totalBytes > 0) (usedBytes.toFloat() / totalBytes).coerceIn(0f, 1f) else 0f
    val percentage = (progress * 100).toInt()

    Card(modifier = modifier) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Ring chart
            Box(
                modifier = Modifier.size(ringSize),
                contentAlignment = Alignment.Center
            ) {
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val canvasSize = size.minDimension
                    val topLeft = Offset(
                        (size.width - canvasSize) / 2f,
                        (size.height - canvasSize) / 2f
                    )
                    val strokePx = strokeWidth.toPx()

                    // Background ring
                    drawArc(
                        color = ringBackgroundColor,
                        startAngle = -90f,
                        sweepAngle = 360f,
                        topLeft = topLeft,
                        size = Size(canvasSize, canvasSize),
                        style = Stroke(width = strokePx, cap = StrokeCap.Round),
                        useCenter = false
                    )

                    // Progress ring
                    drawArc(
                        color = ringColor,
                        startAngle = -90f,
                        sweepAngle = 360f * progress,
                        topLeft = topLeft,
                        size = Size(canvasSize, canvasSize),
                        style = Stroke(width = strokePx, cap = StrokeCap.Round),
                        useCenter = false
                    )
                }

                // Percentage text
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "${percentage}%",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "已用",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.width(20.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(modifier = Modifier.height(8.dp))

                DataUsageRow(
                    label = "已使用",
                    value = formatBytes(usedBytes),
                    color = ringColor
                )

                Spacer(modifier = Modifier.height(4.dp))

                DataUsageRow(
                    label = "可用",
                    value = formatBytes(totalBytes - usedBytes),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(4.dp))

                DataUsageRow(
                    label = "总计",
                    value = formatBytes(totalBytes),
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

@Composable
private fun DataUsageRow(
    label: String,
    value: String,
    color: Color
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            color = color,
            fontWeight = FontWeight.Medium
        )
    }
}

private fun formatBytes(bytes: Long): String {
    return when {
        bytes >= 1_000_000_000L -> "%.1f GB".format(bytes / 1_000_000_000f)
        bytes >= 1_000_000L -> "%.1f MB".format(bytes / 1_000_000f)
        bytes >= 1_000L -> "%.1f KB".format(bytes / 1_000f)
        else -> "${bytes}B"
    }
}
