package com.phonefarm.client.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.phonefarm.client.ui.theme.Error
import com.phonefarm.client.ui.theme.Success
import com.phonefarm.client.ui.theme.Warning

data class ActivityItem(
    val id: String,
    val scriptName: String,
    val deviceName: String,
    val status: ActivityStatus,
    val timeAgo: String,
)

enum class ActivityStatus { COMPLETED, RUNNING, FAILED }

@Composable
fun ActivityFeed(
    items: List<ActivityItem>,
    modifier: Modifier = Modifier,
    onItemClick: (String) -> Unit = {},
    onViewAll: () -> Unit = {},
) {
    Column(modifier = modifier.fillMaxWidth()) {
        items.take(5).forEach { item ->
            ActivityFeedItem(
                item = item,
                onClick = { onItemClick(item.id) },
            )
        }

        if (items.size > 5) {
            TextButton(
                onClick = onViewAll,
                modifier = Modifier.padding(horizontal = 16.dp),
            ) {
                Text("查看全部 (${items.size})")
            }
        }
    }
}

@Composable
private fun ActivityFeedItem(
    item: ActivityItem,
    onClick: () -> Unit,
) {
    val (statusColor, statusIcon) = when (item.status) {
        ActivityStatus.COMPLETED -> Pair(Success, Icons.Default.CheckCircle)
        ActivityStatus.RUNNING -> Pair(Warning, Icons.Default.PlayArrow)
        ActivityStatus.FAILED -> Pair(Error, Icons.Default.Close)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = statusIcon,
            contentDescription = null,
            tint = statusColor,
            modifier = Modifier.size(20.dp),
        )

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.scriptName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = item.deviceName,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Text(
            text = item.timeAgo,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
