/**
 * StateIngestor — EdgeState 接收、解析与校验。
 *
 * 接收来自 Android 设备的 Protobuf 二进制帧 (0x10) 或 JSON 格式的 EdgeState,
 * 解析并校验后存入 Redis 缓存, 同时触发 DecisionEngine 决策循环。
 */
import type { DecisionInput, UiElement, TextBlock, Detection } from "../decision/types";

export interface EdgeState {
  timestampMs: number;
  deviceId: string;
  currentApp: string;
  appLabel: string;
  pageType: string;
  pageStable: boolean;
  screenWidth: number;
  screenHeight: number;
  interactiveElements: UiElement[];
  textBlocks: TextBlock[];
  detections: Detection[];
  changeRatio: number;
  changeRegions: Array<{ left: number; top: number; right: number; bottom: number }>;
  stableFrames: number;
  keyboardVisible: boolean;
  anomalyFlags: string[];
  taskState?: {
    currentTaskId?: string;
    stepNumber?: number;
    lastAction?: string;
    lastOutcome?: string;
  };
  screenshotJpeg?: Uint8Array;
}

export interface StateIngestorCallbacks {
  onEdgeState(state: DecisionInput): void;
}

export class StateIngestor {
  private callbacks: StateIngestorCallbacks;

  constructor(callbacks: StateIngestorCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * 处理从 WebSocket 接收的 EdgeState (JSON 格式)。
   * Protobuf 二进制解析见 proto/ 目录。
   */
  ingest(state: EdgeState): DecisionInput {
    const input: DecisionInput = {
      deviceId: state.deviceId,
      currentApp: state.currentApp,
      appLabel: state.appLabel,
      pageType: this.normalizePageType(state.pageType),
      pageStable: state.pageStable,
      textBlocks: state.textBlocks || [],
      interactiveElements: state.interactiveElements || [],
      detections: state.detections || [],
      changeRatio: state.changeRatio || 0,
      keyboardVisible: state.keyboardVisible || false,
      anomalyFlags: this.validateAnomalyFlags(state.anomalyFlags || []),
      screenshotWidth: state.screenWidth,
      screenshotHeight: state.screenHeight,
    };

    // Attach screenshot if anomalies present
    if (state.screenshotJpeg && state.screenshotJpeg.length > 0) {
      input.screenshotBase64 = Buffer.from(state.screenshotJpeg).toString("base64");
    }

    // Notify decision engine
    this.callbacks.onEdgeState(input);

    return input;
  }

  private normalizePageType(raw: string): DecisionInput["pageType"] {
    const upper = raw.toUpperCase();
    const valid = [
      "PAGE_UNKNOWN", "PAGE_FEED", "PAGE_SEARCH", "PAGE_PROFILE",
      "PAGE_LIVE", "PAGE_CHAT", "PAGE_SETTINGS", "PAGE_LOGIN", "PAGE_POPUP",
    ];
    if (valid.includes(upper)) return upper as DecisionInput["pageType"];
    if (upper === "UNKNOWN") return "PAGE_UNKNOWN";
    return "PAGE_UNKNOWN";
  }

  private validateAnomalyFlags(flags: string[]): string[] {
    const known = new Set([
      "popup", "white_screen", "app_switched", "captcha",
      "rate_limited", "app_crashed", "network_error", "keyboard_blocking",
    ]);
    return flags.filter(f => known.has(f));
  }
}
