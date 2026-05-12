/**
 * 双模式提示词构建器。
 *
 * 文本模式 (DeepSeek V4 Flash):
 *   - 输入: 结构化状态描述 (纯文本)
 *   - Token: ~400-600
 *
 * 视觉模式 (Qwen3-VL-Flash):
 *   - 输入: 结构化状态 + JPEG 截图 (多模态)
 *   - Token: ~400 text + ~2000 image
 */
import type { DecisionInput } from "./types";

export interface MemoryContext {
  memories: Array<{
    scenario: string;
    action_taken: Record<string, unknown>;
    outcome: string;
    success_count: number;
  }>;
  rules?: Array<{
    scenario: string;
    auto_action: Record<string, unknown>;
    confidence: number;
  }>;
  exactRule?: {
    scenario: string;
    auto_action: Record<string, unknown>;
    confidence: number;
  } | null;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<
    { type: "text"; text: string } |
    { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  >;
}

const TEXT_SYSTEM_PROMPT = `你是 PhoneFarm 手机自动化 AI。你在控制一台 Android 12+ 手机执行营销任务。

## 输出规则
- 必须输出合法 JSON
- 坐标用像素值 (屏幕分辨率见状态描述)
- 文本输入只支持英文/数字 (中文输入用剪贴板)
- 滑动: 上滑=(540,1600)→(540,400), 下滑=(540,400)→(540,1600)
- 长按 >= 800ms, 等待 >= 300ms
- 任务完成或无法继续时设 finished=true
- 弹窗优先点击"稍后"/"忽略"/"关闭", 不点"确定"/"更新"

## 输出 JSON
{
  "thinking": "推理过程",
  "action": { "type": "tap|long_press|swipe|type|back|home|launch|wait|terminate", ... },
  "confidence": 0.95,
  "finished": false,
  "needScreenshot": false,
  "nextStepHint": "下一步描述"
}`;

const VISION_SYSTEM_PROMPT = `你是 PhoneFarm 手机自动化 AI (视觉模式)。你现在可以看到手机屏幕截图。

你的任务是分析截图中的异常/复杂场景, 给出精确操作。

## 输出规则
- 截图是手机屏幕的完整截图, 坐标原点在左上角
- 必须精确定位目标元素的像素坐标
- 弹窗/对话框: 找到关闭/取消按钮 -> tap
- 验证码: 识别类型 -> 描述给操作员, 设 finished=true
- 异常页面: 分析原因 -> 给出恢复步骤
- 新页面类型: 识别布局 -> 给出探索策略

## 输出 JSON
{
  "thinking": "截图分析推理过程",
  "action": { "type": ... },
  "confidence": 0.95,
  "finished": false,
  "needScreenshot": false,
  "nextStepHint": "下一步描述"
}`;

export class PromptBuilder {
  /** 文本模式 — DeepSeek V4 Flash */
  buildText(input: DecisionInput, memory: MemoryContext, session: { taskPrompt: string; stepNumber: number; maxSteps: number }): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: "system", content: TEXT_SYSTEM_PROMPT },
      { role: "user", content: this.buildStateText(input, session) },
    ];

    if (memory.memories.length > 0) {
      messages.push({ role: "user", content: this.buildMemoryText(memory) });
    }

    return messages;
  }

  /** 视觉模式 — Qwen3-VL-Flash (文本 + 截图) */
  buildVision(input: DecisionInput, memory: MemoryContext, session: { taskPrompt: string; stepNumber: number; maxSteps: number }): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: "system", content: VISION_SYSTEM_PROMPT },
    ];

    const contentParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" } }> = [
      { type: "text", text: this.buildStateText(input, session) },
    ];

    if (input.screenshotBase64) {
      contentParts.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${input.screenshotBase64}`,
          detail: "high",
        },
      });
    }

    messages.push({ role: "user", content: contentParts });

    if (memory.memories.length > 0) {
      messages.push({ role: "user", content: this.buildMemoryText(memory) });
    }

    return messages;
  }

  private buildStateText(input: DecisionInput, session: { taskPrompt: string; stepNumber: number; maxSteps: number }): string {
    const lines: string[] = [];

    lines.push("## 设备状态");
    lines.push(`- 应用: ${input.appLabel} (${input.currentApp})`);
    lines.push(`- 页面类型: ${input.pageType}`);
    lines.push(`- 页面稳定: ${input.pageStable ? "是" : "否 (变化率 " + (input.changeRatio * 100).toFixed(0) + "%)"}`);
    lines.push(`- 键盘可见: ${input.keyboardVisible ? "是" : "否"}`);
    lines.push(`- 异常标记: ${input.anomalyFlags.length > 0 ? input.anomalyFlags.join(", ") : "无"}`);
    lines.push(`- 屏幕: ${input.screenshotWidth || 1080}x${input.screenshotHeight || 2400}`);

    lines.push("\n## 任务");
    lines.push(`- 目标: ${session.taskPrompt}`);
    lines.push(`- 步骤: ${session.stepNumber + 1}/${session.maxSteps}`);

    if (input.interactiveElements.length > 0) {
      lines.push(`\n## 可交互元素 (${input.interactiveElements.length} 个, 显示前15)`);
      const sorted = [...input.interactiveElements].sort((a, b) => {
        const sa = (a.clickable ? 3 : 0) + (a.text ? 2 : 0) + (a.contentDesc ? 1 : 0);
        const sb = (b.clickable ? 3 : 0) + (b.text ? 2 : 0) + (b.contentDesc ? 1 : 0);
        return sb - sa;
      });
      for (const el of sorted.slice(0, 15)) {
        const b = el.bounds;
        const cx = Math.round((b.left + b.right) / 2);
        const cy = Math.round((b.top + b.bottom) / 2);
        const label = el.text || el.contentDesc || el.resourceId?.split("/").pop() || el.className?.split(".").pop() || "?";
        const flags = [el.clickable && "可点", el.scrollable && "可滚", el.editable && "可输"].filter(Boolean).join(",");
        lines.push(`  [${cx},${cy}] "${label}" ${flags ? `(${flags})` : ""}`);
      }
    }

    if (input.textBlocks.length > 0) {
      lines.push(`\n## 屏幕文字 (${input.textBlocks.length} 条, 前10)`);
      for (const tb of input.textBlocks.slice(0, 10)) {
        lines.push(`  - "${tb.text}" [${tb.confidence.toFixed(2)}]`);
      }
    }

    if (input.detections.length > 0) {
      const counts: Record<string, number> = {};
      for (const d of input.detections) {
        counts[d.label] = (counts[d.label] || 0) + 1;
      }
      const summary = Object.entries(counts).map(([k, v]) => `${k}x${v}`).join(", ");
      lines.push(`\n## UI 组件: ${summary}`);
    }

    return lines.join("\n");
  }

  private buildMemoryText(memory: MemoryContext): string {
    const lines = ["## 跨设备经验"];
    for (const m of memory.memories.slice(0, 3)) {
      lines.push(`- ${m.scenario}: ${JSON.stringify(m.action_taken)} -> ${m.outcome} (${m.success_count}次成功)`);
    }
    if (memory.rules?.length) {
      for (const r of memory.rules) {
        lines.push(`- [规则] ${r.scenario} -> 自动: ${JSON.stringify(r.auto_action)} (置信度: ${r.confidence})`);
      }
    }
    return lines.join("\n");
  }
}
