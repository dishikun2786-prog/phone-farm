package com.phonefarm.client.edge

import android.graphics.Rect
import com.phonefarm.client.edge.model.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 状态序列化器。
 *
 * 当前使用 JSON 序列化 (kotlinx.serialization) 通过 WebSocket JSON 帧传输。
 * 后续 Protobuf 二进制帧 (0x10) 在 proto/edge_state.proto + protobuf-javalite 中实现。
 *
 * JSON 大小估算:
 *   - 无截图: 2-5KB (结构化数据)
 *   - 含截图: +JPEG 大小 (~30-50KB for 720p)
 *   - Protobuf: 2-5KB total (结构化部分, 无截图)
 */
@Singleton
class StateProtobuf @Inject constructor() {

    private val json = Json {
        encodeDefaults = false
        ignoreUnknownKeys = true
        prettyPrint = false
    }

    /**
     * 序列化 CompiledState 为 JSON 字符串 (用于 WebSocket JSON 帧)。
     */
    fun toJson(state: CompiledState): String {
        val dto = StateDto.from(state)
        return json.encodeToString(dto)
    }

    /**
     * 序列化 CompiledState 为 JSON 字节数组 (可用于二进制帧)。
     */
    fun toJsonBytes(state: CompiledState): ByteArray {
        return toJson(state).toByteArray(Charsets.UTF_8)
    }

    /**
     * 序列化为 Protobuf 二进制 (占位 — proto 编译后启用)。
     */
    fun toProtoBytes(state: CompiledState): ByteArray {
        // TODO: Protobuf lite 序列化
        // EdgeStateProto.EdgeState.newBuilder()
        //     .setDeviceId(state.deviceId)
        //     .setCurrentApp(state.currentApp)
        //     ...
        //     .build().toByteArray()
        return toJsonBytes(state)
    }
}

/**
 * JSON 传输 DTO (snake_case 字段名匹配服务端)。
 */
@Serializable
data class StateDto(
    val timestamp_ms: Long,
    val device_id: String,
    val current_app: String,
    val app_label: String,
    val page_type: String,
    val page_stable: Boolean,
    val screen_width: Int,
    val screen_height: Int,
    val interactive_elements: List<ElementDto>,
    val text_blocks: List<TextBlockDto>,
    val detections: List<DetectionDto>,
    val change_ratio: Float,
    val change_regions: List<RectDto>,
    val stable_frames: Int,
    val keyboard_visible: Boolean,
    val anomaly_flags: List<String>,
    val task_state: TaskStateDto? = null,
    val screenshot_jpeg_base64: String? = null
) {
    companion object {
        fun from(state: CompiledState): StateDto = StateDto(
            timestamp_ms = System.currentTimeMillis(),
            device_id = state.deviceId,
            current_app = state.currentApp,
            app_label = state.appLabel,
            page_type = state.pageType.name,
            page_stable = state.pageStable,
            screen_width = state.screenWidth,
            screen_height = state.screenHeight,
            interactive_elements = state.interactiveElements.map { ElementDto.from(it) },
            text_blocks = state.textBlocks.map { TextBlockDto.from(it) },
            detections = state.detections.map { DetectionDto.from(it) },
            change_ratio = state.changeRatio,
            change_regions = state.changeRegions.map { RectDto.from(it) },
            stable_frames = state.stableFrames,
            keyboard_visible = state.keyboardVisible,
            anomaly_flags = state.anomalyFlags,
            task_state = state.taskState?.let { TaskStateDto.from(it) }
        )
    }
}

@Serializable
data class ElementDto(
    val text: String,
    val content_desc: String,
    val resource_id: String,
    val class_name: String,
    val clickable: Boolean,
    val long_clickable: Boolean,
    val scrollable: Boolean,
    val editable: Boolean,
    val bounds: RectDto
) {
    companion object {
        fun from(el: UiElement): ElementDto = ElementDto(
            text = el.text,
            content_desc = el.contentDesc,
            resource_id = el.resourceId,
            class_name = el.className,
            clickable = el.clickable,
            long_clickable = el.longClickable,
            scrollable = el.scrollable,
            editable = el.editable,
            bounds = RectDto.from(el.bounds)
        )
    }
}

@Serializable
data class TextBlockDto(
    val text: String,
    val bbox: RectDto,
    val confidence: Float
) {
    companion object {
        fun from(tb: OcrBlock): TextBlockDto = TextBlockDto(
            text = tb.text,
            bbox = RectDto.from(tb.bbox),
            confidence = tb.confidence
        )
    }
}

@Serializable
data class DetectionDto(
    val ui_class: String,
    val label: String,
    val bbox: RectDto,
    val confidence: Float
) {
    companion object {
        fun from(d: Detection): DetectionDto = DetectionDto(
            ui_class = d.uiClass,
            label = d.label,
            bbox = RectDto.from(d.bbox),
            confidence = d.confidence
        )
    }
}

@Serializable
data class RectDto(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int
) {
    companion object {
        fun from(r: Rect): RectDto = RectDto(r.left, r.top, r.right, r.bottom)
    }
}

@Serializable
data class TaskStateDto(
    val current_task_id: String?,
    val step_number: Int,
    val last_action: String?,
    val last_outcome: String?
) {
    companion object {
        fun from(ts: TaskState): TaskStateDto = TaskStateDto(
            current_task_id = ts.currentTaskId,
            step_number = ts.stepNumber,
            last_action = ts.lastAction,
            last_outcome = ts.lastOutcome
        )
    }
}
