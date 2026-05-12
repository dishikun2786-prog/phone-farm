package com.phonefarm.client.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.phonefarm.client.ui.components.PFDataUsageCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DataUsageScreen(onBack: () -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("流量使用") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "今日用量",
                style = MaterialTheme.typography.titleMedium,
            )
            PFDataUsageCard(
                label = "WiFi",
                usedBytes = 120_000_000L,
                totalBytes = 2_048_000_000L,
            )
            PFDataUsageCard(
                label = "移动网络",
                usedBytes = 45_000_000L,
                totalBytes = 500_000_000L,
            )
        }
    }
}
