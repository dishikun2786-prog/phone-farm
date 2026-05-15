package com.phonefarm.client.assistant

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.phonefarm.client.ui.theme.Error
import com.phonefarm.client.ui.theme.Success
import com.phonefarm.client.ui.theme.Warning

/**
 * Compact credit balance indicator bar shown at the top of the chat screen.
 */
@Composable
fun CreditBalanceBar(
    creditManager: CreditManager,
    modifier: Modifier = Modifier,
) {
    val balance by creditManager.balance.collectAsState()

    val barColor by animateColorAsState(
        targetValue = when {
            balance <= 0 -> Error
            balance < 5 -> Warning
            else -> Success
        },
        label = "creditColor",
    )

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(barColor.copy(alpha = 0.1f))
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Start,
    ) {
        Icon(
            imageVector = Icons.Default.Bolt,
            contentDescription = "Credits",
            tint = barColor,
            modifier = Modifier.size(18.dp),
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = "$balance credits",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = barColor,
        )
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = when {
                balance <= 0 -> "Top up needed"
                balance < 5 -> "Running low"
                else -> "Active"
            },
            style = MaterialTheme.typography.labelSmall,
            color = barColor.copy(alpha = 0.7f),
        )
    }
}
