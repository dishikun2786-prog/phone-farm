import { create } from 'zustand';
import type { StateCreator } from 'zustand';

// ── Types (shared across slices) ──

export interface Device {
  id: string; name: string; public_ip: string; model?: string;
  android_version?: string; deeke_version?: string; status: string;
  current_app?: string; battery?: number; screen_on?: boolean;
  last_seen?: string; metadata?: Record<string, unknown>;
}

export interface TaskTemplate {
  id: string; name: string; platform: string; script_name?: string;
  description?: string; default_config?: Record<string, unknown>;
}

export interface Task {
  id: string; name: string; template_id?: string; device_id?: string;
  account_id?: string; config?: Record<string, unknown>; cron_expr?: string;
  enabled?: boolean; status?: string; created_at?: string;
}

export interface LiveInfo {
  currentApp?: string; battery?: number; screenOn?: boolean;
  screenshot?: string; taskStatus?: string; taskStep?: number; taskMessage?: string;
}

export interface VLMEpisode {
  id: string; device_id?: string; task_id?: string; model_name?: string;
  task_prompt?: string; status?: string; total_steps?: number;
  started_at?: string; finished_at?: string; stats?: Record<string, unknown>;
}

export interface VLMScript {
  id: string; name: string; source_code?: string; platform?: string;
  validation_status?: string; created_at?: string;
}

export interface VLMStats {
  totalEpisodes?: number; totalSteps?: number; avgStepsPerEpisode?: number;
  successRate?: number; avgApiLatencyMs?: number; modelUsage?: Record<string, number>;
}

export interface VlmModelConfig {
  id: string; name: string; provider: string; model: string;
  api_url?: string; api_key?: string; enabled?: boolean;
}

export interface UserInfo {
  userId: string; username: string; role: string; phone?: string | null;
}

export type Theme = 'light' | 'dark';

// ── Slice interfaces ──

interface AuthSlice {
  theme: Theme;
  user: UserInfo | null;
  isAuthenticated: boolean;
  loginLoading: boolean;
  loginError: string;
  smsSending: boolean;
  smsCooldown: number;
  _saveAuth: (data: any) => void;
  login: (account: string, password: string) => Promise<void>;
  loginByPhone: (phone: string, code: string) => Promise<void>;
  register: (data: { phone: string; code: string; username?: string; password?: string }) => Promise<void>;
  sendSmsCode: (phone: string, scene: string) => Promise<void>;
  logout: () => void;
  toggleTheme: () => void;
}

interface DeviceSlice {
  devices: Device[];
  devicesLoading: boolean;
  devicesError: string;
  liveInfo: Record<string, LiveInfo>;
  selectedDevices: string[];
  loadDevices: () => Promise<void>;
  sendCommand: (deviceId: string, command: string, params?: Record<string, unknown>) => Promise<void>;
  updateLiveInfo: (deviceId: string, info: Partial<LiveInfo>) => void;
  selectDevice: (deviceId: string) => void;
  deselectDevice: (deviceId: string) => void;
}

interface TaskSlice {
  tasks: Task[];
  templates: TaskTemplate[];
  tasksLoading: boolean;
  tasksError: string;
  loadTasks: () => Promise<void>;
  loadTemplates: () => Promise<void>;
  createTask: (task: Partial<Task>) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  runTask: (id: string) => Promise<void>;
  stopTask: (id: string) => Promise<void>;
  seedTemplates: () => Promise<void>;
}

interface VlmSlice {
  episodes: VLMEpisode[];
  scripts: VLMScript[];
  vlmStats: VLMStats | null;
  models: VlmModelConfig[];
  vlmLoading: boolean;
  vlmError: string;
  loadEpisodes: () => Promise<void>;
  loadScripts: () => Promise<void>;
  loadStats: () => Promise<void>;
  loadModels: () => Promise<void>;
  createModel: (model: Partial<VlmModelConfig>) => Promise<void>;
  updateModel: (id: string, updates: Partial<VlmModelConfig>) => Promise<void>;
  deleteModel: (id: string) => Promise<void>;
}

