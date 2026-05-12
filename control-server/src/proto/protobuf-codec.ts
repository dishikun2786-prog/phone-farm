/**
 * ProtobufCodec — binary encode/decode for video and control messages.
 *
 * Loads .proto definitions at runtime via protobufjs, avoiding CJS/ESM
 * conflicts with generated static code. Provides type-safe encode/decode
 * with JSON fallback for clients that don't support binary WebSocket frames.
 */
import protobuf from 'protobufjs';
import * as path from 'path';
import * as fs from 'fs';

// ── Types ──

export interface VideoFrame {
  deviceId: string;
  frameSeq: number;
  timestampMs: number;
  codec: string;
  isKeyframe: boolean;
  nalData: Uint8Array;
  ptsUs: number;
  durationUs: number;
}

export interface DeviceMeta {
  deviceId: string;
  deviceName: string;
  width: number;
  height: number;
  codec: string;
  bitRate: number;
  maxFps: number;
}

export interface TouchAction {
  $case: 'touch';
  action: number;
  pointerId: number;
  x: number;
  y: number;
  pressure: number;
}

export interface KeyAction {
  $case: 'key';
  action: number;
  keycode: number;
}

export interface ScrollAction {
  $case: 'scroll';
  x: number;
  y: number;
  hscroll: number;
  vscroll: number;
}

export interface ClipboardAction {
  $case: 'clipboard';
  text: string;
}

export interface KeymapAction {
  $case: 'keymap';
  cmd: Record<string, unknown>;
}

export type ControlAction = TouchAction | KeyAction | ScrollAction | ClipboardAction | KeymapAction;

export interface ControlMessage {
  action?: ControlAction;
  groupId: string;
}

// ── Codec ──

export class ProtobufCodec {
  private videoFrameType: protobuf.Type | null = null;
  private deviceMetaType: protobuf.Type | null = null;
  private controlMsgType: protobuf.Type | null = null;
  private loaded = false;
  private protoDir: string;

  constructor(protoDir?: string) {
    this.protoDir = protoDir || path.join(process.cwd(), 'proto');
  }

  /** Load and compile .proto definitions (idempotent) */
  async init(): Promise<void> {
    if (this.loaded) return;

    const videoProto = path.join(this.protoDir, 'video-message.proto');
    const controlProto = path.join(this.protoDir, 'control-message.proto');

    const root = new protobuf.Root();

    // Load video proto
    if (fs.existsSync(videoProto)) {
      await root.load(videoProto, { keepCase: true });
      this.videoFrameType = root.lookupType('phonefarm.video.VideoFrame');
      this.deviceMetaType = root.lookupType('phonefarm.video.DeviceMeta');
    }

    // Load control proto
    if (fs.existsSync(controlProto)) {
      await root.load(controlProto, { keepCase: true });
      this.controlMsgType = root.lookupType('phonefarm.control.ControlMessage');
    }

    this.loaded = true;
  }

  /** Synchronous init (for startup) */
  initSync(): void {
    if (this.loaded) return;

    const videoProto = path.join(this.protoDir, 'video-message.proto');
    const controlProto = path.join(this.protoDir, 'control-message.proto');

    const root = new protobuf.Root();

    if (fs.existsSync(videoProto)) {
      root.loadSync(videoProto, { keepCase: true });
      this.videoFrameType = root.lookupType('phonefarm.video.VideoFrame');
      this.deviceMetaType = root.lookupType('phonefarm.video.DeviceMeta');
    }

    if (fs.existsSync(controlProto)) {
      root.loadSync(controlProto, { keepCase: true });
      this.controlMsgType = root.lookupType('phonefarm.control.ControlMessage');
    }

    this.loaded = true;
  }

  // ── Video ──

  encodeVideoFrame(frame: VideoFrame): Uint8Array {
    if (!this.videoFrameType) throw new Error('ProtobufCodec not initialized');
    const err = this.videoFrameType.verify(frame);
    if (err) throw new Error(`VideoFrame validation: ${err}`);
    return this.videoFrameType.encode(
      this.videoFrameType.create(frame),
    ).finish();
  }

  decodeVideoFrame(buf: Uint8Array): VideoFrame {
    if (!this.videoFrameType) throw new Error('ProtobufCodec not initialized');
    const decoded: Record<string, any> = this.videoFrameType.decode(buf) as any;
    return {
      deviceId: decoded.deviceId || '',
      frameSeq: decoded.frameSeq || 0,
      timestampMs: typeof decoded.timestampMs === 'object' ? (decoded.timestampMs as any).toNumber() : Number(decoded.timestampMs) || 0,
      codec: decoded.codec || 'h264',
      isKeyframe: decoded.isKeyframe || false,
      nalData: decoded.nalData || new Uint8Array(0),
      ptsUs: typeof decoded.ptsUs === 'object' ? (decoded.ptsUs as any).toNumber() : Number(decoded.ptsUs) || 0,
      durationUs: decoded.durationUs || 0,
    };
  }

  encodeDeviceMeta(meta: DeviceMeta): Uint8Array {
    if (!this.deviceMetaType) throw new Error('ProtobufCodec not initialized');
    const err = this.deviceMetaType.verify(meta);
    if (err) throw new Error(`DeviceMeta validation: ${err}`);
    return this.deviceMetaType.encode(
      this.deviceMetaType.create(meta),
    ).finish();
  }

