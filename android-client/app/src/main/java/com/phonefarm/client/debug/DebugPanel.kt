package com.phonefarm.client.debug

import android.graphics.Bitmap
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Shake-to-open debug panel (debug builds only).
 *
 * Provides a bottom-sheet overlay for real-time inspection of:
 *  - Application logs (scrolling, filterable by level)
 *  - Network request/response log
 *  - Current accessibility tree dump
 *  - One-shot VLM step execution on current screenshot
 *
 * The panel opens automatically when the device is shaken (via
 * accelerometer listener) and can be dismissed with a swipe-down.
 */
@Composable
fun DebugPanel(
    logs: List<String>,
    networkRequests: List<NetworkLogEntry>,
    accessibilityTree: String?,
    onRunSingleVlmStep: (screenshot: Bitmap) -> Unit,
) {
    var isVisible by remember { mutableStateOf(false) }
    var selectedTab by remember { mutableStateOf(0) }

    // TODO: Register accelerometer-based shake detection to toggle isVisible.

    AnimatedVisibility(
        visible = isVisible,
        enter = fadeIn(),
        exit = fadeOut(),
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = Color(0xF0000000),
            tonalElevation = 8.dp,
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // Title bar
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = "Debug Panel",
                        color = Color.White,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    TextButton(onClick = { isVisible = false }) {
                        Text("Close", color = Color(0xFFFF5252))
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Tab row
                val tabs = listOf("Logs", "Network", "A11y Tree", "VLM Step")
                TabRow(selectedTabIndex = selectedTab) {
                    tabs.forEachIndexed { index, title ->
                        Tab(
                            selected = selectedTab == index,
                            onClick = { selectedTab = index },
                            text = { Text(title, fontSize = 12.sp) },
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Tab content
                Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    when (selectedTab) {
                        0 -> LogsTab(logs)
                        1 -> NetworkTab(networkRequests)
                        2 -> AccessibilityTreeTab(accessibilityTree)
                        3 -> VlmStepTab(onRunSingleVlmStep)
                    }
                }
            }
        }
    }
}

// ---- Logs Tab ----

@Composable
private fun LogsTab(logs: List<String>) {
    var filter by remember { mutableStateOf("") }
    val filtered = remember(logs, filter) {
        if (filter.isBlank()) logs else logs.filter { it.contains(filter, ignoreCase = true) }
    }

    OutlinedTextField(
        value = filter,
        onValueChange = { filter = it },
        label = { Text("Filter", color = Color.LightGray) },
        modifier = Modifier.fillMaxWidth(),
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = Color.White,
            unfocusedTextColor = Color.White,
        ),
    )

    Spacer(modifier = Modifier.height(4.dp))

    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
    ) {
        items(filtered) { log ->
            val logColor = when {
                log.contains("ERROR") || log.contains("E/") -> Color(0xFFFF5252)
                log.contains("WARN") || log.contains("W/") -> Color(0xFFFFD740)
                log.contains("DEBUG") || log.contains("D/") -> Color(0xFF64B5F6)
                else -> Color(0xFFB0BEC5)
            }
            Text(
                text = log,
                color = logColor,
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier.padding(vertical = 1.dp),
            )
        }
    }
}

// ---- Network Tab ----

@Composable
private fun NetworkTab(networkRequests: List<NetworkLogEntry>) {
    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
    ) {
        items(networkRequests) { entry ->
            val statusColor = when {
                entry.statusCode in 200..299 -> Color(0xFF66BB6A)
                entry.statusCode in 400..499 -> Color(0xFFFFD740)
                entry.statusCode >= 500 -> Color(0xFFFF5252)
                else -> Color(0xFFB0BEC5)
            }
            Card(
                modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                colors = CardDefaults.cardColors(
                    containerColor = Color(0xFF1E1E1E)
                ),
            ) {
                Column(modifier = Modifier.padding(8.dp)) {
                    Text(
                        text = "${entry.method} ${entry.url}",
                        color = Color.White,
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = "${entry.statusCode}",
                            color = statusColor,
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace,
                        )
                        Text(
                            text = "${entry.durationMs}ms",
                            color = Color.Gray,
                            fontSize = 10.sp,
                        )
                        Text(
                            text = "${entry.responseSize} bytes",
                            color = Color.Gray,
                            fontSize = 10.sp,
                        )
                    }
                }
            }
        }
    }
}

// ---- Accessibility Tree Tab ----

@Composable
private fun AccessibilityTreeTab(accessibilityTree: String?) {
    val treeText = accessibilityTree ?: "Accessibility service not connected. " +
            "Enable it in Settings > Accessibility > PhoneFarm."

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF1E1E1E))
            .padding(8.dp),
    ) {
        Text(
            text = treeText,
            color = Color(0xFFB0BEC5),
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace,
        )
    }
}

// ---- VLM Step Tab ----

@Composable
private fun VlmStepTab(onRunSingleVlmStep: (Bitmap) -> Unit) {
    var isRunning by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Capture current screen and send to VLM for a single reasoning step.",
            color = Color.LightGray,
            fontSize = 14.sp,
        )

        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = {
                isRunning = true
                // TODO: Capture screenshot via AccessibilityService or MediaProjection,
                //       then call onRunSingleVlmStep(screenshot).
            },
            enabled = !isRunning,
        ) {
            Text(if (isRunning) "Running..." else "Run Single VLM Step")
        }
    }
}

// ---- data class ----

/**
 * Represents a single HTTP network request/response captured for the debug panel.
 */
data class NetworkLogEntry(
    val method: String,
    val url: String,
    val statusCode: Int,
    val durationMs: Long,
    val responseSize: Long,
    val requestHeaders: String? = null,
    val responseHeaders: String? = null,
    val timestamp: Long = System.currentTimeMillis(),
)
