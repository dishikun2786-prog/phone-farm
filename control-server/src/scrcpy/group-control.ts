/**
 * GroupControl — device group management + input broadcast engine.
 *
 * Manages device groups for synchronized multi-device control.
 * When the master device receives touch/key/scroll input, it's broadcast
 * to all other online devices in the same group.
 */
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { AvRelayManager } from './scrcpy-manager';

export interface DeviceGroup {
  id: string;
  name: string;
  deviceIds: string[];
  masterDeviceId: string;
  syncMode: 'mirror' | 'independent';
  createdAt: string;
}

const GROUPS_FILE = path.join(process.cwd(), '.dev-groups.json');

export class GroupControl {
  private groups: Map<string, DeviceGroup> = new Map();
  private avRelayManager: AvRelayManager;

  constructor(avRelayManager: AvRelayManager) {
    this.avRelayManager = avRelayManager;
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(GROUPS_FILE)) {
        const data = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf-8'));
        for (const g of data) {
          this.groups.set(g.id, g);
        }
      }
    } catch { /* */ }
  }

  private save(): void {
    fs.writeFileSync(GROUPS_FILE, JSON.stringify([...this.groups.values()], null, 2));
  }

  getAll(): DeviceGroup[] {
    return [...this.groups.values()];
  }

  get(id: string): DeviceGroup | undefined {
    return this.groups.get(id);
  }

  create(name: string, deviceIds: string[]): DeviceGroup {
    const group: DeviceGroup = {
      id: randomUUID(),
      name,
      deviceIds,
      masterDeviceId: deviceIds[0] || '',
      syncMode: 'mirror',
      createdAt: new Date().toISOString(),
    };
    this.groups.set(group.id, group);
    this.save();
    return group;
  }

  update(id: string, updates: Partial<Pick<DeviceGroup, 'name' | 'deviceIds' | 'masterDeviceId' | 'syncMode'>>): DeviceGroup | null {
    const group = this.groups.get(id);
    if (!group) return null;
    Object.assign(group, updates);
    this.save();
    return group;
  }

  delete(id: string): boolean {
    const ok = this.groups.delete(id);
    if (ok) this.save();
    return ok;
  }

  getGroupsForDevice(deviceId: string): DeviceGroup[] {
    return [...this.groups.values()].filter(g => g.deviceIds.includes(deviceId));
  }

  /**
   * Broadcast a control message from the master device to all other
   * online devices in the same group (mirror mode only).
   */
  broadcast(groupId: string, sourceDeviceId: string, message: { type: string; action?: string; x?: number; y?: number; pressure?: number; keycode?: number; hscroll?: number; vscroll?: number; pointerId?: number }): number {
    const group = this.groups.get(groupId);
    if (!group || group.syncMode !== 'mirror') return 0;

    let count = 0;
    for (const deviceId of group.deviceIds) {
      if (deviceId === sourceDeviceId) continue;
      if (!this.avRelayManager.hasSession(deviceId)) continue;

      switch (message.type) {
        case 'touch': {
          const action = message.action === 'down' ? 0 : message.action === 'up' ? 1 : 2;
          const ok = this.avRelayManager.injectTouch(deviceId, action, message.x ?? 0, message.y ?? 0, message.pressure ?? 1);
          if (ok) count++;
          break;
        }
        case 'key': {
          const action = message.action === 'down' ? 0 : 1;
          const ok = this.avRelayManager.injectKey(deviceId, message.keycode ?? 0, action);
          if (ok) count++;
          break;
        }
        case 'scroll': {
          const ok = this.avRelayManager.injectScroll(deviceId, message.x ?? 0, message.y ?? 0, message.hscroll ?? 0, message.vscroll ?? 0);
          if (ok) count++;
          break;
        }
      }
    }
    return count;
  }
}
