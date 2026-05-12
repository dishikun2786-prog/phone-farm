import { create } from 'zustand';
import { api } from '../lib/api';
import { toast } from '../hooks/useToast';

export interface DeviceGroup {
  id: string;
  name: string;
  deviceIds: string[];
  masterDeviceId: string;
  syncMode: 'mirror' | 'independent';
  createdAt: string;
}

interface GroupState {
  groups: DeviceGroup[];
  activeGroupId: string | null;
  masterDeviceId: string | null;
  loading: boolean;
  loadGroups: () => Promise<void>;
  createGroup: (name: string, deviceIds: string[]) => Promise<DeviceGroup | null>;
  updateGroup: (id: string, updates: Partial<DeviceGroup>) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  setActiveGroup: (groupId: string | null) => void;
  setMasterDevice: (deviceId: string | null) => void;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  activeGroupId: null,
  masterDeviceId: null,
  loading: false,

  loadGroups: async () => {
    set({ loading: true });
    try {
      const groups = await api.getGroups();
      set({ groups, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createGroup: async (name, deviceIds) => {
    try {
      const group = await api.createGroup({ name, deviceIds });
      set(s => ({ groups: [...s.groups, group] }));
      toast('success', `分组「${name}」已创建`);
      return group;
    } catch (err: any) {
      toast('error', err.message || '创建分组失败');
      return null;
    }
  },

  updateGroup: async (id, updates) => {
    try {
      const updated = await api.updateGroup(id, updates);
      set(s => ({ groups: s.groups.map(g => g.id === id ? updated : g) }));
    } catch (err: any) {
      toast('error', err.message || '更新分组失败');
    }
  },

  deleteGroup: async (id) => {
    try {
      await api.deleteGroup(id);
      set(s => ({ groups: s.groups.filter(g => g.id !== id) }));
      toast('info', '分组已删除');
    } catch (err: any) {
      toast('error', err.message || '删除分组失败');
    }
  },

  setActiveGroup: (groupId) => set({ activeGroupId: groupId }),
  setMasterDevice: (deviceId) => set({ masterDeviceId: deviceId }),
}));
