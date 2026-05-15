package com.phonefarm.client.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

data class AccountMenuItem(
    val id: String,
    val label: String,
    val icon: ImageVector,
    val subtitle: String = "",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountCenterScreen(
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    planName: String = "Free",
    deviceCount: Int = 0,
) {
    val menuItems = listOf(
        AccountMenuItem("plans", "我的套餐", Icons.Default.Star, planName),
        AccountMenuItem("usage", "用量统计", Icons.Default.TrendingUp, "$deviceCount 台设备在线"),
        AccountMenuItem("billing", "账单历史", Icons.Default.Receipt, "查看订单和发票"),
        AccountMenuItem("cardkeys", "我的卡密", Icons.Default.Key),
        AccountMenuItem("apikeys", "API Keys", Icons.Default.VpnKey),
        AccountMenuItem("support", "技术支持", Icons.Default.Support, "提交工单"),
        AccountMenuItem("settings", "账户设置", Icons.Default.Settings, "修改密码"),
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("账户中心") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            Icons.Default.AccountCircle,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = planName,
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = "$deviceCount 台设备已激活",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            items(menuItems.size) { index ->
                val item = menuItems[index]
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { onNavigate(item.id) }
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            item.icon,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(text = item.label, style = MaterialTheme.typography.bodyLarge)
                            if (item.subtitle.isNotEmpty()) {
                                Text(
                                    text = item.subtitle,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        Icon(
                            Icons.Default.ChevronRight,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
