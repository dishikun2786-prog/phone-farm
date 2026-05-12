package com.phonefarm.client.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

data class PieSlice(val label: String, val value: Float, val color: Color)

@Composable
fun ModelUsagePieChart(
    slices: List<PieSlice>,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "模型用量统计",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
            ) {
                val total = slices.sumOf { it.value.toDouble() }.toFloat()
                val colors = slices.map { it.color }
                val sweepAngles = if (total > 0f) slices.map { (it.value / total) * 360f } else listOf(360f)

                Canvas(
                    modifier = Modifier.size(120.dp),
                ) {
                    var startAngle = -90f
                    slices.forEachIndexed { i, slice ->
                        if (sweepAngles[i] > 0f) {
                            drawArc(
                                color = slice.color,
                                startAngle = startAngle,
                                sweepAngle = sweepAngles[i],
                                useCenter = true,
                                topLeft = Offset.Zero,
                                size = Size(size.width, size.height),
                            )
                            startAngle += sweepAngles[i]
                        }
                    }
                    // Center hole (donut style)
                    drawCircle(
                        color = MaterialTheme.colorScheme.surface,
                        radius = size.width * 0.3f,
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            slices.forEach { slice ->
                val percentage = if (slices.sumOf { it.value.toDouble() } > 0) {
                    "%.0f%%".format(slice.value / slices.sumOf { it.value.toDouble() } * 100)
                } else "0%"

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        modifier = Modifier.size(10.dp),
                        shape = RoundedCornerShape(2.dp),
                        color = slice.color,
                    ) {}
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = slice.label,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = percentage,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }
}