interface TenantSlice {
  tenants: Tenant[];
  currentTenant: Tenant | null;
  tenantsLoading: boolean;
  tenantsError: string;
  loadTenants: (search?: string) => Promise<void>;
  loadCurrentTenant: () => Promise<void>;
  createTenant: (data: Partial<Tenant>) => Promise<void>;
  updateTenant: (id: string, data: Partial<Tenant>) => Promise<void>;
  deleteTenant: (id: string) => Promise<void>;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  status: string;
  maxDevices: number;
  maxUsers: number;
  features: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface SystemSlice {
  systemConfig: Record<string, string>;
  featureFlags: Record<string, boolean>;
  infraStatus: Record<string, string>;
  systemLoading: boolean;
  loadSystemConfig: () => Promise<void>;
  updateSystemConfig: (key: string, value: string) => Promise<void>;
  loadFeatureFlags: () => Promise<void>;
  toggleFeatureFlag: (key: string) => Promise<void>;
  loadInfraStatus: () => Promise<void>;
}

export type AppState = AuthSlice & DeviceSlice & TaskSlice & VlmSlice & SystemSlice & TenantSlice;

// ── Lazy API ref (avoids circular dependency) ──

let _api: any;
function getApi() {
  if (!_api) {
    _api = require('../lib/api').api;
  }
  return _api;
}

// ── Auth Slice ──

const USER_FRIENDLY_ERRORS: Record<string, string> = {
  TIMEOUT: '连接服务器超时，请检查网络',
  NETWORK: '无法连接到服务器，请检查网络连接',
  UNAUTHORIZED: '用户名或密码错误',
  FORBIDDEN: '没有权限登录',
  SERVER: '服务器错误，请稍后再试',
  VALIDATION: '用户名和密码不能为空',
  UNKNOWN: '登录失败，请稍后再试',
};

const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
  theme: (localStorage.getItem('theme') as Theme) || 'light',
  user: null,
  isAuthenticated: !!localStorage.getItem('token'),
  loginLoading: false,
  loginError: '',
  smsSending: false,
  smsCooldown: 0,

  _saveAuth: (data: any) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('refreshToken', data.refreshToken || '');
    set({
      isAuthenticated: true,
      user: {
        userId: data.user?.id ?? data.user?.userId,
        username: data.user?.username,
        role: data.user?.role,
        phone: data.user?.phone ?? null,
      },
      loginLoading: false,
      loginError: '',
    });
  },

  login: async (account, password) => {
    set({ loginLoading: true, loginError: '' });
    try {
      const api = getApi();
      const data = await api.login(account, password);
      get()._saveAuth(data);
    } catch (err: any) {
      const code = err?.code ?? 'UNKNOWN';
      const friendly = USER_FRIENDLY_ERRORS[code] ?? err?.message ?? '登录失败';
      set({ loginLoading: false, loginError: friendly });
      throw err;
    }
  },

  loginByPhone: async (phone, code) => {
    set({ loginLoading: true, loginError: '' });
    try {
      const api = getApi();
      const data = await api.loginByPhone(phone, code);
      get()._saveAuth(data);
    } catch (err: any) {
      const code = err?.code ?? 'UNKNOWN';
      const friendly = USER_FRIENDLY_ERRORS[code] ?? err?.message ?? '登录失败';
      set({ loginLoading: false, loginError: friendly });
      throw err;
    }
  },

  register: async (data) => {
    set({ loginLoading: true, loginError: '' });
    try {
      const api = getApi();
      const result = await api.register(data);
      get()._saveAuth(result);
    } catch (err: any) {
      const code = err?.code ?? 'UNKNOWN';
      const friendly = USER_FRIENDLY_ERRORS[code] ?? err?.message ?? '注册失败';
      set({ loginLoading: false, loginError: friendly });
      throw err;
    }
  },

  sendSmsCode: async (phone, scene) => {
    set({ smsSending: true });
    try {
      const api = getApi();
      await api.sendSms(phone, scene);
      set({ smsSending: false, smsCooldown: 60 });
      // Countdown timer
      const timer = setInterval(() => {
        const cd = get().smsCooldown;
        if (cd <= 1) { clearInterval(timer); set({ smsCooldown: 0 }); }
        else set({ smsCooldown: cd - 1 });
      }, 1000);
    } catch (err: any) {
      set({ smsSending: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    set({ isAuthenticated: false, user: null });
  },

  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    set({ theme: next });
  },
});

