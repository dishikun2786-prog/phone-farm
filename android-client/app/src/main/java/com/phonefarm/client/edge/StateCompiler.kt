package com.phonefarm.client.edge

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import com.phonefarm.client.edge.model.*
import dagger.hilt.android.scopes.ViewModelScoped
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 状态编译器 — 合并 CV + OCR + YOLO + A11yService UI 树。
 *
 * 融合策略:
 *   1. A11yService UI 树为主体 (精确的可交互元素)
 *   2. OCR 文字补充 invisible/offscreen 元素
 *   3. YOLO 检测补充非原生 UI (WebView/H5/游戏)
 *   4. ScreenAnalyzer 异常标记透传
 *
 * 输出: CompiledState (完整的设备状态快照)
 */
@Singleton
class StateCompiler @Inject constructor() {

    /**
     * 编译设备状态。
     *
     * @param deviceId 设备 ID
     * @param currentApp 当前前台应用包名
     * @param appLabel 应用显示名称
     * @param a11yRoot A11yService 根节点 (可为 null)
     * @param change ScreenAnalyzer 分析结果
     * @param ocr OCR 结果 (可为 null)
     * @param yolo YOLO 检测结果 (可为 null)
     * @param screenWidth 屏幕宽度
     * @param screenHeight 屏幕高度
     * @param taskState 当前任务上下文 (可为 null)
     */
    fun compile(
        deviceId: String,
        currentApp: String,
        appLabel: String,
        a11yRoot: AccessibilityNodeInfo?,
        change: ChangeAnalysis,
        ocr: OcrResult?,
        yolo: DetectionResult?,
        screenWidth: Int,
        screenHeight: Int,
        taskState: TaskState?
    ): CompiledState {
        // 1. 从 A11y 树提取可交互元素
        val interactiveElements = extractA11yElements(a11yRoot)

        // 2. OCR 文字去重补充
        val textBlocks = ocr?.blocks ?: emptyList()

        // 3. YOLO 检测元素
        val detections = yolo?.detections ?: emptyList()

        // 4. 推断页面类型
        val pageType = inferPageType(currentApp, interactiveElements, textBlocks, detections)

        // 5. 合并异常标记
        val anomalyFlags = mergeAnomalyFlags(change, a11yRoot)

        return CompiledState(
            deviceId = deviceId,
            currentApp = currentApp,
            appLabel = appLabel,
            pageType = pageType,
            pageStable = !change.changed && change.stableFrames >= 3,
            screenWidth = screenWidth,
            screenHeight = screenHeight,
            interactiveElements = interactiveElements,
            textBlocks = textBlocks,
            detections = detections,
            changeRatio = change.changeRatio,
            changeRegions = change.changeRegions,
            stableFrames = change.stableFrames,
            keyboardVisible = change.keyboardVisible,
            anomalyFlags = anomalyFlags,
            taskState = taskState
        )
    }

    // ── Private ──

    /**
     * 从 AccessibilityNodeInfo 树提取可交互元素。
     * 只提取 clickable/longClickable/scrollable/editable 节点。
     */
    private fun extractA11yElements(root: AccessibilityNodeInfo?): List<UiElement> {
        if (root == null) return emptyList()
        val elements = mutableListOf<UiElement>()
        collectInteractive(root, elements, 0, 50) // max 50 elements, max depth 15
        return elements
    }

    private fun collectInteractive(
        node: AccessibilityNodeInfo,
        out: MutableList<UiElement>,
        depth: Int,
        maxElements: Int
    ) {
        if (depth > 15 || out.size >= maxElements) return

        val bounds = Rect().also { node.getBoundsInScreen(it) }

        // Only collect meaningful interactive elements
        val isInteractive = node.isClickable || node.isLongClickable ||
                            node.isScrollable || node.isEditable ||
                            (node.isFocusable && node.isEnabled)

        val hasLabel = !node.text.isNullOrBlank() ||
                       !node.contentDescription.isNullOrBlank() ||
                       !node.viewIdResourceName.isNullOrBlank()

        if (isInteractive || hasLabel) {
            out.add(
                UiElement(
                    text = node.text?.toString() ?: "",
                    contentDesc = node.contentDescription?.toString() ?: "",
                    resourceId = node.viewIdResourceName ?: "",
                    className = node.className?.toString() ?: "android.view.View",
                    clickable = node.isClickable,
                    longClickable = node.isLongClickable,
                    scrollable = node.isScrollable,
                    editable = node.isEditable,
                    bounds = bounds
                )
            )
        }

        // Recurse children
        for (i in 0 until node.childCount) {
            if (out.size >= maxElements) break
            val child = node.getChild(i) ?: continue
            collectInteractive(child, out, depth + 1, maxElements)
            child.recycle()
        }
    }

    /**
     * 推断当前页面类型。
     */
    private fun inferPageType(
        currentApp: String,
        elements: List<UiElement>,
        texts: List<OcrBlock>,
        detections: List<Detection>
    ): PageType {
        val allText = texts.joinToString(" ") { it.text } +
                      elements.joinToString(" ") { "${it.text} ${it.contentDesc}" }

        val text = allText.lowercase()

        return when {
            text.contains("登录") || text.contains("login") || text.contains("sign in") ->
                PageType.PAGE_LOGIN

            text.contains("设置") || text.contains("settings") ->
                PageType.PAGE_SETTINGS

            text.contains("直播") || text.contains("live") ||
            detections.any { it.uiClass == "video" && it.confidence > 0.7f } ->
                PageType.PAGE_LIVE

            text.contains("搜索") || text.contains("search") ||
            elements.any { it.editable && it.className.contains("EditText") } ->
                PageType.PAGE_SEARCH

            text.contains("聊天") || text.contains("chat") || text.contains("消息") ||
            text.contains("message") ->
                PageType.PAGE_CHAT

            text.contains("个人") || text.contains("profile") || text.contains("我的") ->
                PageType.PAGE_PROFILE

            text.contains("粉丝") || text.contains("关注") || text.contains("推荐") ||
            text.contains("发现") || text.contains("foryou") || text.contains("following") ->
                PageType.PAGE_FEED

            text.contains("弹窗") || text.contains("dialog") || text.contains("popup") ||
            text.contains("允许") || text.contains("更新") ->
                PageType.PAGE_POPUP

            else -> PageType.PAGE_UNKNOWN
        }
    }

    /**
     * 合并异常标记。
     */
    private fun mergeAnomalyFlags(
        change: ChangeAnalysis,
        a11yRoot: AccessibilityNodeInfo?
    ): List<String> {
        val flags = change.anomalyFlags.toMutableList()

        // Check for app not responding dialog via A11y
        if (a11yRoot != null) {
            val packageName = a11yRoot.packageName?.toString() ?: ""
            if (packageName == "android" && a11yRoot.childCount == 0) {
                flags.add("app_switched")
            }
        }

        return flags.distinct()
    }
}
