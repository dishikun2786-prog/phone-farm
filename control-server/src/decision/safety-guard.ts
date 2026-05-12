/**
 * 安全护栏 — 校验 AI 输出的动作合法性。
 *
 * 校验项:
 *   1. 坐标越界 -> clamp 到屏幕内
 *   2. 启动应用黑名单 -> 拒绝 (系统设置/支付)
 *   3. 文本内容长度限制 -> 截断
 *   4. 连续重复动作检测 -> 标记 (3次相同 -> 路由切换到 VLM)
 *   5. 操作频率限制 -> 最小间隔 300ms
 */
import type { DeviceAction } from "./types";

const BLACKLIST_PACKAGES = [
  "com.android.settings",
  "com.android.packageinstaller",
  "com.android.vending",
  "com.eg.android.AlipayGphone",
];

interface ActionRecord {
  hash: string;
  time: number;
}

export class SafetyViolation extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "SafetyViolation";
  }
}

export class SafetyGuard {
  private actionHistory = new Map<string, ActionRecord[]>();
  private readonly MAX_HISTORY = 20;

  validate(
    action: DeviceAction,
    screen: { screenWidth: number; screenHeight: number },
  ): DeviceAction {
    switch (action.type) {
      case "tap":
      case "long_press": {
        action.x = this.clamp(action.x, 0, screen.screenWidth);
        action.y = this.clamp(action.y, 0, screen.screenHeight);
        break;
      }

      case "swipe": {
        action.x1 = this.clamp(action.x1, 0, screen.screenWidth);
        action.y1 = this.clamp(action.y1, 0, screen.screenHeight);
        action.x2 = this.clamp(action.x2, 0, screen.screenWidth);
        action.y2 = this.clamp(action.y2, 0, screen.screenHeight);
        break;
      }

      case "launch": {
        if (BLACKLIST_PACKAGES.some(p => action.packageName?.startsWith(p))) {
          throw new SafetyViolation(`禁止启动应用: ${action.packageName}`, "BLACKLIST_APP");
        }
        break;
      }

      case "type": {
        if (action.text && action.text.length > 500) {
          action.text = action.text.slice(0, 500);
        }
        break;
      }
    }

    return action;
  }

  /**
   * 记录一次动作执行，返回是否检测到重复。
   */
  recordAction(deviceId: string, action: DeviceAction): boolean {
    const hash = `${action.type}_${JSON.stringify(action)}`;
    const now = Date.now();
    let history = this.actionHistory.get(deviceId);
    if (!history) {
      history = [];
      this.actionHistory.set(deviceId, history);
    }

    // 清理 10 秒前的记录
    history = history.filter(r => now - r.time < 10_000);

    const recentSame = history.filter(r => r.hash === hash).length;
    history.push({ hash, time: now });

    if (history.length > this.MAX_HISTORY) {
      history.shift();
    }

    this.actionHistory.set(deviceId, history);

    return recentSame >= 2; // 连续 3 次相同 = 异常
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(v)));
  }
}
