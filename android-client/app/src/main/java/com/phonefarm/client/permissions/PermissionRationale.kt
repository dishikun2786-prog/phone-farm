package com.phonefarm.client.permissions

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Permission rationale dialog composables.
 *
 * Android best practice: show a rationale dialog BEFORE requesting a permission
 * if the user has previously denied it. This gives context for WHY the
 * permission is needed and increases grant rates.
 *
 * Each composable follows the Material 3 AlertDialog pattern:
 *   - Title: permission name
 *   - Text: explanation of why the permission is needed
 *   - Confirm button: "去设置" → opens settings
 *   - Dismiss button: "稍后" → postpone
 */

/**
 * Rationale for Accessibility Service.
 *
 * The accessibility service is the most critical permission — without it,
 * PhoneFarm cannot perform any UI automation (clicks, swipes, text input).
 */
@Composable
fun AccessibilityRationaleDialog(
    onAccept: () -> Unit,
    onDismiss: () -> Unit,
) {
    // TODO: Show AlertDialog explaining:
    //  "PhoneFarm 需要无障碍服务权限以自动执行手机操作。
    //   我们不会收集您的个人数据，仅用于执行自动化任务。
    //   开启后请找到 PhoneFarm 并打开开关。"
    //  Confirm: "去设置" → onAccept()
    //  Dismiss: "稍后" → onDismiss()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("开启无障碍服务") },
        text = {
            Text(
                "PhoneFarm 需要无障碍服务权限以自动执行手机操作。" +
                "我们不会收集您的个人数据，仅用于执行自动化任务。\n\n" +
                "开启后请在无障碍设置中找到 PhoneFarm 并打开开关。"
            )
        },
        confirmButton = {
            Button(onClick = onAccept) { Text("去设置") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("稍后") }
        },
    )
}

/**
 * Rationale for overlay (SYSTEM_ALERT_WINDOW) permission.
 */
@Composable
fun OverlayRationaleDialog(
    onAccept: () -> Unit,
    onDismiss: () -> Unit,
) {
    // TODO: Show AlertDialog explaining:
    //  "悬浮窗权限用于显示 AI 助手和任务执行状态。
    //   您可以通过悬浮窗快速下达任务指令和查看执行进度。"
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("开启悬浮窗权限") },
        text = {
            Text(
                "悬浮窗权限用于显示 AI 助手和任务执行状态。" +
                "您可以通过悬浮窗快速下达任务指令和查看执行进度。"
            )
        },
        confirmButton = {
            Button(onClick = onAccept) { Text("去设置") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("稍后") }
        },
    )
}

/**
 * Rationale for battery optimization exemption.
 */
@Composable
fun BatteryRationaleDialog(
    onAccept: () -> Unit,
    onDismiss: () -> Unit,
) {
    // TODO: Show AlertDialog explaining:
    //  "关闭电池优化可以防止系统在后台终止 PhoneFarm 的连接。
    //   这能确保您的手机持续接收和执行任务。"
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("关闭电池优化") },
        text = {
            Text(
                "关闭电池优化可以防止系统在后台终止 PhoneFarm 的连接。" +
                "这能确保您的手机持续接收和执行任务。"
            )
        },
        confirmButton = {
            Button(onClick = onAccept) { Text("去设置") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("稍后") }
        },
    )
}

/**
 * Rationale for notification permission (Android 13+).
 */
@Composable
fun NotificationRationaleDialog(
    onAccept: () -> Unit,
    onDismiss: () -> Unit,
) {
    // TODO: Show AlertDialog explaining why notifications are needed
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("开启通知权限") },
        text = {
            Text(
                "通知权限用于显示任务执行状态和结果。" +
                "PhoneFarm 需要保持前台服务通知以正常运行。"
            )
        },
        confirmButton = {
            Button(onClick = onAccept) { Text("去设置") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("稍后") }
        },
    )
}
