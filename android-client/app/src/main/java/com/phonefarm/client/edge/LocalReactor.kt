package com.phonefarm.client.edge

import com.phonefarm.client.edge.model.*
import dagger.hilt.android.scopes.ViewModelScoped
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 本地快速反应引擎。
 *
 * 不经过云端，直接执行内置/下发规则匹配的动作。
 * 适用于弹窗关闭/键盘关闭/加载等待等高频低风险场景。
 *
 * 延迟: < 100ms (本地执行, 无网络往返)
 */
@Singleton
class LocalReactor @Inject constructor() {

    /** 云端下发的动态规则 */
    private val cloudRules = MutableStateFlow<List<ReactionRule>>(emptyList())
    val dynamicRules: StateFlow<List<ReactionRule>> = cloudRules

    /**
     * 评估当前状态，返回应执行的本地动作。
     *
     * @param change 屏幕分析结果
     * @param currentApp 当前应用包名
     * @param taskContext 任务上下文
     * @return 匹配到则返回 DeviceAction, 否则 null (需云端决策)
     */
    fun evaluate(
        change: ChangeAnalysis,
        currentApp: String,
        taskContext: TaskContext?
    ): DeviceAction? {
        val allRules = BuiltinRules.all() + cloudRules.value

        for (rule in allRules) {
            if (!rule.enabled) continue
            if (!matchesConditions(rule.conditions, change, currentApp, taskContext)) continue

            return rule.autoAction
        }

        return null
    }

    /**
     * 更新云端下发的反应规则。
     */
    fun updateCloudRules(rules: List<ReactionRule>) {
        cloudRules.value = rules.filter { it.source == RuleSource.CLOUD }
    }

    /**
     * 添加单条云端规则。
     */
    fun addCloudRule(rule: ReactionRule) {
        val current = cloudRules.value.toMutableList()
        current.removeAll { it.id == rule.id }
        current.add(rule)
        cloudRules.value = current
    }

    /**
     * 移除云端规则。
     */
    fun removeCloudRule(ruleId: String) {
        cloudRules.value = cloudRules.value.filter { it.id != ruleId }
    }

    // ── Private ──

    private fun matchesConditions(
        conditions: RuleConditions,
        change: ChangeAnalysis,
        currentApp: String,
        taskContext: TaskContext?
    ): Boolean {
        // Popup keyword match
        if (conditions.popupKeywords.isNotEmpty()) {
            // Keywords are checked against OCR text at StateCompiler level
            // Here we check via anomaly flags
            if (!change.anomalyFlags.any { it == "popup" }) {
                // Allow keyboard/white-screen conditions to bypass
                if (conditions.keyboardVisible == null && conditions.maxChangeRatio >= 1.0f) {
                    return false
                }
            }
        }

        // Max change ratio
        if (change.changeRatio > conditions.maxChangeRatio) {
            return false
        }

        // Keyboard visibility
        if (conditions.keyboardVisible != null &&
            conditions.keyboardVisible != change.keyboardVisible) {
            return false
        }

        // App package match
        if (conditions.appPackages.isNotEmpty() &&
            conditions.appPackages.none { currentApp.startsWith(it) || currentApp == it }) {
            return false
        }

        return true
    }
}
