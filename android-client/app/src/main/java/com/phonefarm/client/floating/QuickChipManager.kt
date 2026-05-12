package com.phonefarm.client.floating

import com.phonefarm.client.data.local.dao.QuickChipDao
import com.phonefarm.client.data.local.entity.QuickChipEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manager for quick command chips shown in the float chat window.
 *
 * Quick chips are one-tap shortcuts for common VLM tasks, e.g.:
 *   - "Browse recommendations" 鈥?start browsing recommendations
 *   - "Like and follow" 鈥?like and follow users
 *   - "Search and interact" 鈥?search and interact on keyword
 *   - "Post comments" 鈥?post comments
 *
 * Chips are synced from the control server on startup, and users can
 * add custom chips from saved scripts or manually enter them.
 */
@Singleton
class QuickChipManager @Inject constructor(
    private val quickChipDao: QuickChipDao,
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _chips = MutableStateFlow<List<QuickChip>>(emptyList())
    val chips: StateFlow<List<QuickChip>> = _chips.asStateFlow()

    init {
        scope.launch {
            // Load initial chips from DB
            quickChipDao.getAll().collect { entities ->
                _chips.value = entities.map { it.toQuickChip() }
            }
        }
    }

    /**
     * Sync quick chips from the control server.
     *
     * Default chips are defined on the server; custom chips are local-only
     * unless uploaded during script save with syncToCloud=true.
     */
    suspend fun syncFromCloud(cloudChips: List<QuickChip>) {
        // Separate custom chips (local-only) from synced chips
        val currentCustom = _chips.value.filter { !it.isDefault }
        val customById = currentCustom.associateBy { it.id }

        // Upsert all cloud chips
        val cloudEntities = cloudChips.map { chip ->
            QuickChipEntity(
                chipId = chip.id,
                label = chip.label,
                command = chip.command,
                icon = chip.icon,
                category = chip.category,
                isDefault = true,
                sortOrder = chip.sortOrder,
                enabled = chip.enabled,
            )
        }
        quickChipDao.upsertAll(cloudEntities)

        // Preserve custom chips not on the server
        for (custom in currentCustom) {
            quickChipDao.upsert(custom.toEntity())
        }

        // Refresh the flow 鈥?dao getAll will emit new values
    }

    /**
     * Add a new custom quick chip.
     *
     * @param label    Display text on the chip.
     * @param command  The NL task description to send.
     * @param category Grouping category (e.g., "douyin", "general").
     */
    suspend fun addChip(label: String, command: String, category: String) {
        // Determine next sort order
        val currentChips = _chips.value
        val maxOrder = currentChips.maxOfOrNull { it.sortOrder } ?: 0

        val entity = QuickChipEntity(
            chipId = UUID.randomUUID().toString(),
            label = label,
            command = command,
            icon = null,
            category = category,
            isDefault = false,
            sortOrder = maxOrder + 1,
            enabled = true,
        )
        quickChipDao.upsert(entity)
    }

    /**
     * Remove a custom quick chip by ID.
     *
     * Default chips (isDefault=true) cannot be removed, only disabled.
     */
    suspend fun removeChip(id: String) {
        val chip = _chips.value.find { it.id == id } ?: return
        if (chip.isDefault) {
            // Disable default chips instead of deleting
            val updated = QuickChipEntity(
                chipId = chip.id,
                label = chip.label,
                command = chip.command,
                icon = chip.icon,
                category = chip.category,
                isDefault = true,
                sortOrder = chip.sortOrder,
                enabled = false,
            )
            quickChipDao.upsert(updated)
        } else {
            quickChipDao.deleteById(id)
        }
    }

    /**
     * Reorder chips (move fromIndex to toIndex).
     */
    suspend fun reorder(fromIndex: Int, toIndex: Int) {
        val currentList = _chips.value.toMutableList()
        if (fromIndex < 0 || fromIndex >= currentList.size) return
        if (toIndex < 0 || toIndex >= currentList.size) return

        val moved = currentList.removeAt(fromIndex)
        currentList.add(toIndex, moved)

        // Reassign sort orders
        val updatedEntities = currentList.mapIndexed { index, chip ->
            QuickChipEntity(
                chipId = chip.id,
                label = chip.label,
                command = chip.command,
                icon = chip.icon,
                category = chip.category,
                isDefault = chip.isDefault,
                sortOrder = index,
                enabled = chip.enabled,
            )
        }
        quickChipDao.upsertAll(updatedEntities)
    }
}

// === Extensions ===

private fun QuickChipEntity.toQuickChip() = QuickChip(
    id = chipId,
    label = label,
    command = command,
    icon = icon,
    category = category,
    isDefault = isDefault,
    sortOrder = sortOrder,
    enabled = enabled,
)

private fun QuickChip.toEntity() = QuickChipEntity(
    chipId = id,
    label = label,
    command = command,
    icon = icon,
    category = category,
    isDefault = isDefault,
    sortOrder = sortOrder,
    enabled = enabled,
)
