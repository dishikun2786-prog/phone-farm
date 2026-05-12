package com.phonefarm.client.ui.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@Composable
fun LoadingOverlay(
    isVisible: Boolean,
    message: String = "加载中...",
    modifier: Modifier = Modifier,
    backgroundColor: Color = MaterialTheme.colorScheme.background.copy(alpha = 0.85f),
    spinnerColor: Color = MaterialTheme.colorScheme.primary,
    showProgress: Boolean = false,
    progress: Float = 0f
) {
    AnimatedVisibility(
        visible = isVisible,
        enter = fadeIn(animationSpec = androidx.compose.animation.core.tween(200)),
        exit = fadeOut(animationSpec = androidx.compose.animation.core.tween(200))
    ) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(backgroundColor),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
                modifier = Modifier.padding(32.dp)
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(40.dp),
                    color = spinnerColor,
                    strokeWidth = 3.dp
                )

                Spacer(modifier = Modifier.height(24.dp))

                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                    textAlign = TextAlign.Center
                )

                if (showProgress) {
                    Spacer(modifier = Modifier.height(16.dp))
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .fillMaxWidth(0.6f)
                            .height(4.dp),
                        color = spinnerColor,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "${(progress * 100).toInt()}%",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
fun FullScreenLoading(
    message: String = "加载中...",
    showProgress: Boolean = false,
    progress: Float = 0f
) {
    LoadingOverlay(
        isVisible = true,
        message = message,
        showProgress = showProgress,
        progress = progress
    )
}
