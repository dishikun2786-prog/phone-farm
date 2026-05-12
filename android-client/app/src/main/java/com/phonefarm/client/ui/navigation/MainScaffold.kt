package com.phonefarm.client.ui.navigation

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

enum class BottomTab(val label: String, val icon: ImageVector) {
    HOME("首页", Icons.Default.Home),
    TASKS("任务", Icons.Default.Assignment),
    SETTINGS("设置", Icons.Default.Settings),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScaffold(
    currentTab: BottomTab,
    onTabSelected: (BottomTab) -> Unit,
    topBarTitle: String,
    topBarActions: @Composable RowScope.() -> Unit = {},
    floatingActionButton: @Composable () -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = topBarTitle,
                        style = MaterialTheme.typography.titleLarge,
                    )
                },
                actions = topBarActions,
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.9f),
                ),
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
                tonalElevation = 4.dp,
            ) {
                BottomTab.entries.forEach { tab ->
                    val selected = currentTab == tab
                    NavigationBarItem(
                        selected = selected,
                        onClick = { onTabSelected(tab) },
                        icon = {
                            if (selected) {
                                Icon(tab.icon, contentDescription = tab.label)
                            } else {
                                Icon(
                                    when (tab) {
                                        BottomTab.HOME -> Icons.Default.Home
                                        BottomTab.TASKS -> Icons.Default.Assignment
                                        BottomTab.SETTINGS -> Icons.Default.Settings
                                    },
                                    contentDescription = tab.label,
                                )
                            }
                        },
                        label = { Text(tab.label, style = MaterialTheme.typography.labelSmall) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.primary,
                            selectedTextColor = MaterialTheme.colorScheme.primary,
                            indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                        ),
                    )
                }
            }
        },
        floatingActionButton = floatingActionButton,
        content = content,
    )
}
