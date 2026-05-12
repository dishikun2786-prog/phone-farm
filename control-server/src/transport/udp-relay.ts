/**
 * UDP Relay Server — 音视频帧中继 + NAT 类型辅助探测。
 *
 * 绑定 :8444 UDP 端口，同时承担两个角色：
 * 1. NAT 探测辅助：响应设备的探测包，回显公网 IP:Port
 * 2. 音视频帧中继：接收设备 UDP 音视频帧 → 转发给前端 WebSocket
 *
 * 消息格式（1-byte header）：
 *   Device → Server:
 *     0x01 = NAT probe request
 *     0x02 = Video frame (Protobuf)
 *     0x04 = Keepalive
 *     0x05 = Audio frame (Protobuf)
 *     0x03 = ACK (from device to server, relay purposes)
 *   Server → Device:
 *     0x81 = NAT probe response (public IP:Port)
 *     0x83 = ACK (acknowledge received frame by seq)
 */

import dgram from 'dgram';
import { WebSocket } from 'ws';

interface NatProbeEntry {
  deviceId: string;
  publicIp: string;
  publicPort: number;
  lastSeen: number;
}

export class UdpRelay {
  private socket: dgram.Socket | null = null;
  private deviceNatMap = new Map<string, NatProbeEntry>();
  /** deviceId → Set of watching frontend WebSockets */
  private frontendRelays = new Map<string, Set<WebSocket>>();
  private port: number;

  constructor(port = 8444) {
    this.port = port;
  }

