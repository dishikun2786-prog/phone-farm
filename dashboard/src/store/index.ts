import { create } from 'zustand';
import { api } from '../lib/api';

interface Device {
  id: string;
  name: string;
  tailscaleIp: string;
  model: string;
  androidVersion: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  currentApp: string;
  battery: number;
  screenOn: boolean;
  lastSeen: string;
  online?: boolean;
}

interface TaskTemplate {
  id: string;
  name: string;
  platform: string;
  scriptName: string;
  description: string;
  defaultConfig: Record<string, unknown>;
}

interface Task {
  id: string;
  name: string;
  templateId: string;
  deviceId: string;
  accountId: string;
  config: Record<string, unknown>;
  cronExpr: string;
  enabled: boolean;
  createdAt: string;
}

interface LiveInfo {
  [deviceId: string]: {
    battery: number;
    currentApp: string;
    screenOn: boolean;
    screenshot?: string;
    taskStatus?: string;
    taskStep?: number;
    taskMessage?: string;
  };
}

interface AppState {
  // Auth
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;

  // Devices
  devices: Device[];
  loadDevices: () => Promise<void>;
  sendCommand: (deviceId: string, action: string, params?: Record<string, unknown>) => Promise<boolean>;

  // Templates
  templates: TaskTemplate[];
  loadTemplates: () => Promise<void>;
  seedTemplates: () => Promise<void>;

  // Tasks
  tasks: Task[];
  loadTasks: () => Promise<void>;
  createTask: (data: Record<string, unknown>) => Promise<void>;
  updateTask: (id: string, data: Record<string, unknown>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  runTask: (id: string) => Promise<void>;
  stopTask: (id: string) => Promise<void>;

  // Live data from WebSocket
  liveInfo: LiveInfo;
  updateLiveInfo: (deviceId: string, info: Partial<LiveInfo[string]>) => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Auth
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),

  login: async (username, password) => {
    const { token } = await api.login(username, password);
    localStorage.setItem('token', token);
    set({ token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, isAuthenticated: false });
  },

  // Devices
  devices: [],

  loadDevices: async () => {
    const devices = await api.getDevices();
    set({ devices });
  },

  sendCommand: async (deviceId, action, params) => {
    const { success } = await api.sendCommand(deviceId, action, params);
    return success;
  },

  // Templates
  templates: [],

  loadTemplates: async () => {
    const templates = await api.getTemplates();
    set({ templates });
  },

  seedTemplates: async () => {
    await api.seedTemplates();
    await get().loadTemplates();
  },

  // Tasks
  tasks: [],

  loadTasks: async () => {
    const tasks = await api.getTasks();
    set({ tasks });
  },

  createTask: async (data) => {
    await api.createTask(data);
    await get().loadTasks();
  },

  updateTask: async (id, data) => {
    await api.updateTask(id, data);
    await get().loadTasks();
  },

  deleteTask: async (id) => {
    await api.deleteTask(id);
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }));
  },

  runTask: async (id) => {
    await api.runTask(id);
  },

  stopTask: async (id) => {
    await api.stopTask(id);
  },

  // Live info
  liveInfo: {},

  updateLiveInfo: (deviceId, info) => {
    set(s => ({
      liveInfo: {
        ...s.liveInfo,
        [deviceId]: { ...(s.liveInfo[deviceId] || {}), ...info },
      },
    }));
  },
}));
