package com.phonefarm.client.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.phonefarm.client.ui.theme.AccentColor

@Composable
fun AccentPicker(
    currentAccent: AccentColor,
    onAccentSelected: (AccentColor) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "强调色",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )

        AccentColor.entries.forEach { accent ->
            val isSelected = accent == currentAccent

            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(accent.color)
                    .then(
                        if (isSelected) Modifier.border(3.dp, Color.White, CircleShape)
                            .then(Modifier.border(5.dp, accent.color.copy(alpha = 0.5f), CircleShape))
                        else Modifier
                    )
                    .clickable { onAccentSelected(accent) },
                contentAlignment = Alignment.Center,
            ) {
                if (isSelected) {
                    Text("✓", color = Color.White, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}
