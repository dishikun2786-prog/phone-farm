package com.phonefarm.client.ui.screens

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.animation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.phonefarm.client.ui.theme.Error
import com.phonefarm.client.ui.theme.Success
import com.phonefarm.client.ui.theme.Warning
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class PermissionItem {
    ACCESSIBILITY, OVERLAY, BATTERY, NOTIFICATION
}

data class PermissionState(
    val item: PermissionItem,
    val isAuthorized: Boolean,
    val title: String,
    val description: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector
)

data class PermissionGuideUiState(
    val currentStep: Int = 0,
    val permissions: List<PermissionState> = listOf(
        PermissionState(PermissionItem.ACCESSIBILITY, false, "无障碍服务", "允许自动化脚本模拟用户操作，必需开启后方可使用自动化功能", Icons.Default.Accessibility),
        PermissionState(PermissionItem.OVERLAY, false, "悬浮窗权限", "允许显示悬浮窗控制面板和执行状态指示", Icons.Default.Layers),
        PermissionState(PermissionItem.BATTERY, false, "电池优化白名单", "防止系统在后台终止自动化脚本运行", Icons.Default.BatterySaver),
        PermissionState(PermissionItem.NOTIFICATION, false, "通知权限", "接收任务完成、异常报警等重要通知", Icons.Default.NotificationsActive)
    ),
    val allGranted: Boolean = false
)

@HiltViewModel
class PermissionGuideViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(PermissionGuideUiState())
    val uiState: StateFlow<PermissionGuideUiState> = _uiState.asStateFlow()

    fun refreshPermissions(context: Context) {
        viewModelScope.launch {
            val updated = _uiState.value.permissions.map { perm ->
                perm.copy(isAuthorized = checkPermission(context, perm.item))
            }
            val allGranted = updated.all { it.isAuthorized }
            val firstPending = updated.indexOfFirst { !it.isAuthorized }.coerceAtLeast(0)
            _uiState.value = _uiState.value.copy(
                permissions = updated,
                allGranted = allGranted,
                currentStep = if (allGranted) 4 else firstPending
            )
        }
    }

    private suspend fun checkPermission(context: Context, item: PermissionItem): Boolean {
        // Simulate permission check - TODO: Implement actual checks
        delay(200)
        return when (item) {
            PermissionItem.ACCESSIBILITY -> false
            PermissionItem.OVERLAY -> Settings.canDrawOverlays(context)
            PermissionItem.BATTERY -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                    pm.isIgnoringBatteryOptimizations(context.packageName)
                } else true
            }
            PermissionItem.NOTIFICATION -> true // Simplified
        }
    }

    fun getPermissionIntent(context: Context, item: PermissionItem): Intent {
        return when (item) {
            PermissionItem.ACCESSIBILITY -> {
                Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            }
            PermissionItem.OVERLAY -> {
                Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${context.packageName}")
                )
            }
            PermissionItem.BATTERY -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:${context.packageName}")
                    }
                } else {
                    Intent(Settings.ACTION_SETTINGS)
                }
            }
            PermissionItem.NOTIFICATION -> {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PermissionGuideScreen(
    onAllComplete: () -> Unit,
    viewModel: PermissionGuideViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        viewModel.refreshPermissions(context)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("权限配置") }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Step indicator
            StepIndicator(
                currentStep = state.currentStep,
                totalSteps = 4,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp)
            )

            // Permission cards
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                state.permissions.forEachIndexed { index, permission ->
                    PermissionCard(
                        permission = permission,
                        stepNumber = index + 1,
                        isCurrent = index == state.currentStep,
                        onOpenSettings = {
                            val intent = viewModel.getPermissionIntent(context, permission.item)
                            context.startActivity(intent)
                        }
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))
            }

            // Bottom button
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shadowElevation = 8.dp
            ) {
                Button(
                    onClick = onAllComplete,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                        .height(48.dp),
                    shape = MaterialTheme.shapes.medium,
                    enabled = state.allGranted
                ) {
                    Text("全部完成，进入主页")
                }
            }
        }
    }
}

@Composable
private fun StepIndicator(
    currentStep: Int,
    totalSteps: Int,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        for (i in 0 until totalSteps) {
            val isActive = i <= currentStep
            val color = if (isActive) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.outlineVariant

            Surface(
                modifier = Modifier.size(if (isActive) 12.dp else 10.dp),
                shape = MaterialTheme.shapes.extraSmall,
                color = color
            ) {}

            if (i < totalSteps - 1) {
                Spacer(modifier = Modifier.width(16.dp))
                HorizontalDivider(
                    modifier = Modifier.width(32.dp),
                    thickness = 2.dp,
                    color = color
                )
                Spacer(modifier = Modifier.width(16.dp))
            }
        }
    }
}

@Composable
private fun PermissionCard(
    permission: PermissionState,
    stepNumber: Int,
    isCurrent: Boolean,
    onOpenSettings: () -> Unit
) {
    val borderColor = when {
        permission.isAuthorized -> Success.copy(alpha = 0.3f)
        isCurrent -> MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
        else -> MaterialTheme.colorScheme.outlineVariant
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        border = if (isCurrent)
            androidx.compose.foundation.BorderStroke(1.dp, borderColor)
        else null
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Step number / Status icon
            Surface(
                modifier = Modifier.size(40.dp),
                shape = MaterialTheme.shapes.medium,
                color = when {
                    permission.isAuthorized -> Success.copy(alpha = 0.15f)
                    isCurrent -> MaterialTheme.colorScheme.primaryContainer
                    else -> MaterialTheme.colorScheme.surfaceVariant
                }
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (permission.isAuthorized) {
                        Icon(
                            Icons.Default.Check,
                            contentDescription = null,
                            tint = Success,
                            modifier = Modifier.size(24.dp)
                        )
                    } else {
                        Icon(
                            permission.icon,
                            contentDescription = null,
                            tint = if (isCurrent) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "步骤 $stepNumber: ${permission.title}",
                        style = MaterialTheme.typography.titleSmall,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Surface(
                        shape = MaterialTheme.shapes.small,
                        color = if (permission.isAuthorized)
                            Success.copy(alpha = 0.15f)
                        else
                            Warning.copy(alpha = 0.15f)
                    ) {
                        Text(
                            text = if (permission.isAuthorized) "已授权" else "待授权",
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (permission.isAuthorized) Success else Warning,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = permission.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        if (!permission.isAuthorized) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

            Button(
                onClick = onOpenSettings,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                shape = MaterialTheme.shapes.small
            ) {
                Text("去开启")
            }
        }
    }
}
