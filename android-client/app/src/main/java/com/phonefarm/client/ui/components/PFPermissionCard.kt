package com.phonefarm.client.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun PFPermissionCard(
    icon: ImageVector,
    title: String,
    description: String,
    isAuthorized: Boolean,
    stepNumber: Int,
    isCurrent: Boolean,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier
) {
    val statusColor = if (isAuthorized) com.phonefarm.client.ui.theme.Success
        else com.phonefarm.client.ui.theme.Warning

    val borderColor = when {
        isAuthorized -> com.phonefarm.client.ui.theme.Success.copy(alpha = 0.3f)
        isCurrent -> MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
        else -> MaterialTheme.colorScheme.outlineVariant
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        border = if (isCurrent) BorderStroke(1.dp, borderColor) else null
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Step number / Status icon
                Surface(
                    modifier = Modifier.size(44.dp),
                    shape = MaterialTheme.shapes.medium,
                    color = when {
                        isAuthorized -> statusColor.copy(alpha = 0.12f)
                        isCurrent -> MaterialTheme.colorScheme.primaryContainer
                        else -> MaterialTheme.colorScheme.surfaceVariant
                    }
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (isAuthorized) {
                            Icon(
                                Icons.Default.Check,
                                contentDescription = null,
                                tint = statusColor,
                                modifier = Modifier.size(24.dp)
                            )
                        } else {
                            Icon(
                                icon,
                                contentDescription = null,
                                tint = if (isCurrent) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.width(14.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = "$stepNumber. $title",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        PFStatusBadge(
                            text = if (isAuthorized) "已授权" else "待授权",
                            color = statusColor
                        )
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (!isAuthorized) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

                Button(
                    onClick = onOpenSettings,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    shape = MaterialTheme.shapes.small
                ) {
                    Text("去开启")
                }
            }
        }
    }
}
