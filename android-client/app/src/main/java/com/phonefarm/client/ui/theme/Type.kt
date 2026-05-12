package com.phonefarm.client.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Typography = Typography(
    displayLarge = TextStyle(
        fontSize = 28.sp,
        fontWeight = FontWeight.Bold,
        lineHeight = 36.sp
    ),
    headlineLarge = TextStyle(
        fontSize = 24.sp,
        fontWeight = FontWeight.SemiBold,
        lineHeight = 32.sp
    ),
    headlineMedium = TextStyle(
        fontSize = 20.sp,
        fontWeight = FontWeight.SemiBold,
        lineHeight = 28.sp
    ),
    titleLarge = TextStyle(
        fontSize = 20.sp,
        fontWeight = FontWeight.SemiBold,
        lineHeight = 28.sp
    ),
    titleMedium = TextStyle(
        fontSize = 16.sp,
        fontWeight = FontWeight.Medium,
        lineHeight = 24.sp
    ),
    titleSmall = TextStyle(
        fontSize = 14.sp,
        fontWeight = FontWeight.Medium,
        lineHeight = 20.sp
    ),
    bodyLarge = TextStyle(
        fontSize = 16.sp,
        fontWeight = FontWeight.Normal,
        lineHeight = 24.sp
    ),
    bodyMedium = TextStyle(
        fontSize = 14.sp,
        fontWeight = FontWeight.Normal,
        lineHeight = 20.sp
    ),
    bodySmall = TextStyle(
        fontSize = 12.sp,
        fontWeight = FontWeight.Normal,
        lineHeight = 16.sp
    ),
    labelLarge = TextStyle(
        fontSize = 14.sp,
        fontWeight = FontWeight.Medium,
        lineHeight = 20.sp
    ),
    labelMedium = TextStyle(
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        lineHeight = 16.sp
    ),
    labelSmall = TextStyle(
        fontSize = 13.sp,
        fontFamily = FontFamily.Monospace,
        lineHeight = 18.sp
    )
)

/** Responsive type scale — used with fontScale preference. */
fun Typography.scaled(fontScale: Float): Typography {
    if (fontScale == 1.0f) return this
    return Typography(
        displayLarge = displayLarge.copy(fontSize = displayLarge.fontSize * fontScale),
        headlineLarge = headlineLarge.copy(fontSize = headlineLarge.fontSize * fontScale),
        headlineMedium = headlineMedium.copy(fontSize = headlineMedium.fontSize * fontScale),
        titleLarge = titleLarge.copy(fontSize = titleLarge.fontSize * fontScale),
        titleMedium = titleMedium.copy(fontSize = titleMedium.fontSize * fontScale),
        titleSmall = titleSmall.copy(fontSize = titleSmall.fontSize * fontScale),
        bodyLarge = bodyLarge.copy(fontSize = bodyLarge.fontSize * fontScale),
        bodyMedium = bodyMedium.copy(fontSize = bodyMedium.fontSize * fontScale),
        bodySmall = bodySmall.copy(fontSize = bodySmall.fontSize * fontScale),
        labelLarge = labelLarge.copy(fontSize = labelLarge.fontSize * fontScale),
        labelMedium = labelMedium.copy(fontSize = labelMedium.fontSize * fontScale),
        labelSmall = labelSmall.copy(fontSize = labelSmall.fontSize * fontScale),
    )
}
