import { create } from 'zustand';
import { api, ApiError } from '../lib/api';
import { toast } from '../hooks/useToast';

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
  runtime?: string;
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

interface VLMEpisode {
  episodeId: string;
  deviceId: string;
  deviceName?: string;
  taskPrompt: string;
  modelName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stopped';
  totalSteps: number;
  totalDurationMs: number;
  message?: string;
  createdAt: string;
  updatedAt?: string;
}

interface VLMScript {
  id: string;
  name: string;
  platform: string;
  episodeId: string;
  episodeName?: string;
  selectorCount: number;
  validationStatus: 'untested' | 'passed' | 'failed';
  sourceCode?: string;
  createdAt: string;
  updatedAt?: string;
}

interface VLMStats {
  totalEpisodes: number;
  successRate: number;
  avgStepsPerTask: number;
  totalVLMCost: number;
  episodesByPlatform: { platform: string; count: number }[];
  successRateOverTime: { date: string; rate: number }[];
  topScripts: { id: string; name: string; usageCount: number }[];
}

interface VlmModelConfig {
  id: string;
  name: string;
  modelName: string;
  modelType: 'autoglm' | 'qwenvl' | 'uitars' | 'maiui' | 'guiowl';
  apiUrl: string;
  apiKey?: string;
  maxTokens: number;
  temperature: number;
  pricing: {
    inputPer1kTokens: number;
    outputPer1kTokens: number;
    perImage?: number;
  };
  isDefault: boolean;
  isEnabled: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface UserInfo {
  username: string;
  role: 'super_admin' | 'admin' | 'operator' | 'viewer';
}

function decodeJwt(token: string): UserInfo | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1]!;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const data = JSON.parse(json);
    if (data.username && data.role) {
      return { username: data.username, role: data.role };
    }
    return null;
  } catch { return null; }
}

type Theme = 'light' | 'dark';

interface AppState {
  // Theme
  theme: Theme;
  toggleTheme: () => void;

  // Auth
  token: string | null;
  isAuthenticated: boolean;
  user: UserInfo | null;
  loginLoading: boolean;
  loginError: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;

  // Devices
  devices: Device[];
  devicesLoading: boolean;
  devicesError: string;
  devicesUpdatedAt: number;
  loadDevices: () => Promise<void>;
  sendCommand: (deviceId: string, action: string, params?: Record<string, unknown>) => Promise<boolean>;

  // Templates
  templates: TaskTemplate[];
  templatesLoading: boolean;
  templatesError: string;
  loadTemplates: () => Promise<void>;
  seedTemplates: () => Promise<void>;

