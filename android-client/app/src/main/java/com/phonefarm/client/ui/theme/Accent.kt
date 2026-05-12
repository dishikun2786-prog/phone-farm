package com.phonefarm.client.ui.theme

import androidx.compose.ui.graphics.Color

enum class AccentColor(val color: Color, val label: String) {
    OCEAN_BLUE(Color(0xFF1565C0), "海洋蓝"),
    EMERALD(Color(0xFF2E7D32), "翡翠绿"),
    VIOLET(Color(0xFF7B1FA2), "紫水晶"),
    AMBER(Color(0xFFE65100), "琥珀橙"),
}

object AccentPalette {
    fun primary(accent: AccentColor): Color = accent.color
    fun primaryVariant(accent: AccentColor): Color = accent.color.copy(alpha = 0.7f)
    fun primaryContainer(accent: AccentColor): Color = accent.color.copy(alpha = 0.12f)
    fun onPrimaryContainer(accent: AccentColor): Color = accent.color
}
