package com.phonefarm.client.floating

data class QuickChip(
    val id: String,
    val label: String,
    val command: String,
    val icon: String?,
    val category: String,
    val isDefault: Boolean,
    val sortOrder: Int,
    val enabled: Boolean = true,
)
