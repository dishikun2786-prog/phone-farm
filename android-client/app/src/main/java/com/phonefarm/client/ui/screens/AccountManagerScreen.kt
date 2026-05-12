package com.phonefarm.client.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phonefarm.client.ui.theme.Success
import com.phonefarm.client.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PlatformAccount(
    val id: String,
    val platform: String, // 抖音, 快手, 微信, 小红书
    val avatar: String = "",
    val nickname: String,
    val isLoggedIn: Boolean,
    val lastActive: String,
    val followers: Int = 0,
    val following: Int = 0
)

data class AccountManagerUiState(
    val selectedTab: Int = 0,
    val platformTabs: List<String> = listOf("抖音", "快手", "微信", "小红书"),
    val accounts: Map<String, List<PlatformAccount>> = emptyMap(),
    val isLoading: Boolean = true
)

@HiltViewModel
class AccountManagerViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(AccountManagerUiState())
    val uiState: StateFlow<AccountManagerUiState> = _uiState.asStateFlow()

    init {
        loadAccounts()
    }

    fun loadAccounts() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            delay(500)

            // TODO: Load from repository
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                accounts = mapOf(
                    "抖音" to listOf(
                        PlatformAccount("a1", "抖音", "", "科技达人@小明", true, "2小时前", 12500, 230),
                        PlatformAccount("a2", "抖音", "", "美食探店@小红", true, "30分钟前", 8900, 120)
                    ),
                    "快手" to listOf(
                        PlatformAccount("a3", "快手", "", "游戏主播@老张", true, "1天前", 34000, 500)
                    ),
                    "微信" to listOf(
                        PlatformAccount("a4", "微信", "", "营销号001", true, "5分钟前", 1200, 45)
                    ),
                    "小红书" to emptyList()
                )
            )
        }
    }

    fun selectTab(index: Int) {
        _uiState.value = _uiState.value.copy(selectedTab = index)
    }

    fun logoutAccount(accountId: String) {
        viewModelScope.launch {
            // TODO: Logout account
        }
    }

    fun addAccount(platform: String) {
        // TODO: Open WebView login flow
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountManagerScreen(
    onBack: () -> Unit,
    onAddAccount: (String) -> Unit,
    viewModel: AccountManagerViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val pagerState = rememberPagerState(pageCount = { state.platformTabs.size })

    LaunchedEffect(state.selectedTab) {
        pagerState.animateScrollToPage(state.selectedTab)
    }
    LaunchedEffect(pagerState.currentPage) {
        viewModel.selectTab(pagerState.currentPage)
    }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = { Text("账号管理") },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                        }
                    },
                    actions = {
                        IconButton(onClick = {
                            val currentPlatform = state.platformTabs.getOrElse(state.selectedTab) { "抖音" }
                            onAddAccount(currentPlatform)
                        }) {
                            Icon(Icons.Default.PersonAdd, contentDescription = "添加账号")
                        }
                    }
                )

                TabRow(selectedTabIndex = state.selectedTab) {
                    state.platformTabs.forEachIndexed { index, platform ->
                        Tab(
                            selected = state.selectedTab == index,
                            onClick = { viewModel.selectTab(index) },
                            text = {
                                Text(
                                    text = platform,
                                    fontWeight = if (state.selectedTab == index) FontWeight.Medium else FontWeight.Normal
                                )
                            }
                        )
                    }
                }
            }
        }
    ) { padding ->
        if (state.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            HorizontalPager(
                state = pagerState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) { page ->
                val platform = state.platformTabs[page]
                val accounts = state.accounts[platform] ?: emptyList()

                if (accounts.isEmpty()) {
                    EmptyAccountsState(
                        platform = platform,
                        onAddAccount = { onAddAccount(platform) }
                    )
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        // Header with count and add button
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "${accounts.size} 个账号",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                TextButton(onClick = { onAddAccount(platform) }) {
                                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("添加账号")
                                }
                            }
                        }

                        items(accounts) { account ->
                            AccountCard(
                                account = account,
                                onLogout = { viewModel.logoutAccount(account.id) }
                            )
                        }

                        item { Spacer(modifier = Modifier.height(16.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyAccountsState(
    platform: String,
    onAddAccount: () -> Unit
) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp)
        ) {
            Icon(
                Icons.Default.PeopleOutline,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "暂无${platform}账号",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "添加账号后可进行自动化营销操作",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(24.dp))
            Button(onClick = onAddAccount) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("添加账号")
            }
        }
    }
}

@Composable
private fun AccountCard(
    account: PlatformAccount,
    onLogout: () -> Unit
) {
    val platformColor = when (account.platform) {
        "抖音" -> androidx.compose.ui.graphics.Color(0xFF000000)
        "快手" -> Warning
        "微信" -> Success
        "小红书" -> androidx.compose.ui.graphics.Color(0xFFFF2442)
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Avatar placeholder
            Surface(
                modifier = Modifier.size(48.dp),
                shape = MaterialTheme.shapes.large,
                color = platformColor.copy(alpha = 0.1f)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = account.nickname.take(1),
                        style = MaterialTheme.typography.titleMedium,
                        color = platformColor,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = account.nickname,
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Surface(
                        shape = MaterialTheme.shapes.small,
                        color = platformColor.copy(alpha = 0.1f)
                    ) {
                        Text(
                            text = account.platform,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = platformColor
                        )
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                Row(
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(
                        text = "粉丝: ${formatCount(account.followers)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = "关注: ${formatCount(account.following)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Spacer(modifier = Modifier.height(2.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        modifier = Modifier.size(6.dp),
                        shape = MaterialTheme.shapes.extraSmall,
                        color = if (account.isLoggedIn) Success else MaterialTheme.colorScheme.error
                    ) {}
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = if (account.isLoggedIn) "已登录" else "已登出",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "最近: ${account.lastActive}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            IconButton(onClick = onLogout) {
                Icon(
                    Icons.Default.Logout,
                    contentDescription = "登出",
                    tint = MaterialTheme.colorScheme.error
                )
            }
        }
    }
}

private fun formatCount(count: Int): String {
    return when {
        count >= 10000 -> "${"%.1f".format(count / 10000f)}万"
        count >= 1000 -> "${"%.1f".format(count / 1000f)}k"
        else -> count.toString()
    }
}
