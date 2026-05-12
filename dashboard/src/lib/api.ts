const API_BASE = '/api/v1';
const REQUEST_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  code: 'TIMEOUT' | 'NETWORK' | 'UNAUTHORIZED' | 'SERVER' | 'UNKNOWN';
  status?: number;

  constructor(
    message: string,
    code: 'TIMEOUT' | 'NETWORK' | 'UNAUTHORIZED' | 'SERVER' | 'UNKNOWN',
    status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request(path: string, options?: RequestInit) {
  const token = localStorage.getItem('token');
  const hasBody = options?.body != null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new ApiError('请求超时，请检查网络连接', 'TIMEOUT');
    }
    throw new ApiError('无法连接到服务器', 'NETWORK');
  }
  clearTimeout(timeoutId);

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new ApiError('登录已过期，请重新登录', 'UNAUTHORIZED', 401);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const code = res.status >= 500 ? 'SERVER' : 'UNKNOWN';
    throw new ApiError(err.error || res.statusText, code, res.status);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  // Devices
  getDevices: () => request('/devices'),
  getDevice: (id: string) => request(`/devices/${id}`),
  sendCommand: (id: string, action: string, params?: Record<string, unknown>) =>
    request(`/devices/${id}/command`, { method: 'POST', body: JSON.stringify({ action, params }) }),

  // Tasks
  getTasks: () => request('/tasks'),
  getTask: (id: string) => request(`/tasks/${id}`),
  createTask: (data: Record<string, unknown>) =>
    request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: string, data: Record<string, unknown>) =>
    request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id: string) =>
    request(`/tasks/${id}`, { method: 'DELETE' }),
  runTask: (id: string) =>
    request(`/tasks/${id}/run`, { method: 'POST' }),
  stopTask: (id: string) =>
    request(`/tasks/${id}/stop`, { method: 'POST' }),
  getTaskLogs: (id: string) => request(`/tasks/${id}/logs`),

  // Task Templates
  getTemplates: () => request('/task-templates'),
  seedTemplates: () => request('/seed-templates', { method: 'POST' }),

  // Accounts
  getAccounts: () => request('/accounts'),
  createAccount: (data: Record<string, unknown>) =>
    request('/accounts', { method: 'POST', body: JSON.stringify(data) }),
  deleteAccount: (id: string) =>
    request(`/accounts/${id}`, { method: 'DELETE' }),

  // Health
  health: () => request('/health'),

  // VLM Agent
  vlmExecute: (deviceId: string, task: string, options?: { modelName?: string; maxSteps?: number; lang?: string }) =>
    request('/vlm/execute', { method: 'POST', body: JSON.stringify({ deviceId, task, ...options }) }),
  vlmStop: (deviceId: string) =>
    request(`/vlm/stop/${deviceId}`, { method: 'POST' }),
  vlmGetEpisodes: (params?: { deviceId?: string; status?: string; modelName?: string }) => {
    const search = new URLSearchParams();
    if (params?.deviceId) search.set('deviceId', params.deviceId);
    if (params?.status) search.set('status', params.status);
    if (params?.modelName) search.set('modelName', params.modelName);
    const qs = search.toString();
    return request(`/vlm/episodes${qs ? `?${qs}` : ''}`);
  },
  vlmGetEpisode: (id: string) => request(`/vlm/episodes/${id}`),
  vlmDeleteEpisode: (id: string) =>
    request(`/vlm/episodes/${id}`, { method: 'DELETE' }),
  vlmCompileEpisode: (id: string, data?: { scriptName?: string; platform?: string }) =>
    request(`/vlm/episodes/${id}/compile`, { method: 'POST', body: JSON.stringify(data || {}) }),
  vlmGetScripts: () => request('/vlm/scripts'),
  vlmGetScript: (id: string) => request(`/vlm/scripts/${id}`),
  vlmDeleteScript: (id: string) =>
    request(`/vlm/scripts/${id}`, { method: 'DELETE' }),
  vlmValidateScript: (id: string) =>
    request(`/vlm/scripts/${id}/validate`, { method: 'POST' }),
  vlmDownloadScript: (id: string) =>
    request(`/vlm/scripts/${id}/download`),
  vlmGetStats: () => request('/vlm/stats'),

  // VLM Model Config
  vlmGetModels: () => request('/vlm/models'),
  vlmGetModel: (id: string) => request(`/vlm/models/${id}`),
  vlmCreateModel: (data: Record<string, unknown>) =>
    request('/vlm/models', { method: 'POST', body: JSON.stringify(data) }),
  vlmUpdateModel: (id: string, data: Record<string, unknown>) =>
    request(`/vlm/models/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  vlmDeleteModel: (id: string) =>
    request(`/vlm/models/${id}`, { method: 'DELETE' }),
  vlmTestModel: (id: string) =>
    request(`/vlm/models/${id}/test`, { method: 'POST' }),
  vlmGetABTests: () => request('/vlm/models/ab-test'),
  vlmRunABTest: (data: { modelAId: string; modelBId: string; episodeId: string }) =>
    request('/vlm/models/ab-test', { method: 'POST', body: JSON.stringify(data) }),

  // Scrcpy screen mirroring
  scrcpyStart: (deviceId: string, options?: { tailscaleIp: string; maxSize?: number; bitRate?: number }) =>
    request(`/scrcpy/start/${deviceId}`, { method: 'POST', body: JSON.stringify(options || {}) }),
  scrcpyStop: (deviceId: string) =>
    request(`/scrcpy/stop/${deviceId}`, { method: 'POST' }),
  scrcpyStatus: (deviceId: string) =>
    request(`/scrcpy/status/${deviceId}`),

  // Recording
  scrcpyStartRecording: (deviceId: string) =>
    request(`/scrcpy/${deviceId}/recording/start`, { method: 'POST' }),
  scrcpyStopRecording: (deviceId: string) =>
    request(`/scrcpy/${deviceId}/recording/stop`, { method: 'POST' }),
  scrcpyDownloadRecording: async (deviceId: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/scrcpy/${deviceId}/recording/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError('Download failed', 'UNKNOWN');
    return res.blob();
  },
  scrcpyUpdateSettings: (deviceId: string, settings: { maxSize?: number; bitRate?: number; maxFps?: number }) =>
    request(`/scrcpy/${deviceId}/video/settings`, { method: 'PUT', body: JSON.stringify(settings) }),
  scrcpyTakeScreenshot: (deviceId: string) =>
    request(`/scrcpy/${deviceId}/screenshot`, { method: 'POST' }),

  // Audio
  scrcpyAudioStart: (deviceId: string) =>
    request(`/scrcpy/${deviceId}/audio/start`, { method: 'POST' }),
  scrcpyAudioStop: (deviceId: string) =>
    request(`/scrcpy/${deviceId}/audio/stop`, { method: 'POST' }),

  // Group control
  getGroups: () => request('/groups'),
  getGroup: (id: string) => request(`/groups/${id}`),
  createGroup: (data: { name: string; deviceIds: string[] }) =>
    request('/groups', { method: 'POST', body: JSON.stringify(data) }),
  updateGroup: (id: string, data: Record<string, unknown>) =>
    request(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGroup: (id: string) =>
    request(`/groups/${id}`, { method: 'DELETE' }),

  // Keymap profiles
  getKeymaps: () => request('/keymaps'),
  getKeymap: (id: string) => request(`/keymaps/${id}`),
  createKeymap: (data: Record<string, unknown>) =>
    request('/keymaps', { method: 'POST', body: JSON.stringify(data) }),
  updateKeymap: (id: string, data: Record<string, unknown>) =>
    request(`/keymaps/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteKeymap: (id: string) =>
    request(`/keymaps/${id}`, { method: 'DELETE' }),

  // File management
  listFiles: (deviceId: string, tailscaleIp: string, dir?: string) => {
    const params = new URLSearchParams({ tailscaleIp });
    if (dir) params.set('dir', dir);
    return request(`/devices/${deviceId}/files/list?${params.toString()}`);
  },
  uploadFile: async (deviceId: string, file: File, tailscaleIp: string, remoteDir?: string) => {
    // Read file as base64 for JSON upload
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    return request(`/devices/${deviceId}/files/upload`, {
      method: 'POST',
      body: JSON.stringify({ tailscaleIp, remoteDir, filename: file.name, data }),
    });
  },

  /** Chunked file upload with progress callback */
  uploadFileChunked: async (
    deviceId: string,
    file: File,
    tailscaleIp: string,
    remoteDir?: string,
    onProgress?: (progress: number) => void,
  ): Promise<{ success: boolean; remotePath?: string; error?: string }> => {
    const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 1. Init upload session
    const init: any = await request(`/devices/${deviceId}/files/upload/init`, {
      method: 'POST',
      body: JSON.stringify({
        tailscaleIp,
        remoteDir,
        filename: file.name,
        totalSize: file.size,
        chunkSize: CHUNK_SIZE,
      }),
    });
    const uploadId = init.uploadId;

    // 2. Send chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const blob = file.slice(start, end);
      const dataB64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] || result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      await request(`/devices/${deviceId}/files/upload/chunk?uploadid=${encodeURIComponent(uploadId)}&chunk=${i}`, {
        method: 'POST',
        body: JSON.stringify({ data: dataB64 }),
      });

      if (onProgress) onProgress((i + 1) / totalChunks);
    }

    // 3. Complete upload
    const result: any = await request(`/devices/${deviceId}/files/upload/complete`, {
      method: 'POST',
      body: JSON.stringify({ uploadId }),
    });

    if (result.error) {
      return { success: false, error: result.error };
    }
    return { success: true, remotePath: result.remotePath };
  },
  deleteFile: (deviceId: string, tailscaleIp: string, filePath: string) => {
    const params = new URLSearchParams({ tailscaleIp, filePath });
    return request(`/devices/${deviceId}/files/delete?${params.toString()}`, { method: 'DELETE' });
  },
  installApk: (deviceId: string, tailscaleIp: string, filePath: string) =>
    request(`/devices/${deviceId}/files/install`, { method: 'POST', body: JSON.stringify({ tailscaleIp, filePath }) }),

  // ADB console
  execAdb: (deviceId: string, tailscaleIp: string, command: string) =>
    request(`/devices/${deviceId}/adb/exec`, { method: 'POST', body: JSON.stringify({ command, tailscaleIp }) }),
  systemInfo: (deviceId: string, tailscaleIp: string) => {
    const params = new URLSearchParams({ tailscaleIp });
    return request(`/devices/${deviceId}/system-info?${params.toString()}`);
  },

  // OTA Script deployment
  getScriptVersion: () => request('/scripts/version'),
  checkDeviceScriptVersion: (deviceId: string) =>
    request(`/scripts/version/${deviceId}`),
  deployScripts: (deviceId: string) =>
    request(`/scripts/deploy/${deviceId}`, { method: 'POST' }),
  deployScriptsBatch: (deviceIds: string[]) =>
    request('/scripts/deploy-batch', { method: 'POST', body: JSON.stringify({ deviceIds }) }),

  // ── Decision Engine (New Edge-Cloud Architecture) ──
  decisionStart: (deviceId: string, taskPrompt: string, options?: { maxSteps?: number; platform?: string }) =>
    request("/decision/start", { method: "POST", body: JSON.stringify({ deviceId, taskPrompt, ...options }) }),
  decisionStop: (deviceId: string, reason?: string) =>
    request("/decision/stop", { method: "POST", body: JSON.stringify({ deviceId, reason }) }),
  decisionStatus: (deviceId: string): Promise<{
    deviceId: string;
    active: boolean;
    taskPrompt?: string;
    stepNumber?: number;
    maxSteps?: number;
    consecutiveFailures?: number;
    consecutiveLowConfidence?: number;
    lastStep?: Record<string, unknown>;
  }> => request(`/decision/status/${deviceId}`),
  decisionStats: () => request("/decision/stats"),

  // ── Stream On-Demand ──
  streamStart: (deviceId: string, options?: { maxSize?: number; bitRate?: number; maxFps?: number; audio?: boolean }) =>
    request("/stream/start", { method: "POST", body: JSON.stringify({ deviceId, options }) }),
  streamStop: (deviceId: string) =>
    request("/stream/stop", { method: "POST", body: JSON.stringify({ deviceId }) }),
  streamStatus: (deviceId: string) => request(`/stream/status/${deviceId}`),
  streamStats: () => request("/stream/stats"),

  // ── Cross-Device Memory ──
  memoryStats: () => request("/memory/stats"),
  memorySyncRules: () => request("/memory/rules/sync", { method: "POST" }),

  // ── Config Management ──
  configGetCategories: () => request("/config/categories"),
  configGetDefinitions: (category?: string) => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    return request(`/config/definitions${qs}`);
  },
  configGetDefinition: (key: string) => request(`/config/definitions/${encodeURIComponent(key)}`),
  configResolve: (params?: { deviceId?: string; groupId?: string; templateId?: string; planId?: string }) => {
    const search = new URLSearchParams();
    if (params?.deviceId) search.set("deviceId", params.deviceId);
    if (params?.groupId) search.set("groupId", params.groupId);
    if (params?.templateId) search.set("templateId", params.templateId);
    if (params?.planId) search.set("planId", params.planId);
    const qs = search.toString();
    return request(`/config/resolve${qs ? `?${qs}` : ""}`);
  },
  configResolveDevice: (deviceId: string) => request(`/config/resolve/${encodeURIComponent(deviceId)}`),
  configGetValues: (params?: { scope?: string; scopeId?: string; definitionId?: string }) => {
    const search = new URLSearchParams();
    if (params?.scope) search.set("scope", params.scope);
    if (params?.scopeId) search.set("scopeId", params.scopeId);
    if (params?.definitionId) search.set("definitionId", params.definitionId);
    const qs = search.toString();
    return request(`/config/values${qs ? `?${qs}` : ""}`);
  },
  configGetScopedValues: (scope: string, scopeId: string) =>
    request(`/config/values/${encodeURIComponent(scope)}/${encodeURIComponent(scopeId)}`),
  configUpdateValue: (data: {
    definitionKey: string;
    scope: string;
    scopeId?: string;
    value: string;
    changeReason?: string;
  }) => request("/config/values", { method: "PUT", body: JSON.stringify(data) }),
  configDeleteValue: (id: string) => request(`/config/values/${id}`, { method: "DELETE" }),
  configGetTemplates: () => request("/config/templates"),
  configCreateTemplate: (data: { name: string; description?: string; values: Record<string, string> }) =>
    request("/config/templates", { method: "POST", body: JSON.stringify(data) }),
  configUpdateTemplate: (id: string, data: { name?: string; description?: string; values?: Record<string, string> }) =>
    request(`/config/templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  configDeleteTemplate: (id: string) => request(`/config/templates/${id}`, { method: "DELETE" }),
  configApplyTemplate: (id: string, targetScope: "device" | "group", targetScopeId: string) =>
    request(`/config/templates/${id}/apply`, { method: "POST", body: JSON.stringify({ targetScope, targetScopeId }) }),
  configGetAuditLog: (params?: { configKey?: string; scope?: string; limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.configKey) search.set("configKey", params.configKey);
    if (params?.scope) search.set("scope", params.scope);
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.offset) search.set("offset", String(params.offset));
    const qs = search.toString();
    return request(`/config/audit-log${qs ? `?${qs}` : ""}`);
  },
  configSeed: () => request("/config/seed", { method: "POST" }),
  configExport: (scope?: string, scopeId?: string) =>
    request("/config/export", { method: "POST", body: JSON.stringify({ scope, scopeId }) }),
  configImport: (data: { values?: any[]; templates?: any[]; overwrite?: boolean }) =>
    request("/config/import", { method: "POST", body: JSON.stringify(data) }),

  // Generic request (used by admin pages and custom endpoints)
  request: (path: string, options?: RequestInit) => request(path, options),
};
