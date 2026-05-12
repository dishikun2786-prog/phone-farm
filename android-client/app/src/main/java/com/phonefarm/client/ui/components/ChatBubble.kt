package com.phonefarm.client.ui.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Chat message bubble — AI (left, with glass) or User (right, accent fill).
 */
@Composable
fun ChatBubble(
    role: String, // "ai", "user", "system"
    content: String,
    modifier: Modifier = Modifier,
    extraContent: (@Composable () -> Unit)? = null,
) {
    val isUser = role == "user"
    val isSystem = role == "system"

    val bubbleColor = when {
        isUser -> MaterialTheme.colorScheme.primary
        isSystem -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
        else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
    }

    val contentColor = when {
        isUser -> MaterialTheme.colorScheme.onPrimary
        isSystem -> MaterialTheme.colorScheme.onSurfaceVariant
        else -> MaterialTheme.colorScheme.onSurface
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            modifier = Modifier.widthIn(max = 280.dp),
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomStart = if (isUser) 16.dp else 4.dp,
                bottomEnd = if (isUser) 4.dp else 16.dp,
            ),
            color = bubbleColor,
            tonalElevation = 1.dp,
            shadowElevation = 0.dp,
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = content,
                    style = MaterialTheme.typography.bodyMedium,
                    color = contentColor,
                )
                extraContent?.invoke()
            }
        }
    }
}

@Composable
fun ThinkingBlock(
    thinking: String,
    modifier: Modifier = Modifier,
    isExpanded: Boolean = true,
    onToggle: () -> Unit = {},
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "🧠 推理过程",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = if (isExpanded) "收起" else "展开",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .then(
                            androidx.compose.foundation.clickable(onClick = onToggle)
                                .let { it }
                        ),
                )
            }

            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut(),
            ) {
                Text(
                    text = thinking,
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}

@Composable
fun ActionCard(
    action: String,
    status: ActionStatus,
    modifier: Modifier = Modifier,
) {
    val (statusColor, statusLabel) = when (status) {
        ActionStatus.EXECUTED -> Pair(Color(0xFF4CAF50), "✓ 已执行")
        ActionStatus.FAILED -> Pair(Color(0xFFF44336), "✗ 失败")
        ActionStatus.PENDING -> Pair(Color(0xFFFFC107), "○ 等待中")
        ActionStatus.RUNNING -> Pair(Color(0xFF2196F3), "◉ 执行中")
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        shape = RoundedCornerShape(8.dp),
        color = statusColor.copy(alpha = 0.08f),
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                modifier = Modifier.size(8.dp),
                shape = RoundedCornerShape(4.dp),
                color = statusColor,
            ) {}
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = action,
                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = statusLabel,
                style = MaterialTheme.typography.labelSmall,
                color = statusColor,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

enum class ActionStatus { EXECUTED, FAILED, PENDING, RUNNING }

@Composable
fun ScreenshotPreview(
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(180.dp),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                androidx.compose.material.icons.Icons.Default.Smartphone?.let {
                    androidx.compose.material3.Icon(
                        imageVector = it,
                        contentDescription = null,
                        modifier = Modifier.size(36.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f),
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "实时画面",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                )
            }
        }
    }
}

@Composable
fun ChatInputBar(
    value: String,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        tonalElevation = 2.dp,
        shadowElevation = 1.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            androidx.compose.foundation.layout.Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center,
            ) {
                Text("🎤", style = MaterialTheme.typography.labelMedium)
            }

            Spacer(modifier = Modifier.width(8.dp))

            androidx.compose.material3.TextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.weight(1f),
                placeholder = {
                    Text(
                        "输入你的指令...",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                },
                textStyle = MaterialTheme.typography.bodyMedium,
                colors = androidx.compose.material3.TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
                singleLine = true,
                enabled = enabled,
            )

            Spacer(modifier = Modifier.width(8.dp))

            androidx.compose.foundation.layout.Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(
                        if (value.isNotBlank() && enabled)
                            MaterialTheme.colorScheme.primary
                        else
                            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.2f)
                    )
                    .then(
                        if (value.isNotBlank() && enabled)
                            Modifier.let { androidx.compose.foundation.clickable(onClick = onSend).let { it } }
                        else Modifier
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text("→", style = MaterialTheme.typography.labelLarge, color = Color.White)
            }
        }
    }
}

// Extension to handle clickable on Modifier without Compose clickable import issue
private fun Modifier.conditionalClickable(enabled: Boolean, onClick: () -> Unit): Modifier {
    return if (enabled) this.then(androidx.compose.foundation.clickable(onClick = onClick) as Modifier) else this
}
