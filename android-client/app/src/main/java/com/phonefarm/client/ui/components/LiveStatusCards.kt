package com.phonefarm.client.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

data class StatusCardData(
    val label: String,
    val value: String,
    val icon: String,
    val color: Color,
)

@Composable
fun LiveStatusCards(
    cards: List<StatusCardData>,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(cards) { card ->
            StatusCard(card = card)
        }
    }
}

@Composable
private fun StatusCard(card: StatusCardData) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = card.color.copy(alpha = 0.08f),
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                modifier = Modifier.size(36.dp),
                shape = RoundedCornerShape(10.dp),
                color = card.color.copy(alpha = 0.15f),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(text = card.icon, style = MaterialTheme.typography.titleMedium)
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column {
                Text(
                    text = card.value,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = card.color,
                )
                Text(
                    text = card.label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
