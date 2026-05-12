package com.phonefarm.client.ui.components

import androidx.compose.animation.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Expandable FAB — single main action button that expands into a speed-dial
 * menu of 3-5 quick actions.
 */
@Composable
fun QuickActionFab(
    modifier: Modifier = Modifier,
    actions: List<FabAction> = defaultActions(),
) {
    var expanded by remember { mutableStateOf(false) }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.End,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AnimatedVisibility(
            visible = expanded,
            enter = fadeIn() + slideInVertically(initialOffsetY = { it / 2 }),
            exit = fadeOut() + slideOutVertically(targetOffsetY = { it / 2 }),
        ) {
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                actions.forEach { action ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.9f),
                            shadowElevation = 2.dp,
                        ) {
                            Text(
                                text = action.label,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        SmallFloatingActionButton(
                            onClick = {
                                expanded = false
                                action.onClick()
                            },
                            containerColor = action.color,
                            contentColor = Color.White,
                        ) {
                            Icon(action.icon, contentDescription = action.label)
                        }
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = { expanded = !expanded },
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
        ) {
            Icon(
                imageVector = if (expanded) Icons.Default.Close else Icons.Default.Add,
                contentDescription = if (expanded) "关闭" else "快速操作",
            )
        }
    }
}

data class FabAction(
    val label: String,
    val color: Color = Color(0xFF6750A4),
    val onClick: () -> Unit,
    val icon: androidx.compose.ui.graphics.vector.ImageVector = Icons.Default.Add,
)

@Composable
private fun defaultActions(): List<FabAction> = listOf(
    FabAction(
        label = "VLM 任务",
        color = Color(0xFF7C4DFF),
        onClick = {},
        icon = Icons.Default.Add, // placeholder
    ),
    FabAction(
        label = "执行脚本",
        color = Color(0xFF00BCD4),
        onClick = {},
        icon = Icons.Default.Add,
    ),
    FabAction(
        label = "检查更新",
        color = Color(0xFF4CAF50),
        onClick = {},
        icon = Icons.Default.Add,
    ),
)
