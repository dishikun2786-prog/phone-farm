/**
 * Decision Engine — 双模型决策层类型定义。
 *
 * DeepSeek V4 Flash (文本, ~90%) + Qwen3-VL-Flash (视觉, ~10%, 阿里云百炼)
 */

// ── Page Type ──

export type PageType =
  | "PAGE_UNKNOWN"
  | "PAGE_FEED"
  | "PAGE_SEARCH"
  | "PAGE_PROFILE"
  | "PAGE_LIVE"
  | "PAGE_CHAT"
  | "PAGE_SETTINGS"
  | "PAGE_LOGIN"
  | "PAGE_POPUP";

// ── Geometry ──

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// ── Edge State Components ──

export interface UiElement {
  text: string;
  contentDesc: string;
  resourceId: string;
  className: string;
  clickable: boolean;
  longClickable: boolean;
  scrollable: boolean;
  editable: boolean;
  bounds: Rect;
}

export interface TextBlock {
  text: string;
  bbox: Rect;
  confidence: number;
}

export interface Detection {
  uiClass: string;
  label: string;
  bbox: Rect;
  confidence: number;
}

// ── Decision I/O ──

export interface DecisionInput {
  deviceId: string;
  currentApp: string;
  appLabel: string;
  pageType: PageType;
  pageStable: boolean;
  textBlocks: TextBlock[];
  interactiveElements: UiElement[];
  detections: Detection[];
  changeRatio: number;
  keyboardVisible: boolean;
  anomalyFlags: string[];
  screenshotBase64?: string;
  screenshotWidth?: number;
  screenshotHeight?: number;
}

export type DeviceAction =
  | { type: "tap"; x: number; y: number }
  | { type: "long_press"; x: number; y: number; durationMs?: number }
  | { type: "swipe"; x1: number; y1: number; x2: number; y2: number; durationMs?: number }
  | { type: "type"; text: string }
  | { type: "back" }
  | { type: "home" }
  | { type: "launch"; packageName: string }
  | { type: "wait"; durationMs: number }
  | { type: "terminate"; message?: string };

export interface DecisionOutput {
  decisionId: string;
  thinking: string;
  action: DeviceAction;
  confidence: number;
  finished: boolean;
  needScreenshot: boolean;
  nextStepHint: string;
  modelUsed: "deepseek" | "qwen-vl" | "rule" | "none";
}

export interface TaskResult {
  deviceId: string;
  status: "completed" | "failed" | "stopped" | "max_steps" | "timeout" | "cancelled";
  message: string;
  totalSteps: number;
  durationMs: number;
}

// ── Raw AI Response ──

export interface RawDecision {
  thinking: string;
  action: Record<string, unknown>;
  confidence: number;
  finished: boolean;
  needScreenshot: boolean;
  nextStepHint: string;
}
