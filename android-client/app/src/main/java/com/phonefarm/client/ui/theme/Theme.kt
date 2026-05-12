package com.phonefarm.client.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

val LocalAccentColor = compositionLocalOf { AccentColor.OCEAN_BLUE }
val LocalFontScale = compositionLocalOf { 1.0f }
val LocalGlassEnabled = compositionLocalOf { true }

private fun buildLightScheme(accent: AccentColor) = lightColorScheme(
    primary = accent.color,
    onPrimary = Color.White,
    primaryContainer = accent.color.copy(alpha = 0.12f),
    onPrimaryContainer = accent.color,
    secondary = Secondary,
    onSecondary = Color.White,
    secondaryContainer = SecondaryVariant,
    background = BackgroundLight,
    onBackground = OnSurfaceLight,
    surface = SurfaceLight,
    onSurface = OnSurfaceLight,
    onSurfaceVariant = OnSurfaceVariantLight,
    surfaceVariant = Color(0xFFF0F0F3),
    error = Error,
    onError = Color.White,
    errorContainer = Error.copy(alpha = 0.1f),
    onErrorContainer = Error,
    outline = OutlineLight,
    outlineVariant = OutlineLight,
)

private fun buildDarkScheme(accent: AccentColor) = darkColorScheme(
    primary = when (accent) {
        AccentColor.OCEAN_BLUE -> AccentBlueDark
        AccentColor.EMERALD -> AccentEmeraldDark
        AccentColor.VIOLET -> AccentVioletDark
        AccentColor.AMBER -> AccentAmberDark
    },
    onPrimary = Color(0xFF0D2137),
    primaryContainer = accent.color.copy(alpha = 0.2f),
    onPrimaryContainer = when (accent) {
        AccentColor.OCEAN_BLUE -> AccentBlueDark
        AccentColor.EMERALD -> AccentEmeraldDark
        AccentColor.VIOLET -> AccentVioletDark
        AccentColor.AMBER -> AccentAmberDark
    },
    secondary = SecondaryDark,
    onSecondary = Color(0xFF003540),
    secondaryContainer = Secondary,
    background = BackgroundDark,
    onBackground = OnSurfaceDark,
    surface = SurfaceDark,
    onSurface = OnSurfaceDark,
    onSurfaceVariant = OnSurfaceVariantDark,
    surfaceVariant = Color(0xFF2C2C2E),
    error = ErrorDark,
    onError = Color(0xFF3E0A0A),
    errorContainer = ErrorDark.copy(alpha = 0.2f),
    onErrorContainer = ErrorDark,
    outline = OutlineDark,
    outlineVariant = OutlineDark,
)

@Composable
fun PhoneFarmTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    accent: AccentColor = AccentColor.OCEAN_BLUE,
    fontScale: Float = 1.0f,
    glassEnabled: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) buildDarkScheme(accent) else buildLightScheme(accent)

    val typography = if (fontScale != 1.0f) Typography.scaled(fontScale) else Typography

    MaterialTheme(
        colorScheme = colorScheme,
        typography = typography,
        content = {
            androidx.compose.runtime.CompositionLocalProvider(
                LocalAccentColor provides accent,
                LocalFontScale provides fontScale,
                LocalGlassEnabled provides glassEnabled,
            ) {
                content()
            }
        },
    )
}
