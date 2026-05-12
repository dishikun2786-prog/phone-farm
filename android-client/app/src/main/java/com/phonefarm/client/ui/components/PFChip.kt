package com.phonefarm.client.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun PFChip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
    selectedColor: Color = MaterialTheme.colorScheme.primary,
    unselectedColor: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    height: Dp = 32.dp,
    shape: Shape = RoundedCornerShape(50)
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        modifier = modifier.height(height),
        shape = shape,
        label = {
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = if (selected) FontWeight.Medium else FontWeight.Normal,
                maxLines = 1
            )
        },
        leadingIcon = if (leadingIcon != null) {
            { Icon(leadingIcon, contentDescription = null, modifier = Modifier.size(16.dp)) }
        } else null,
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = selectedColor.copy(alpha = 0.15f),
            selectedLabelColor = selectedColor,
            selectedLeadingIconColor = selectedColor
        ),
        border = FilterChipDefaults.filterChipBorder(
            borderColor = if (selected) selectedColor else MaterialTheme.colorScheme.outline,
            selectedBorderColor = selectedColor,
            enabled = true,
            selected = selected
        )
    )
}

@Composable
fun PFAssistChip(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingIcon: @Composable (() -> Unit)? = null
) {
    AssistChip(
        onClick = onClick,
        modifier = modifier,
        label = {
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium
            )
        },
        leadingIcon = leadingIcon
    )
}

@Composable
fun PFSuggestionChip(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingIcon: @Composable (() -> Unit)? = null
) {
    SuggestionChip(
        onClick = onClick,
        modifier = modifier,
        label = {
            Text(
                text = text,
                style = MaterialTheme.typography.labelMedium
            )
        },
        icon = leadingIcon
    )
}