// ── Device Slice ──

const createDeviceSlice: StateCreator<AppState, [], [], DeviceSlice> = (set) => ({
  devices: [],
  devicesLoading: false,
  devicesError: '',
  liveInfo: {},
  selectedDevices: [],

  loadDevices: async () => {
    set({ devicesLoading: true, devicesError: '' });
    try {
      const api = getApi();
      const data = await api.getDevices();
      set({ devices: data.devices || data || [], devicesLoading: false });
    } catch (err: any) {
      set({ devicesError: err.message || '加载失败', devicesLoading: false });
    }
  },

  sendCommand: async (deviceId, command, params) => {
    const api = getApi();
    await api.sendCommand(deviceId, command, params);
  },

  updateLiveInfo: (deviceId, info) => {
    set((state) => ({
      liveInfo: {
        ...state.liveInfo,
        [deviceId]: { ...(state.liveInfo[deviceId] || {}), ...info },
      },
    }));
  },

  selectDevice: (deviceId) => {
    set((state) => ({
      selectedDevices: state.selectedDevices.includes(deviceId)
        ? state.selectedDevices.filter((d) => d !== deviceId)
        : [...state.selectedDevices, deviceId],
    }));
  },

  deselectDevice: (deviceId) => {
    set((state) => ({
      selectedDevices: state.selectedDevices.filter((d) => d !== deviceId),
    }));
  },
});

// ── Task Slice ──

const createTaskSlice: StateCreator<AppState, [], [], TaskSlice> = (set) => ({
  tasks: [],
  templates: [],
  tasksLoading: false,
  tasksError: '',

  loadTasks: async () => {
    set({ tasksLoading: true, tasksError: '' });
    try {
      const api = getApi();
      const data = await api.getTasks();
      set({ tasks: data.tasks || data || [], tasksLoading: false });
    } catch (err: any) {
      set({ tasksError: err.message || '加载失败', tasksLoading: false });
    }
  },

  loadTemplates: async () => {
    try {
      const api = getApi();
      const data = await api.getTemplates();
      set({ templates: data.templates || data || [] });
    } catch { console.warn('Store: non-critical load failed'); }
  },

  createTask: async (task) => { const api = getApi(); await api.createTask(task); },
  updateTask: async (id, updates) => { const api = getApi(); await api.updateTask(id, updates); },
  deleteTask: async (id) => { const api = getApi(); await api.deleteTask(id); },
  runTask: async (id) => { const api = getApi(); await api.runTask(id); },
  stopTask: async (id) => { const api = getApi(); await api.stopTask(id); },
  seedTemplates: async () => { const api = getApi(); await api.seedTemplates(); },
});

// ── VLM Slice ──