  decodeDeviceMeta(buf: Uint8Array): DeviceMeta {
    if (!this.deviceMetaType) throw new Error('ProtobufCodec not initialized');
    const decoded: Record<string, any> = this.deviceMetaType.decode(buf) as any;
    return {
      deviceId: decoded.deviceId || '',
      deviceName: decoded.deviceName || 'Unknown',
      width: decoded.width || 1080,
      height: decoded.height || 2400,
      codec: decoded.codec || 'h264',
      bitRate: decoded.bitRate || 4000000,
      maxFps: decoded.maxFps || 30,
    };
  }

  // ── Control ──

  encodeControlMessage(msg: ControlMessage): Uint8Array {
    if (!this.controlMsgType) throw new Error('ProtobufCodec not initialized');
    // Flatten action into the message shape that protobuf expects
    const flat: Record<string, unknown> = { groupId: msg.groupId };
    if (msg.action) {
      switch (msg.action.$case) {
        case 'touch':
          flat.touch = {
            action: (msg.action as TouchAction).action,
            pointerId: (msg.action as TouchAction).pointerId,
            x: (msg.action as TouchAction).x,
            y: (msg.action as TouchAction).y,
            pressure: (msg.action as TouchAction).pressure,
          };
          break;
        case 'key':
          flat.key = {
            action: (msg.action as KeyAction).action,
            keycode: (msg.action as KeyAction).keycode,
          };
          break;
        case 'scroll':
          flat.scroll = {
            x: (msg.action as ScrollAction).x,
            y: (msg.action as ScrollAction).y,
            hscroll: (msg.action as ScrollAction).hscroll,
            vscroll: (msg.action as ScrollAction).vscroll,
          };
          break;
        case 'clipboard':
          flat.clipboard = { text: (msg.action as ClipboardAction).text };
          break;
        case 'keymap': {
          const cmd = (msg.action as KeymapAction).cmd;
          if (cmd.swipe) {
            flat.keymap = { swipe: cmd.swipe };
          } else if (cmd.longPress) {
            flat.keymap = { longPress: cmd.longPress };
          } else {
            flat.keymap = { tap: cmd.tap || cmd };
          }
          break;
        }
      }
    }
    const err = this.controlMsgType.verify(flat);
    if (err) throw new Error(`ControlMessage validation: ${err}`);
    return this.controlMsgType.encode(
      this.controlMsgType.create(flat),
    ).finish();
  }

  decodeControlMessage(buf: Uint8Array): ControlMessage {
    if (!this.controlMsgType) throw new Error('ProtobufCodec not initialized');
    const decoded: Record<string, any> = this.controlMsgType.decode(buf) as any;
    let action: ControlAction | undefined;

    if (decoded.touch) {
      action = {
        $case: 'touch',
        action: decoded.touch.action || 0,
        pointerId: decoded.touch.pointerId || 0,
        x: decoded.touch.x || 0,
        y: decoded.touch.y || 0,
        pressure: decoded.touch.pressure || 0,
      };
    } else if (decoded.key) {
      action = {
        $case: 'key',
        action: decoded.key.action || 0,
        keycode: decoded.key.keycode || 0,
      };
    } else if (decoded.scroll) {
      action = {
        $case: 'scroll',
        x: decoded.scroll.x || 0,
        y: decoded.scroll.y || 0,
        hscroll: decoded.scroll.hscroll || 0,
        vscroll: decoded.scroll.vscroll || 0,
      };
    } else if (decoded.clipboard) {
      action = {
        $case: 'clipboard',
        text: decoded.clipboard.text || '',
      };
    } else if (decoded.keymap) {
      const cmd = decoded.keymap.tap ? { tap: decoded.keymap.tap }
        : decoded.keymap.swipe ? { swipe: decoded.keymap.swipe }
        : decoded.keymap.longPress ? { longPress: decoded.keymap.longPress }
        : {};
      action = { $case: 'keymap', cmd };
    }

    return {
      action,
      groupId: decoded.groupId || '',
    };
  }

  // ── JSON <-> Binary bridge ──

  /** Check if a WebSocket message is binary (potential protobuf) */
  static isBinary(raw: unknown): boolean {
    return Buffer.isBuffer(raw) || raw instanceof ArrayBuffer;
  }

  /** Decode a WebSocket message — auto-detects binary protobuf vs text JSON */
  decodeMessage(raw: unknown): { binary: boolean; payload: Record<string, unknown> | null } {
    if (ProtobufCodec.isBinary(raw)) {
      const buf = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw as Buffer);
      try {
        return { binary: true, payload: this.decodeVideoFrame(buf) as unknown as Record<string, unknown> };
      } catch {
        try {
          return { binary: true, payload: this.decodeControlMessage(buf) as unknown as Record<string, unknown> };
        } catch {
          return { binary: true, payload: null };
        }
      }
    }
    try {
      return { binary: false, payload: JSON.parse(raw as string) };
    } catch {
      return { binary: false, payload: null };
    }
  }
}

/** Singleton instance */
export const protobufCodec = new ProtobufCodec();
