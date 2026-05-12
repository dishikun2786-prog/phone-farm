package com.phonefarm.client.edge.model

import android.graphics.Rect

/**
 * CV 管线数据类 — 各阶段产出与最终上报结构。
 */

// ── ScreenAnalyzer Output ──

data class ChangeAnalysis(
    val changed: Boolean,
    val changeRatio: Float,
    val perceptualHash: Long,
    val prevPerceptualHash: Long,
    val changeRegions: List<Rect>,
    val stableFrames: Int,
    val keyboardVisible: Boolean,
    val anomalyFlags: List<String>
)

// ── TextExtractor Output ──

data class OcrResult(
    val blocks: List<OcrBlock>,
    val totalChars: Int
)

data class OcrBlock(
    val text: String,
    val bbox: Rect,
    val confidence: Float
)

// ── UiDetector Output ──

data class DetectionResult(
    val detections: List<Detection>,
    val inferenceMs: Long,
    val inputWidth: Int,
    val inputHeight: Int
)

data class Detection(
    val uiClass: String,
    val label: String,
    val bbox: Rect,
    val confidence: Float
)

// ── StateCompiler Output ──

data class CompiledState(
    val deviceId: String,
    val currentApp: String,
    val appLabel: String,
    val pageType: PageType,
    val pageStable: Boolean,
    val screenWidth: Int,
    val screenHeight: Int,
    val interactiveElements: List<UiElement>,
    val textBlocks: List<OcrBlock>,
    val detections: List<Detection>,
    val changeRatio: Float,
    val changeRegions: List<Rect>,
    val stableFrames: Int,
    val keyboardVisible: Boolean,
    val anomalyFlags: List<String>,
    val taskState: TaskState?
)

data class UiElement(
    val text: String,
    val contentDesc: String,
    val resourceId: String,
    val className: String,
    val clickable: Boolean,
    val longClickable: Boolean,
    val scrollable: Boolean,
    val editable: Boolean,
    val bounds: Rect
)

data class TaskState(
    val currentTaskId: String?,
    val stepNumber: Int,
    val lastAction: String?,
    val lastOutcome: String?
)

enum class PageType {
    PAGE_UNKNOWN,
    PAGE_FEED,
    PAGE_SEARCH,
    PAGE_PROFILE,
    PAGE_LIVE,
    PAGE_CHAT,
    PAGE_SETTINGS,
    PAGE_LOGIN,
    PAGE_POPUP
}

// ── EdgePipeline Result ──

sealed class ProcessResult {
    /** 本地反应器捕获，无需上报云端 */
    data class LocalReact(
        val action: DeviceAction,
        val change: ChangeAnalysis
    ) : ProcessResult()

    /** 正常上报 EdgeState，等待云端决策 */
    data class UploadState(
        val state: CompiledState,
        val screenshotJpeg: ByteArray?
    ) : ProcessResult()

    /** 管线错误 */
    data class Error(val message: String) : ProcessResult()
}

// ── Device Action ──

sealed class DeviceAction {
    data class Tap(val x: Int, val y: Int) : DeviceAction()
    data class LongPress(val x: Int, val y: Int, val durationMs: Int = 800) : DeviceAction()
    data class Swipe(val x1: Int, val y1: Int, val x2: Int, val y2: Int, val durationMs: Int = 300) : DeviceAction()
    data class Type(val text: String) : DeviceAction()
    data object Back : DeviceAction()
    data object Home : DeviceAction()
    data class Launch(val packageName: String) : DeviceAction()
    data class Wait(val durationMs: Int) : DeviceAction()
    data class Terminate(val message: String? = null) : DeviceAction()
    object DismissKeyboard : DeviceAction()
    data class AutoConfirm(val targetDescription: String, val x: Int, val y: Int) : DeviceAction()
}

// ── Task Context ──

data class TaskContext(
    val taskId: String,
    val platform: String,
    val stepNumber: Int,
    val lastAction: String?
)
