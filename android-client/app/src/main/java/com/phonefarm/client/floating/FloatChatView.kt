package com.phonefarm.client.floating

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.phonefarm.client.vlm.AgentState

/**
 * Compose-based floating chat view.
 *
 * Renders one of 4 states based on the current [FloatState]:
 *   1. **Collapsed bubble**   鈥?small circle with PhoneFarm icon.
 *   2. **Expanded chat panel**鈥?conversation timeline + text input + quick chips.
 *   3. **Executing panel**    鈥?step-by-step VLM trace with progress.
 *   4. **SaveScript dialog**  鈥?name + platform + options dialog.
 *
 * The view is hosted inside a ComposeView attached to the WindowManager
 * overlay by [FloatWindowService].
 */
@Composable
fun FloatChatView(
    viewModel: FloatChatViewModel,
    onDismiss: () -> Unit,
) {
    val floatState by viewModel.floatState.collectAsState()
    val messages by viewModel.messages.collectAsState()

    // Apply background shape based on state
    val shape = when (floatState) {
        FloatState.COLLAPSED -> CircleShape
        else -> RoundedCornerShape(12.dp)
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        shape = shape,
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 4.dp,
        shadowElevation = 8.dp,
    ) {
        when (floatState) {
            FloatState.COLLAPSED -> {
                CollapsedBubble(
                    agentState = viewModel.vlmState.collectAsState().value,
                    onDismiss = onDismiss,
                )
            }
            FloatState.EXPANDED -> {
                ExpandedChatPanel(
                    messages = messages,
                    chips = viewModel.quickChips(),
                    onSend = { viewModel.sendTask(it) },
                    onDismiss = onDismiss,
                )
            }
            FloatState.EXECUTING -> {
                ExecutingPanel(
                    messages = messages,
                    vlmState = viewModel.vlmState.collectAsState().value,
                    onPause = { viewModel.pauseExecution() },
                    onStop = { viewModel.stopExecution() },
                    onDismiss = onDismiss,
                )
            }
            FloatState.SAVE_SCRIPT -> {
                SaveScriptDialogContent(
                    episodeSummary = viewModel.episodeSummary.collectAsState().value,
                    onSave = { name, platform, sync, chip ->
                        viewModel.saveScript(name, platform, sync, chip)
                    },
                    onDiscard = { viewModel.discardEpisode() },
                )
            }
        }
    }
}

// === Sub-composables ===

/**
 * Collapsed floating bubble: 56dp circle with status dot.
 */
@Composable
private fun CollapsedBubble(
    agentState: AgentState,
    onDismiss: () -> Unit,
) {
    val statusColor by animateColorAsState(
        targetValue = when (agentState) {
            is AgentState.Idle -> Color(0xFF4CAF50)        // green
            is AgentState.Running -> Color(0xFF00BCD4)      // cyan
            is AgentState.Paused -> Color(0xFFFF9800)       // orange
            is AgentState.Completed -> Color(0xFF4CAF50)    // green
            is AgentState.Error -> Color(0xFFF44336)        // red
        },
        animationSpec = tween(400),
        label = "statusColor"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                color = MaterialTheme.colorScheme.primaryContainer,
                shape = CircleShape
            ),
        contentAlignment = Alignment.Center,
    ) {
        // Main icon
        Icon(
            imageVector = Icons.Default.Phone,
            contentDescription = "PhoneFarm",
            tint = MaterialTheme.colorScheme.onPrimaryContainer,
            modifier = Modifier.size(24.dp),
        )

        // Status dot indicator
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(8.dp)
                .size(10.dp)
                .clip(CircleShape)
                .background(statusColor)
        )

        // Error badge
        if (agentState is AgentState.Error) {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = "Error",
                tint = Color(0xFFF44336),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .size(14.dp),
            )
        }
    }
}

/**
 * Expanded chat panel: title bar, message list, quick chips, input bar.
 */