  // Tasks
  tasks: Task[];
  tasksLoading: boolean;
  tasksError: string;
  tasksUpdatedAt: number;
  loadTasks: () => Promise<void>;
  createTask: (data: Record<string, unknown>) => Promise<void>;
  updateTask: (id: string, data: Record<string, unknown>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  runTask: (id: string) => Promise<void>;
  stopTask: (id: string) => Promise<void>;

  // VLM Episodes
  episodes: VLMEpisode[];
  episodesLoading: boolean;
  episodesError: string;
  loadEpisodes: (params?: { deviceId?: string; status?: string; modelName?: string }) => Promise<void>;

  // VLM Scripts
  scripts: VLMScript[];
  scriptsLoading: boolean;
  scriptsError: string;
  loadScripts: () => Promise<void>;

  // VLM Stats
  stats: VLMStats | null;
  statsLoading: boolean;
  statsError: string;
  loadStats: () => Promise<void>;

  // Live data from WebSocket
  liveInfo: LiveInfo;
  updateLiveInfo: (deviceId: string, info: Partial<LiveInfo[string]>) => void;

  // VLM Model Config
  models: VlmModelConfig[];
  modelsLoading: boolean;
  modelsError: string;
  loadModels: () => Promise<void>;
  createModel: (data: Record<string, unknown>) => Promise<void>;
  updateModel: (id: string, data: Record<string, unknown>) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return 'light';
}

export const useStore = create<AppState>((set, get) => ({
  // Theme
  theme: getInitialTheme(),
  toggleTheme: () => {
    set(s => {
      const next: Theme = s.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      return { theme: next };
    });
  },

  // Auth
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  user: localStorage.getItem('token') ? decodeJwt(localStorage.getItem('token')!) : null,
  loginLoading: false,
  loginError: '',

  login: async (username, password) => {
    set({ loginLoading: true, loginError: '' });
    try {
      const { token } = await api.login(username, password);
      localStorage.setItem('token', token);
      const user = decodeJwt(token);
      set({ token, isAuthenticated: true, user, loginLoading: false });
      toast('success', '登录成功');
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '登录失败，请检查网络连接';
      set({ loginLoading: false, loginError: msg });
      toast('error', msg);
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, isAuthenticated: false, user: null });
  },

  // Devices
  devices: [],
  devicesLoading: false,
  devicesError: '',
  devicesUpdatedAt: 0,

  loadDevices: async () => {
    set({ devicesLoading: true, devicesError: '' });
    try {
      const devices = await api.getDevices();
      set({ devices, devicesLoading: false, devicesUpdatedAt: Date.now() });
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '加载设备列表失败';
      set({ devicesLoading: false, devicesError: msg });
      toast('error', msg);
    }
  },

  sendCommand: async (deviceId, action, params) => {
    try {
      const { success } = await api.sendCommand(deviceId, action, params);
      if (!success) toast('warning', `命令发送失败: 设备可能已离线`);
      return success;
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '命令发送失败';
      toast('error', msg);
      return false;
    }
  },

  // Templates
  templates: [],
  templatesLoading: false,
  templatesError: '',

  loadTemplates: async () => {
    set({ templatesLoading: true, templatesError: '' });
    try {
      const templates = await api.getTemplates();
      set({ templates, templatesLoading: false });
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '加载模板失败';
      set({ templatesLoading: false, templatesError: msg });
      toast('error', msg);
    }
  },

  seedTemplates: async () => {
    try {
      await api.seedTemplates();
      toast('success', '模板初始化成功');
      await get().loadTemplates();
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '模板初始化失败';
      toast('error', msg);
    }
  },

  // Tasks
  tasks: [],
  tasksLoading: false,
  tasksError: '',
  tasksUpdatedAt: 0,

  loadTasks: async () => {
    set({ tasksLoading: true, tasksError: '' });
    try {
      const tasks = await api.getTasks();
      set({ tasks, tasksLoading: false, tasksUpdatedAt: Date.now() });
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '加载任务列表失败';
      set({ tasksLoading: false, tasksError: msg });
      toast('error', msg);
    }
  },

  createTask: async (data) => {
    try {
      await api.createTask(data);
      toast('success', '任务创建成功');
      await get().loadTasks();
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '创建任务失败';
      toast('error', msg);
      throw err;
    }
  },

  updateTask: async (id, data) => {
    try {
      await api.updateTask(id, data);
      toast('success', '任务更新成功');
      await get().loadTasks();
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '更新任务失败';
      toast('error', msg);
      throw err;
    }
  },

  deleteTask: async (id) => {
    try {
      await api.deleteTask(id);
      set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }));
      toast('success', '任务已删除');
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '删除任务失败';
      toast('error', msg);
      throw err;
    }
  },

  runTask: async (id) => {
    try {
      await api.runTask(id);
      toast('success', '任务已启动');
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '启动任务失败';
      toast('error', msg);
      throw err;
    }
  },

  stopTask: async (id) => {
    try {
      await api.stopTask(id);
      toast('info', '任务已停止');
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '停止任务失败';
      toast('error', msg);
      throw err;
    }
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

  // VLM Episodes
  episodes: [],
  episodesLoading: false,
  episodesError: '',

  loadEpisodes: async (params) => {
    set({ episodesLoading: true, episodesError: '' });
    try {
      const episodes = await api.vlmGetEpisodes(params);
      set({ episodes, episodesLoading: false });
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '加载 Episode 列表失败';
      set({ episodesLoading: false, episodesError: msg });
      toast('error', msg);
    }
  },

  // VLM Scripts
  scripts: [],
  scriptsLoading: false,
  scriptsError: '',

  loadScripts: async () => {
    set({ scriptsLoading: true, scriptsError: '' });
    try {
      const scripts = await api.vlmGetScripts();
      set({ scripts, scriptsLoading: false });
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '加载脚本列表失败';
      set({ scriptsLoading: false, scriptsError: msg });
      toast('error', msg);
    }
  },

  // VLM Stats
  stats: null,
  statsLoading: false,
  statsError: '',

  loadStats: async () => {
    set({ statsLoading: true, statsError: '' });
    try {
      const stats = await api.vlmGetStats();
      set({ stats, statsLoading: false });
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '加载统计数据失败';
      set({ statsLoading: false, statsError: msg });
      toast('error', msg);
    }
  },

  // VLM Model Config
  models: [],
  modelsLoading: false,
  modelsError: '',

  loadModels: async () => {
    set({ modelsLoading: true, modelsError: '' });
    try {
      const models = await api.vlmGetModels();
      set({ models, modelsLoading: false });
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '加载模型配置失败';
      set({ modelsLoading: false, modelsError: msg });
      toast('error', msg);
    }
  },

  createModel: async (data) => {
    try {
      await api.vlmCreateModel(data);
      toast('success', '模型已添加');
      await get().loadModels();
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '添加模型失败';
      toast('error', msg);
      throw err;
    }
  },

  updateModel: async (id, data) => {
    try {
      await api.vlmUpdateModel(id, data);
      toast('success', '模型已更新');
      await get().loadModels();
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '更新模型失败';
      toast('error', msg);
      throw err;
    }
  },

  deleteModel: async (id) => {
    try {
      await api.vlmDeleteModel(id);
      toast('success', '模型已删除');
      await get().loadModels();
    } catch (err: any) {
      const msg = err instanceof ApiError ? err.message : '删除模型失败';
      toast('error', msg);
      throw err;
    }
  },
}));
