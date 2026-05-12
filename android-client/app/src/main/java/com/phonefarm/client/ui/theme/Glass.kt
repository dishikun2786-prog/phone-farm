package com.phonefarm.client.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Liquid glass design tokens — inspired by Operit's 液态玻璃 visual language. */
object GlassTokens {
    /** Default blur proxy — alpha-based since Compose doesn't support real backdrop blur without native. */
    const val SURFACE_ALPHA = 0.72f
    const val SURFACE_ALPHA_STRONG = 0.85f
    const val BORDER_ALPHA = 0.12f
    val ELEVATION: Dp = 4.dp
    val SHAPE_LARGE: Shape = RoundedCornerShape(16.dp)
    val SHAPE_MEDIUM: Shape = RoundedCornerShape(12.dp)
    val SHAPE_SMALL: Shape = RoundedCornerShape(8.dp)
    val SHAPE_BUBBLE: Shape = CircleShape
}

/**
 * Glass-effect surface composable.
 *
 * Uses alpha transparency to approximate the liquid glass look since
 * real backdrop blur requires native RenderEffect (API 31+) or
 * RenderScript. Falls back gracefully on older devices.
 */
@Composable
fun GlassSurface(
    modifier: Modifier = Modifier,
    shape: Shape = GlassTokens.SHAPE_MEDIUM,
    alpha: Float = GlassTokens.SURFACE_ALPHA,
    tonalElevation: Dp = GlassTokens.ELEVATION,
    shadowElevation: Dp = 2.dp,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = shape,
        color = MaterialTheme.colorScheme.surface.copy(alpha = alpha),
        tonalElevation = tonalElevation,
        shadowElevation = shadowElevation,
        content = content,
    )
}

@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    shape: Shape = GlassTokens.SHAPE_MEDIUM,
    alpha: Float = GlassTokens.SURFACE_ALPHA,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = shape,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = alpha),
        tonalElevation = 2.dp,
        shadowElevation = 1.dp,
        content = content,
    )
}

@Composable
fun GlassBubble(
    modifier: Modifier = Modifier,
    alpha: Float = GlassTokens.SURFACE_ALPHA_STRONG,
    contentColor: Color = MaterialTheme.colorScheme.primary,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = GlassTokens.SHAPE_BUBBLE,
        color = MaterialTheme.colorScheme.surface.copy(alpha = alpha),
        tonalElevation = GlassTokens.ELEVATION,
        shadowElevation = 8.dp,
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
fun GlassDivider(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(0.5.dp))
            .background(MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
    )
}
