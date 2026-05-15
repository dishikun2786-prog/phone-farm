package com.phonefarm.client.assistant

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.TouchApp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.phonefarm.client.ui.theme.Error
import com.phonefarm.client.ui.theme.Primary
import com.phonefarm.client.ui.theme.Secondary
import com.phonefarm.client.ui.theme.Success
import com.phonefarm.client.ui.theme.Warning

/**
 * A card showing a single brain agent step trace.
 */
@Composable
fun StepTraceCard(
    step: BrainStep,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = true,
        enter = fadeIn() + slideInVertically(initialOffsetY = { it / 4 }),
    ) {
        val (icon, color) = stepIconAndColor(step.phase)

        Row(
            modifier = modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(color.copy(alpha = 0.08f))
                .padding(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = step.phase.name,
                tint = color,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = step.thought.take(200),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                if (step.observation != null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = step.observation.take(300),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (step.action != null) {
                    Spacer(modifier = Modifier.height(6.dp))
                    ActionBadge(step.action)
                }
            }
        }
    }
}

@Composable
private fun ActionBadge(action: BrainAction) {
    val label = when (action) {
        is BrainAction.DelegateToVision -> "Vision: ${action.goal.take(40)}"
        is BrainAction.ExecuteActions -> "Execute: ${action.reason.take(40)}"
        is BrainAction.AskUser -> "Ask: ${action.question.take(40)}"
        is BrainAction.CompleteTask -> "Complete: ${action.summary.take(40)}"
        is BrainAction.FailTask -> "Failed: ${action.reason.take(40)}"
    }

    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Medium,
        color = Primary,
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(Primary.copy(alpha = 0.1f))
            .padding(horizontal = 8.dp, vertical = 4.dp),
    )
}

private fun stepIconAndColor(phase: StepPhase): Pair<ImageVector, androidx.compose.ui.graphics.Color> = when (phase) {
    StepPhase.PLAN -> Icons.Default.PlayArrow to Primary
    StepPhase.THINK -> Icons.Default.CameraAlt to Secondary
    StepPhase.ACT -> Icons.Default.TouchApp to Warning
    StepPhase.OBSERVE -> Icons.Default.CameraAlt to Secondary
    StepPhase.COMPLETE -> Icons.Default.CheckCircle to Success
    StepPhase.ERROR -> Icons.Default.Error to Error
}