@Composable
private fun ExpandedChatPanel(
    messages: List<FloatMessage>,
    chips: List<QuickChip>,
    onSend: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val listState = rememberLazyListState()
    var inputText by remember { mutableStateOf("") }

    // Auto-scroll to bottom on new messages
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface),
    ) {
        // Title bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "PhoneFarm AI",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            IconButton(
                onClick = onDismiss,
                modifier = Modifier.size(28.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Collapse",
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        Divider()

        // Message list
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
            state = listState,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (messages.isEmpty()) {
                item {
                    Text(
                        text = "Describe your task in natural language...",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
            items(messages, key = { it.id }) { message ->
                ChatBubble(message = message)
            }
        }

        // Quick command chips
        if (chips.isNotEmpty()) {
            QuickChipsRow(
                chips = chips,
                onChipClick = { onSend(it.command) },
            )
        }

        // Input bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = inputText,
                onValueChange = { newValue -> inputText = newValue },
                modifier = Modifier
                    .weight(1f)
                    .height(48.dp),
                placeholder = { Text("Enter task...", style = MaterialTheme.typography.bodySmall) },
                singleLine = true,
                textStyle = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.width(6.dp))
            IconButton(
                onClick = {
                    if (inputText.isNotBlank()) {
                        onSend(inputText)
                        inputText = ""
                    }
                },
                enabled = inputText.isNotBlank(),
                modifier = Modifier.size(36.dp),
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Send,
                    contentDescription = "Send",
                    modifier = Modifier.size(20.dp),
                    tint = if (inputText.isNotBlank())
                        MaterialTheme.colorScheme.primary
                    else
                        MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/**
 * Executing panel: same as expanded but with progress indicator and control buttons.
 */
@Composable
private fun ExecutingPanel(
    messages: List<FloatMessage>,
    vlmState: AgentState,
    onPause: () -> Unit,
    onStop: () -> Unit,
    onDismiss: () -> Unit,
) {
    val listState = rememberLazyListState()
    val isPaused = vlmState is AgentState.Paused

    // Auto-scroll to bottom on new messages
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface),
    ) {
        // Title bar with controls
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = if (isPaused) "Paused" else "Executing...",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = if (isPaused)
                    Color(0xFFFF9800)
                else
                    MaterialTheme.colorScheme.primary,
                modifier = Modifier.weight(1f),
            )

            // Pause / Resume
            IconButton(
                onClick = if (isPaused) onPause else onPause,
                modifier = Modifier.size(28.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Pause,
                    contentDescription = if (isPaused) "Resume" else "Pause",
                    modifier = Modifier.size(18.dp),
                )
            }

            // Stop
            IconButton(
                onClick = onStop,
                modifier = Modifier.size(28.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Stop,
                    contentDescription = "Stop",
                    modifier = Modifier.size(18.dp),
                    tint = Color(0xFFF44336),
                )
            }

            // Collapse
            IconButton(
                onClick = onDismiss,
                modifier = Modifier.size(28.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Collapse",
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        // Progress indicator
        LinearProgressIndicator(
            modifier = Modifier.fillMaxWidth(),
            color = if (isPaused) Color(0xFFFF9800) else MaterialTheme.colorScheme.primary,
        )

        // Message list
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
            state = listState,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            items(messages, key = { it.id }) { message ->
                ChatBubble(message = message)
            }
        }
    }
}

/**
 * A single chat message bubble.
 */
@Composable
private fun ChatBubble(message: FloatMessage) {
    val (backgroundColor, textColor, alignment) = when (message.role) {
        "user" -> Triple(
            MaterialTheme.colorScheme.primary,
            MaterialTheme.colorScheme.onPrimary,
            Alignment.End,
        )
        "ai" -> Triple(
            MaterialTheme.colorScheme.secondaryContainer,
            MaterialTheme.colorScheme.onSecondaryContainer,
            Alignment.Start,
        )
        "system" -> Triple(
            MaterialTheme.colorScheme.surfaceVariant,
            MaterialTheme.colorScheme.onSurfaceVariant,
            Alignment.CenterHorizontally,
        )
        else -> Triple(
            MaterialTheme.colorScheme.surfaceVariant,
            MaterialTheme.colorScheme.onSurfaceVariant,
            Alignment.Start,
        )
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 1.dp),
        horizontalAlignment = alignment,
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 240.dp)
                .clip(shapeForMessage(message))
                .background(backgroundColor)
                .padding(horizontal = 10.dp, vertical = 6.dp),
        ) {
            Column {
                // Thinking indicator
                if (message.type == "thinking") {
                    Text(
                        text = "Thinking...",
                        style = MaterialTheme.typography.labelSmall,
                        color = textColor.copy(alpha = 0.6f),
                    )
                }

                // Main content
                Text(
                    text = message.content,
                    style = MaterialTheme.typography.bodySmall,
                    color = textColor,
                    maxLines = 8,
                    overflow = TextOverflow.Ellipsis,
                )

                // Timestamp
                Text(
                    text = formatTime(message.timestamp),
                    style = MaterialTheme.typography.labelSmall,
                    color = textColor.copy(alpha = 0.5f),
                    fontSize = 9.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}

/**
 * Horizontal scrolling row of quick command chips.
 */
@Composable
private fun QuickChipsRow(
    chips: List<QuickChip>,
    onChipClick: (QuickChip) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        chips.filter { it.enabled }.forEach { chip ->
            SuggestionChip(
                onClick = { onChipClick(chip) },
                label = {
                    Text(
                        text = chip.label,
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1,
                    )
                },
                modifier = Modifier.height(28.dp),
            )
        }
    }
}

// === Helper functions ===

@Composable
private fun shapeForMessage(message: FloatMessage): androidx.compose.ui.graphics.Shape {
    return when (message.role) {
        "user" -> RoundedCornerShape(
            topStart = 12.dp,
            topEnd = 12.dp,
            bottomStart = 12.dp,
            bottomEnd = 4.dp,
        )
        "ai" -> RoundedCornerShape(
            topStart = 12.dp,
            topEnd = 12.dp,
            bottomStart = 4.dp,
            bottomEnd = 12.dp,
        )
        else -> RoundedCornerShape(8.dp)
    }
}

private fun formatTime(timestamp: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - timestamp
    return when {
        diff < 60_000 -> "just now"
        diff < 3600_000 -> "${diff / 60_000}m ago"
        diff < 86400_000 -> "${diff / 3600_000}h ago"
        else -> {
            val cal = java.util.Calendar.getInstance().apply { timeInMillis = timestamp }
            "%02d:%02d".format(cal.get(java.util.Calendar.HOUR_OF_DAY), cal.get(java.util.Calendar.MINUTE))
        }
    }
}

/**
 * SaveScript dialog wrapper 鈥?renders the SaveScriptDialog composable inside
 * a DialogSurface for the float window.
 */
@Composable
private fun SaveScriptDialogContent(
    episodeSummary: TaskSummary?,
    onSave: (name: String, platform: String, syncToCloud: Boolean, setAsQuickChip: Boolean) -> Unit,
    onDiscard: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface),
        contentAlignment = Alignment.Center,
    ) {
        SaveScriptDialog(
            episodeSummary = episodeSummary,
            onSave = onSave,
            onDiscard = onDiscard,
        )
    }
}

// === ViewModel extensions ===

/**
 * Helper to get quick chips as a composable state.
 */
@Composable
private fun FloatChatViewModel.quickChips(): List<QuickChip> {
    val chips by quickChipManager.chips.collectAsState()
    return chips
}
