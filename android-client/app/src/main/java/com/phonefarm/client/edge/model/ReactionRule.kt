package com.phonefarm.client.edge.model

/**
 * 本地快速反应规则。
 *
 * 内置规则在 APK 内硬编码，云端规则通过 WebSocket reaction_rules_update 下发。
 */
data class ReactionRule(
    val id: String,
    val scenario: String,
    val conditions: RuleConditions,
    val autoAction: DeviceAction,
    val confidence: Float,
    val enabled: Boolean,
    val source: RuleSource
)

data class RuleConditions(
    /** 弹窗关键词匹配 (任意匹配) */
    val popupKeywords: List<String> = emptyList(),
    /** 页面变化率阈值 */
    val maxChangeRatio: Float = 1.0f,
    /** 是否检测到键盘 */
    val keyboardVisible: Boolean? = null,
    /** Applicable page types (empty = all) */
    val pageTypes: List<PageType> = emptyList(),
    /** 当前应用包名匹配 */
    val appPackages: List<String> = emptyList()
)

enum class RuleSource {
    BUILTIN,
    CLOUD
}

/**
 * 6 条内置反应规则。
 */
object BuiltinRules {
    fun all(): List<ReactionRule> = listOf(
        // Rule 1: System popup -> auto-click confirm/allow
        ReactionRule(
            id = "builtin_system_popup",
            scenario = "系统权限弹窗",
            conditions = RuleConditions(
                popupKeywords = listOf("允许", "始终允许", "仅在使用", "Allow", "Always allow", "确定"),
                maxChangeRatio = 0.6f
            ),
            autoAction = DeviceAction.AutoConfirm(
                targetDescription = "允许",
                x = 540,
                y = 1400
            ),
            confidence = 0.98f,
            enabled = true,
            source = RuleSource.BUILTIN
        ),

        // Rule 2: App update popup -> dismiss
        ReactionRule(
            id = "builtin_update_popup",
            scenario = "应用更新弹窗",
            conditions = RuleConditions(
                popupKeywords = listOf("更新", "升级", "立即更新", "下载更新", "新版本"),
                maxChangeRatio = 0.5f
            ),
            autoAction = DeviceAction.AutoConfirm(
                targetDescription = "稍后/取消",
                x = 540,
                y = 1600
            ),
            confidence = 0.95f,
            enabled = true,
            source = RuleSource.BUILTIN
        ),

        // Rule 3: Loading spinner -> wait
        ReactionRule(
            id = "builtin_loading_wait",
            scenario = "页面加载中",
            conditions = RuleConditions(
                popupKeywords = listOf("加载中", "请稍候", "努力加载"),
                maxChangeRatio = 0.05f
            ),
            autoAction = DeviceAction.Wait(durationMs = 2000),
            confidence = 0.90f,
            enabled = true,
            source = RuleSource.BUILTIN
        ),

        // Rule 4: Keyboard visible on feed -> dismiss
        ReactionRule(
            id = "builtin_keyboard_dismiss",
            scenario = "误触键盘弹出",
            conditions = RuleConditions(
                keyboardVisible = true,
                pageTypes = listOf(
                    PageType.PAGE_FEED,
                    PageType.PAGE_LIVE,
                    PageType.PAGE_PROFILE
                )
            ),
            autoAction = DeviceAction.DismissKeyboard,
            confidence = 0.92f,
            enabled = true,
            source = RuleSource.BUILTIN
        ),

        // Rule 5: App crash/not responding -> restart
        ReactionRule(
            id = "builtin_app_crash",
            scenario = "应用崩溃/无响应",
            conditions = RuleConditions(
                popupKeywords = listOf(
                    "无响应", "停止运行", "已停止", "屡次停止",
                    "isn't responding", "has stopped", "keeps stopping"
                ),
                maxChangeRatio = 0.3f
            ),
            autoAction = DeviceAction.AutoConfirm(
                targetDescription = "关闭/确定",
                x = 540,
                y = 1400
            ),
            confidence = 0.97f,
            enabled = true,
            source = RuleSource.BUILTIN
        ),

        // Rule 6: Rate limit / too frequent -> wait longer
        ReactionRule(
            id = "builtin_rate_limit",
            scenario = "操作频繁限流",
            conditions = RuleConditions(
                popupKeywords = listOf(
                    "操作太频繁", "稍后再试", "休息一下",
                    "手速太快", "请稍后"
                ),
                maxChangeRatio = 0.4f
            ),
            autoAction = DeviceAction.Wait(durationMs = 5000),
            confidence = 0.88f,
            enabled = true,
            source = RuleSource.BUILTIN
        )
    )
}
