package com.phonefarm.client.ui.components

import androidx.compose.animation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

enum class PFButtonState {
    ENABLED, PRESSED, DISABLED, LOADING
}

@Composable
fun PFButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    state: PFButtonState = PFButtonState.ENABLED,
    containerColor: Color = MaterialTheme.colorScheme.primary,
    contentColor: Color = MaterialTheme.colorScheme.onPrimary,
    shape: Shape = RoundedCornerShape(24.dp),
    height: Dp = 48.dp,
    leadingIcon: @Composable (() -> Unit)? = null
) {
    Button(
        onClick = onClick,
        modifier = modifier
            .height(height)
            .defaultMinSize(minWidth = 64.dp),
        shape = shape,
        enabled = state == PFButtonState.ENABLED || state == PFButtonState.PRESSED,
        colors = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor = contentColor,
            disabledContainerColor = containerColor.copy(alpha = 0.4f),
            disabledContentColor = contentColor.copy(alpha = 0.6f)
        ),
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 0.dp)
    ) {
        if (state == PFButtonState.LOADING) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                color = contentColor,
                strokeWidth = 2.dp
            )
            Spacer(modifier = Modifier.width(8.dp))
        }

        if (leadingIcon != null) {
            leadingIcon()
            Spacer(modifier = Modifier.width(8.dp))
        }

        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
fun PFPillButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isLoading: Boolean = false,
    containerColor: Color = MaterialTheme.colorScheme.primary,
    contentColor: Color = MaterialTheme.colorScheme.onPrimary
) {
    PFButton(
        text = text,
        onClick = onClick,
        modifier = modifier,
        state = when {
            isLoading -> PFButtonState.LOADING
            !enabled -> PFButtonState.DISABLED
            else -> PFButtonState.ENABLED
        },
        containerColor = containerColor,
        contentColor = contentColor,
        shape = RoundedCornerShape(50)
    )
}