  start(): void {
    this.socket = dgram.createSocket('udp4');

    this.socket.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
      this.handleMessage(msg, rinfo);
    });

    this.socket.on('error', (err: Error) => {
      console.error('[UdpRelay] Socket error:', err.message);
    });

    this.socket.bind(this.port, () => {
      console.log(`[UdpRelay] Listening on UDP :${this.port}`);
    });
  }

  /** 注册前端订阅某设备的音视频流 */
  registerFrontend(deviceId: string, ws: WebSocket): void {
    let subs = this.frontendRelays.get(deviceId);
    if (!subs) {
      subs = new Set();
      this.frontendRelays.set(deviceId, subs);
    }
    subs.add(ws);
  }

  /** 取消前端订阅 */
  unregisterFrontend(deviceId: string, ws: WebSocket): void {
    const subs = this.frontendRelays.get(deviceId);
    if (subs) {
      subs.delete(ws);
      if (subs.size === 0) {
        this.frontendRelays.delete(deviceId);
      }
    }
  }

  /** 获取设备 NAT 信息 */
  getDeviceNat(deviceId: string): NatProbeEntry | undefined {
    return this.deviceNatMap.get(deviceId);
  }

  stop(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    if (msg.length === 0) return;

    const header = msg[0]; // 1-byte message type

    switch (header) {
      case 0x01: // NAT probe request
        this.handleNatProbe(msg, rinfo);
        break;
      case 0x02: // Video frame
        this.handleVideoFrame(msg, rinfo);
        break;
      case 0x03: // ACK
        this.handleAck(msg, rinfo);
        break;
      case 0x04: // Keepalive
        this.handleKeepalive(msg, rinfo);
        break;
      case 0x05: // Audio frame
        this.handleAudioFrame(msg, rinfo);
        break;
    }
  }

  private handleNatProbe(_msg: Buffer, rinfo: dgram.RemoteInfo): void {
    // 回显设备公网 IP:Port
    // Response: 0x81 + deviceId(32 bytes placeholder) + ip(4 bytes) + port(2 bytes)
    const response = Buffer.alloc(40);
    response[0] = 0x81; // NAT probe response
    response[1] = 0; // flags, reserved

    // IP to bytes
    const ipParts = rinfo.address.split('.').map(Number);
    response[2] = ipParts[0] || 0;
    response[3] = ipParts[1] || 0;
    response[4] = ipParts[2] || 0;
    response[5] = ipParts[3] || 0;

    // Port to 2 bytes big-endian
    response[6] = (rinfo.port >> 8) & 0xFF;
    response[7] = rinfo.port & 0xFF;

    this.socket?.send(response, 0, 8, rinfo.port, rinfo.address);
  }

  private handleVideoFrame(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    if (msg.length <= 1) return;

    const payload = msg.subarray(1); // Protobuf VideoFrame

    // 尝试提取 deviceId 用于路由（从 Protobuf field 1 解析，简化处理）
    // VideoFrame protobuf: field 1 = deviceId (string, wire type 2)
    let deviceId = '';
    try {
      deviceId = this.extractDeviceId(payload);
    } catch {
      // 无法解析 deviceId，使用 IP:Port 作为回退标识
      deviceId = `${rinfo.address}:${rinfo.port}`;
    }

    if (deviceId) {
      // 更新 NAT 映射
      this.deviceNatMap.set(deviceId, {
        deviceId,
        publicIp: rinfo.address,
        publicPort: rinfo.port,
        lastSeen: Date.now(),
      });

      // 转发给订阅的前端
      this.relayToFrontends(deviceId, payload);

      // ACK 回传给设备
      // 从 Protobuf 中提取 frameSeq (field 2)
      let frameSeq = 0n;
      try {
        const seqBytes = this.extractField(payload, 2);
        if (seqBytes) {
          // wire type 0 (varint) for uint32
          frameSeq = this.decodeVarint(seqBytes).value;
        }
      } catch {
        // frameSeq 解析失败
      }

      const ack = Buffer.alloc(9);
      ack[0] = 0x83; // ACK response
      ack.writeBigInt64BE(frameSeq, 1);
      this.socket?.send(ack, 0, 9, rinfo.port, rinfo.address);
    }
  }

  private handleAudioFrame(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    if (msg.length <= 1) return;

    const payload = msg.subarray(1); // Protobuf AudioFrame

    let deviceId = '';
    try {
      deviceId = this.extractDeviceId(payload);
    } catch {
      deviceId = `${rinfo.address}:${rinfo.port}`;
    }

    if (deviceId) {
      this.relayToFrontends(deviceId, payload, /* isAudio */ true);
    }
  }

  private handleAck(_msg: Buffer, _rinfo: dgram.RemoteInfo): void {
    // ACK from device — currently forwarded by handleVideoFrame response
    // Reserved for future use
  }

  private handleKeepalive(_msg: Buffer, rinfo: dgram.RemoteInfo): void {
    // 更新最后活跃时间，维持 NAT 映射
    for (const [deviceId, entry] of this.deviceNatMap) {
      if (entry.publicIp === rinfo.address) {
        entry.lastSeen = Date.now();
        break;
      }
    }
  }

  /**
   * 从 Protobuf payload 中提取 deviceId (field 1, wire type 2 = length-delimited).
   * 简化解析：线性扫描 tag → 找到 field 1 → 读取长度+内容。
   */
  private extractDeviceId(payload: Buffer): string {
    const bytes = this.extractField(payload, 1);
    return bytes ? bytes.toString('utf-8') : '';
  }

  /**
   * 从 Protobuf payload 中提取指定字段的原始值。
   * 返回 undefined 如果未找到。
   */
  private extractField(payload: Buffer, fieldNumber: number): Buffer | undefined {
    let offset = 0;
    while (offset < payload.length) {
      const tag = this.decodeVarint(payload.subarray(offset));
      offset += tag.byteLength;
      const wireType = Number(tag.value & 0x7n);
      const fNum = Number(tag.value >> 3n);

      if (wireType === 0) {
        // Varint
        const val = this.decodeVarint(payload.subarray(offset));
        if (fNum === fieldNumber) {
          return payload.subarray(offset, offset + val.byteLength);
        }
        offset += val.byteLength;
      } else if (wireType === 2) {
        // Length-delimited
        const lenTag = this.decodeVarint(payload.subarray(offset));
        offset += lenTag.byteLength;
        const len = Number(lenTag.value);
        if (fNum === fieldNumber) {
          return payload.subarray(offset, offset + len);
        }
        offset += len;
      } else if (wireType === 1) {
        // 64-bit (fixed64)
        if (fNum === fieldNumber) {
          return payload.subarray(offset, offset + 8);
        }
        offset += 8;
      } else if (wireType === 5) {
        // 32-bit (fixed32)
        if (fNum === fieldNumber) {
          return payload.subarray(offset, offset + 4);
        }
        offset += 4;
      } else {
        break; // 未知 wire type, 停止解析
      }
    }
    return undefined;
  }

  private decodeVarint(buf: Buffer): { value: bigint; byteLength: number } {
    let value = 0n;
    let shift = 0;
    let byteLength = 0;
    for (let i = 0; i < buf.length && i < 10; i++) {
      const b = buf[i];
      value |= BigInt(b & 0x7f) << BigInt(shift);
      byteLength++;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return { value, byteLength };
  }

  private relayToFrontends(deviceId: string, data: Buffer, isAudio = false): void {
    const frontends = this.frontendRelays.get(deviceId);
    if (!frontends || frontends.size === 0) return;

    // 给前端发送类型标记的二进制消息
    const header = isAudio ? 0x05 : 0x02;
    const frame = Buffer.alloc(1 + data.length);
    frame[0] = header;
    data.copy(frame, 1);

    for (const ws of frontends) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(frame);
        } catch {
          // 前端断开，懒清理
        }
      }
    }
  }
}

export const udpRelay = new UdpRelay();
