package com.phonefarm.client.ui.components

import androidx.compose.animation.*
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

enum class PFAlertSeverity(val color: Long, val icon: ImageVector) {
    INFO(0xFF1565C0, Icons.Default.Info),
    SUCCESS(0xFF2E7D32, Icons.Default.CheckCircle),
    WARNING(0xFFF57C00, Icons.Default.Warning),
    ERROR(0xFFD32F2F, Icons.Default.Error);

    val colorValue: Color get() = Color(color)
}

@Composable
fun PFAlertBanner(
    message: String,
    severity: PFAlertSeverity = PFAlertSeverity.INFO,
    modifier: Modifier = Modifier,
    title: String? = null,
    isVisible: Boolean = true,
    autoDismissMs: Long = 4000L,
    onDismiss: (() -> Unit)? = null,
    onAction: (() -> Unit)? = null,
    actionLabel: String? = null,
    onClick: (() -> Unit)? = null
) {
    var visible by remember(isVisible) { mutableStateOf(isVisible) }

    LaunchedEffect(isVisible) {
        visible = isVisible
        if (isVisible && autoDismissMs > 0) {
            kotlinx.coroutines.delay(autoDismissMs)
            visible = false
            onDismiss?.invoke()
        }
    }

    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(initialOffsetY = { -it }) + fadeIn(),
        exit = slideOutVertically(targetOffsetY = { -it }) + fadeOut()
    ) {
        Card(
            modifier = modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .then(
                    if (onClick != null) Modifier.clickable(onClick = onClick)
                    else Modifier
                ),
            colors = CardDefaults.cardColors(
                containerColor = severity.colorValue.copy(alpha = 0.1f)
            ),
            border = androidx.compose.foundation.BorderStroke(1.dp, severity.colorValue.copy(alpha = 0.3f))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    severity.icon,
                    contentDescription = null,
                    tint = severity.colorValue,
                    modifier = Modifier.size(24.dp)
                )

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    if (title != null) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = severity.colorValue
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                    }
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                if (actionLabel != null && onAction != null) {
                    Spacer(modifier = Modifier.width(8.dp))
                    TextButton(onClick = onAction) {
                        Text(
                            text = actionLabel,
                            style = MaterialTheme.typography.labelMedium,
                            color = severity.colorValue
                        )
                    }
                }

                if (onDismiss != null) {
                    IconButton(
                        onClick = {
                            visible = false
                            onDismiss()
                        },
                        modifier = Modifier.size(24.dp)
                    ) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = "关闭",
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