const createVlmSlice: StateCreator<AppState, [], [], VlmSlice> = (set) => ({
  episodes: [],
  scripts: [],
  vlmStats: null,
  models: [],
  vlmLoading: false,
  vlmError: '',

  loadEpisodes: async () => {
    set({ vlmLoading: true, vlmError: '' });
    try {
      const api = getApi();
      const data = await api.vlmGetEpisodes();
      set({ episodes: data.episodes || data || [], vlmLoading: false });
    } catch (err: any) {
      set({ vlmError: err.message || '加载失败', vlmLoading: false });
    }
  },

  loadScripts: async () => {
    try {
      const api = getApi();
      const data = await api.getScripts();
      set({ scripts: data.scripts || data || [] });
    } catch { console.warn('Store: non-critical load failed'); }
  },

  loadStats: async () => {
    try { const api = getApi(); const data = await api.vlmGetStats(); set({ vlmStats: data }); } catch { console.warn('Store: load failed'); }
  },

  loadModels: async () => {
    try { const api = getApi(); const data = await api.vlmGetModels(); set({ models: data.models || data || [] }); } catch { console.warn('Store: load failed'); }
  },

  createModel: async (model) => { const api = getApi(); await api.vlmCreateModel(model); },
  updateModel: async (id, updates) => { const api = getApi(); await api.vlmUpdateModel(id, updates); },
  deleteModel: async (id) => { const api = getApi(); await api.vlmDeleteModel(id); },
});

// ── System Slice ──

const createSystemSlice: StateCreator<AppState, [], [], SystemSlice> = (set) => ({
  systemConfig: {},
  featureFlags: {},
  infraStatus: {},
  systemLoading: false,

  loadSystemConfig: async () => {
    set({ systemLoading: true });
    try {
      const api = getApi();
      const data = await api.getSystemConfig();
      set({ systemConfig: data.config || data || {}, systemLoading: false });
    } catch { console.warn('Store: load failed'); set({ systemLoading: false }); }
  },

  updateSystemConfig: async (key, value) => {
    const api = getApi();
    await api.updateSystemConfig(key, value);
    set((state) => ({ systemConfig: { ...state.systemConfig, [key]: value } }));
  },

  loadFeatureFlags: async () => {
    try { const api = getApi(); const data = await api.getFeatureFlags(); set({ featureFlags: data.flags || data || {} }); } catch { console.warn('Store: load failed'); }
  },

  toggleFeatureFlag: async (key) => {
    const api = getApi();
    await api.toggleFeatureFlag(key);
    set((state) => ({ featureFlags: { ...state.featureFlags, [key]: !state.featureFlags[key] } }));
  },

  loadInfraStatus: async () => {
    try { const api = getApi(); const data = await api.getInfraStatus(); set({ infraStatus: data.status || data || {} }); } catch { console.warn('Store: load failed'); }
  },
});

// ── Tenant Slice ──

const createTenantSlice: StateCreator<AppState, [], [], TenantSlice> = (set) => ({
  tenants: [],
  currentTenant: null,
  tenantsLoading: false,
  tenantsError: '',

  loadTenants: async (search?: string) => {
    set({ tenantsLoading: true, tenantsError: '' });
    try {
      const api = getApi();
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const data = await api.getTenants(params);
      set({ tenants: data.tenants || data || [], tenantsLoading: false });
    } catch (err: any) {
      set({ tenantsError: err.message || '加载失败', tenantsLoading: false });
    }
  },

  loadCurrentTenant: async () => {
    try {
      const api = getApi();
      const data = await api.getCurrentTenant();
      set({ currentTenant: data });
    } catch { console.warn('Store: tenant load failed'); }
  },

  createTenant: async (data) => {
    const api = getApi();
    await api.createTenant(data);
  },

  updateTenant: async (id, data) => {
    const api = getApi();
    await api.updateTenant(id, data);
  },

  deleteTenant: async (id) => {
    const api = getApi();
    await api.deleteTenant(id);
  },
});

// ── Combined Store ──

export const useStore = create<AppState>()((...a) => ({
  ...createAuthSlice(...a),
  ...createDeviceSlice(...a),
  ...createTaskSlice(...a),
  ...createVlmSlice(...a),
  ...createSystemSlice(...a),
  ...createTenantSlice(...a),
}));
