package com.phonefarm.client.permissions

/**
 * Permission state enum used across permission management UI.
 *
 * States:
 *   - [GRANTED]:       Permission is granted and the feature is usable.
 *   - [DENIED]:        Permission is denied; user must be guided to settings.
 *   - [NOT_APPLICABLE]: Permission is not required on this device/API level.
 */
enum class PermissionState {
    GRANTED,
    DENIED,
    NOT_APPLICABLE,
}

/**
 * Human-readable labels and descriptions for each permission key.
 */
object PermissionMetadata {

    /** Permission key → display name. */
    val labels: Map<String, String> = mapOf(
        "accessibility" to "无障碍服务",
        "overlay" to "悬浮窗权限",
        "battery" to "电池优化",
        "notifications" to "通知权限",
        "record_audio" to "录音权限",
        "storage" to "存储权限",
    )

    /** Permission key → description of why it's needed. */
    val descriptions: Map<String, String> = mapOf(
        "accessibility" to "用于执行自动化操作（点击、滑动、输入等）",
        "overlay" to "用于显示悬浮窗助手",
        "battery" to "用于保持后台连接不中断",
        "notifications" to "用于显示任务执行状态通知",
        "record_audio" to "用于语音输入任务指令（可选）",
        "storage" to "用于读写脚本文件和截图",
    )

    /** Permission keys in the recommended display order. */
    val displayOrder: List<String> = listOf(
        "accessibility",
        "overlay",
        "battery",
        "notifications",
        "storage",
        "record_audio",
    )
}
