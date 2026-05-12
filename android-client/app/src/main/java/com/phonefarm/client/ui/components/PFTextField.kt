package com.phonefarm.client.ui.components

import androidx.compose.animation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

enum class PFTextFieldState {
    IDLE, FOCUSED, ERROR, DISABLED
}

@Composable
fun PFTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String? = null,
    state: PFTextFieldState = PFTextFieldState.IDLE,
    errorMessage: String? = null,
    supportingText: String? = null,
    prefixIcon: ImageVector? = null,
    suffixIcon: ImageVector? = null,
    onSuffixClick: (() -> Unit)? = null,
    isPassword: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: androidx.compose.ui.text.input.ImeAction = androidx.compose.ui.text.input.ImeAction.Default,
    onImeAction: (() -> Unit)? = null,
    singleLine: Boolean = true,
    height: Dp = 56.dp,
    enabled: Boolean = true
) {
    var passwordVisible by remember { mutableStateOf(false) }

    Column(modifier = modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .height(height),
            label = if (label != null) ({ Text(label) }) else null,
            placeholder = if (placeholder != null) ({ Text(placeholder) }) else null,
            leadingIcon = if (prefixIcon != null) ({
                Icon(
                    prefixIcon,
                    contentDescription = null,
                    tint = when {
                        state == PFTextFieldState.ERROR -> MaterialTheme.colorScheme.error
                        state == PFTextFieldState.FOCUSED -> MaterialTheme.colorScheme.primary
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    }
                )
            }) else null,
            trailingIcon = when {
                isPassword -> ({
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = null
                        )
                    }
                })
                value.isNotEmpty() && state != PFTextFieldState.DISABLED -> ({
                    IconButton(onClick = { onValueChange("") }) {
                        Icon(
                            Icons.Default.Clear,
                            contentDescription = "清除",
                            modifier = Modifier.size(18.dp)
                        )
                    }
                })
                suffixIcon != null -> ({
                    if (onSuffixClick != null) {
                        IconButton(onClick = onSuffixClick) {
                            Icon(suffixIcon, contentDescription = null)
                        }
                    } else {
                        Icon(
                            suffixIcon,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                })
                else -> null
            },
            visualTransformation = if (isPassword && !passwordVisible) PasswordVisualTransformation() else VisualTransformation.None,
            singleLine = singleLine,
            enabled = enabled && state != PFTextFieldState.DISABLED,
            isError = state == PFTextFieldState.ERROR,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
            keyboardActions = KeyboardActions(
                onDone = { onImeAction?.invoke() }
            ),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                errorBorderColor = MaterialTheme.colorScheme.error,
                disabledBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
            ),
            shape = MaterialTheme.shapes.small
        )

        // Supporting/error text
        AnimatedVisibility(
            visible = errorMessage != null || supportingText != null,
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically()
        ) {
            val displayText = errorMessage ?: supportingText
            if (displayText != null) {
                Text(
                    text = displayText,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (errorMessage != null) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 16.dp, top = 4.dp)
                )
            }
        }
    }
}
