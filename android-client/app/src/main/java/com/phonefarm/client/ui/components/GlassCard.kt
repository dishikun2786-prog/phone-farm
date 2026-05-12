package com.phonefarm.client.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.phonefarm.client.ui.theme.GlassTokens

@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    shape: Shape = GlassTokens.SHAPE_MEDIUM,
    alpha: Float = GlassTokens.SURFACE_ALPHA,
    tonalElevation: Dp = 2.dp,
    shadowElevation: Dp = 1.dp,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = shape,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = alpha),
        tonalElevation = tonalElevation,
        shadowElevation = shadowElevation,
        content = content,
    )
}

@Composable
fun GlassDialog(
    modifier: Modifier = Modifier,
    alpha: Float = GlassTokens.SURFACE_ALPHA_STRONG,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = GlassTokens.SHAPE_LARGE,
        color = MaterialTheme.colorScheme.surface.copy(alpha = alpha),
        tonalElevation = 6.dp,
        shadowElevation = 12.dp,
        content = content,
    )
}

@Composable
fun GlassInput(
    modifier: Modifier = Modifier,
    alpha: Float = GlassTokens.SURFACE_ALPHA,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = GlassTokens.SHAPE_SMALL,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = alpha),
        tonalElevation = 1.dp,
        shadowElevation = 0.dp,
        content = content,
    )
}

@Composable
fun SectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onBackground,
        )
        action?.invoke()
    }
}
