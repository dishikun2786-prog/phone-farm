package com.phonefarm.client.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

data class PlatformTab(
    val key: String,
    val label: String,
    val icon: String,
)

val defaultPlatformTabs = listOf(
    PlatformTab("all", "全部", "📱"),
    PlatformTab("douyin", "抖音", "🎵"),
    PlatformTab("kuaishou", "快手", "⚡"),
    PlatformTab("wechat", "微信", "💬"),
    PlatformTab("xiaohongshu", "小红书", "📕"),
)

@Composable
fun PlatformTabRow(
    selectedTab: String,
    onTabSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
    tabs: List<PlatformTab> = defaultPlatformTabs,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        tabs.forEach { tab ->
            val isSelected = tab.key == selectedTab
            FilterChip(
                selected = isSelected,
                onClick = { onTabSelected(tab.key) },
                label = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(tab.icon)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(tab.label, style = MaterialTheme.typography.labelMedium)
                    }
                },
            )
        }
    }
}
