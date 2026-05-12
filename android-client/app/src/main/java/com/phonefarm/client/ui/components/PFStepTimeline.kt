package com.phonefarm.client.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

data class TimelineStep(
    val title: String,
    val description: String = "",
    val time: String = "",
    val status: TimelineStepStatus = TimelineStepStatus.COMPLETED
)

enum class TimelineStepStatus {
    COMPLETED, ACTIVE, PENDING, FAILED
}

@Composable
fun PFStepTimeline(
    steps: List<TimelineStep>,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        steps.forEachIndexed { index, step ->
            Row(modifier = Modifier.fillMaxWidth()) {
                // Timeline indicator column
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.width(32.dp)
                ) {
                    // Dot
                    val dotColor = when (step.status) {
                        TimelineStepStatus.COMPLETED -> com.phonefarm.client.ui.theme.Success
                        TimelineStepStatus.ACTIVE -> MaterialTheme.colorScheme.primary
                        TimelineStepStatus.FAILED -> com.phonefarm.client.ui.theme.Error
                        TimelineStepStatus.PENDING -> MaterialTheme.colorScheme.outlineVariant
                    }

                    val dotSize = when (step.status) {
                        TimelineStepStatus.ACTIVE -> 12.dp
                        else -> 8.dp
                    }

                    Surface(
                        modifier = Modifier.size(dotSize),
                        shape = MaterialTheme.shapes.extraSmall,
                        color = dotColor,
                        border = if (step.status == TimelineStepStatus.ACTIVE)
                            androidx.compose.foundation.BorderStroke(2.dp, dotColor)
                        else null
                    ) {}

                    // Connector line
                    if (index < steps.size - 1) {
                        Box(
                            modifier = Modifier
                                .width(2.dp)
                                .height(48.dp)
                                .background(
                                    if (step.status == TimelineStepStatus.COMPLETED)
                                        com.phonefarm.client.ui.theme.Success.copy(alpha = 0.3f)
                                    else MaterialTheme.colorScheme.outlineVariant
                                )
                        )
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                // Content
                Card(
                    modifier = Modifier
                        .weight(1f)
                        .padding(bottom = if (index < steps.size - 1) 4.dp else 0.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = when (step.status) {
                            TimelineStepStatus.ACTIVE -> MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                            TimelineStepStatus.FAILED -> com.phonefarm.client.ui.theme.Error.copy(alpha = 0.05f)
                            else -> MaterialTheme.colorScheme.surface
                        }
                    ),
                    border = if (step.status == TimelineStepStatus.ACTIVE)
                        androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.3f))
                    else null
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = step.title,
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f)
                            )
                            if (step.time.isNotEmpty()) {
                                Text(
                                    text = step.time,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        if (step.description.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = step.description,
                                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }
}
