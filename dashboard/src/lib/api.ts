const API_BASE = '/api/v1';
const REQUEST_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RETRY_MAX = 1;               // max 1 retry on 5xx / network errors
const RETRY_BACKOFF_MS = 500;      // initial backoff (doubles each attempt)

export class ApiError extends Error {
  code: 'TIMEOUT' | 'NETWORK' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION' | 'SERVER' | 'UNKNOWN';
  status?: number;

  constructor(
    message: string,
    code: ApiError['code'],
    status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function classifyError(status: number): ApiError['code'] {
  switch (status) {
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 422: return 'VALIDATION';
    default: return status >= 500 ? 'SERVER' : 'UNKNOWN';
  }
}

// ── Request cache + deduplication ──

interface CacheEntry<T = any> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any>>();

function cacheKey(path: string, options?: RequestInit): string {
  return `${options?.method ?? 'GET'}:${path}`;
}

/** Clear all cached responses (call after mutations). */
export function clearApiCache(): void {
  cache.clear();
}

/** Invalidate a specific cached path. */
export function invalidateCache(path: string): void {
  cache.delete(`GET:${path}`);
}

async function request<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const hasBody = options?.body != null;
  const isGet = !options?.method || options.method === 'GET';
  const key = cacheKey(path, options);

  // Serve from cache for GET requests
  if (isGet) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data as T;
  }

  // Deduplicate concurrent requests
  const inflightReq = inflight.get(key);
  if (inflightReq) return inflightReq as Promise<T>;

  // Helper: perform a single fetch attempt, classified errors as ApiError.
  async function attemptFetch(): Promise<{ data?: T; retryable: boolean; error: ApiError }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      const url = path.startsWith('/api/') ? path : `${API_BASE}${path}`;
      res = await fetch(url, {
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
        return { retryable: false, error: new ApiError('请求超时，请检查网络连接', 'TIMEOUT') };
      }
      // Network errors are retryable
      return { retryable: true, error: new ApiError('无法连接到服务器: ' + (err.message || ''), 'NETWORK') };
    }
    clearTimeout(timeoutId);

    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      window.dispatchEvent(new CustomEvent('phonefarm:auth-expired'));
      return { retryable: false, error: new ApiError('登录已过期，请重新登录', 'UNAUTHORIZED', 401) };
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      const errorCode = classifyError(res.status);
      // Retry on 5xx (SERVER) and 429 (rate-limit); no retry on 4xx
      const retryable = res.status >= 500 || res.status === 429;
      return { retryable, error: new ApiError(body.error || res.statusText, errorCode, res.status) };
    }

    const data = await res.json();

    // Cache GET responses
    if (isGet) {
      cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      // Prune old entries if cache grows too large
      if (cache.size > 200) {
        const now = Date.now();
        for (const [k, v] of cache) {
          if (v.expiresAt <= now) cache.delete(k);
        }
      }
    }

    return { data: data as T, retryable: false, error: null as unknown as ApiError };
  }

  // Build and store the fetch promise for inflight deduplication
  const promise = (async (): Promise<T> => {
    // Retry loop: up to RETRY_MAX additional attempts on retryable errors
    let lastError: ApiError | null = null;
    for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
      const result = await attemptFetch();

      if (result.data !== undefined) {
        // Clear GET cache after mutations to avoid stale data
        if (!isGet) cache.clear();
        return result.data as T;
      }

      lastError = result.error;

      // Do not retry if error is not retryable, or this was the last attempt
      if (!result.retryable || attempt >= RETRY_MAX) {
        throw lastError;
      }

      // Wait with exponential backoff before retry
      const backoff = RETRY_BACKOFF_MS * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }

    // Unreachable — satisfied by the throw above
    throw lastError!;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

export const api = {
  // Auth
  login: (account: string, password: string) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ account, password }) }),

  // SMS Auth
  sendSms: (phone: string, scene: 'register' | 'login' | 'reset_password' | 'bind') =>
    request('/auth/send-sms', { method: 'POST', body: JSON.stringify({ phone, scene }) }),
  verifySms: (phone: string, code: string, scene: string) =>
    request('/auth/verify-sms', { method: 'POST', body: JSON.stringify({ phone, code, scene }) }),
  register: (data: { phone: string; code: string; username?: string; password?: string }) =>
    request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  loginByPhone: (phone: string, code: string) =>
    request('/auth/login-phone', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  resetPassword: (phone: string, code: string, newPassword: string) =>
    request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ phone, code, newPassword }) }),

  // User profile
  getProfile: () => request('/users/me'),
  updateProfile: (data: { username?: string }) =>
    request('/users/me', { method: 'PUT', body: JSON.stringify(data) }),
  changePassword: (oldPassword: string, newPassword: string) =>
    request('/users/me/password', { method: 'PUT', body: JSON.stringify({ oldPassword, newPassword }) }),
  bindPhone: (phone: string, code: string) =>
    request('/users/me/bind-phone', { method: 'POST', body: JSON.stringify({ phone, code }) }),

  // Admin: User Management
  getUsers: (params?: { page?: number; pageSize?: number; keyword?: string; role?: string; status?: string }) => {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.pageSize) search.set('pageSize', String(params.pageSize));
    if (params?.keyword) search.set('keyword', params.keyword);
    if (params?.role) search.set('role', params.role);
    if (params?.status) search.set('status', params.status);
    const qs = search.toString();
    return request(`/admin/users${qs ? `?${qs}` : ''}`);
  },
  getUser: (id: string) => request(`/admin/users/${id}`),
  updateUser: (id: string, data: { username?: string; role?: string; status?: string }) =>
    request(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  disableUser: (id: string) => request(`/admin/users/${id}/disable`, { method: 'POST' }),
  enableUser: (id: string) => request(`/admin/users/${id}/enable`, { method: 'POST' }),
  getUserStats: () => request('/admin/users/stats'),
  createUser: (data: { username: string; password: string; phone?: string; role?: string; tenantId?: string }) =>
    request('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  adminResetPassword: (userId: string, newPassword: string) =>
    request(`/admin/users/${userId}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
  deleteUser: (userId: string) =>
    request(`/admin/users/${userId}`, { method: 'DELETE' }),
  getUserBalances: (userIds: string[]) =>
    request('/admin/credits/balances', { method: 'POST', body: JSON.stringify({ userIds }) }),

  // Tenant Management (v2 API)
  getTenants: (params?: string) => request(`/api/v2/tenants${params || ''}`),
  getCurrentTenant: () => request('/api/v2/tenant/current'),
  createTenant: (data: Record<string, unknown>) =>
    request('/api/v2/tenants', { method: 'POST', body: JSON.stringify(data) }),
  updateTenant: (id: string, data: Record<string, unknown>) =>
    request(`/api/v2/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTenant: (id: string) =>
    request(`/api/v2/tenants/${id}`, { method: 'DELETE' }),

  // Tenant User Management
  getTenantUsers: (tenantId: string, params?: { page?: number; pageSize?: number }) => {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.pageSize) search.set('pageSize', String(params.pageSize));
    const qs = search.toString();
    return request(`/api/v2/tenants/${tenantId}/users${qs ? `?${qs}` : ''}`);
  },
  assignUserToTenant: (tenantId: string, userId: string) =>
    request(`/api/v2/tenants/${tenantId}/users`, { method: 'POST', body: JSON.stringify({ userId }) }),
  removeUserFromTenant: (tenantId: string, userId: string) =>
    request(`/api/v2/tenants/${tenantId}/users/${userId}`, { method: 'DELETE' }),

  // Permission Configuration (super_admin only)
  getPermissions: () => request('/admin/permissions'),
  updatePermissions: (role: string, resource: string, actions: string[]) =>
    request('/admin/permissions', { method: 'PUT', body: JSON.stringify({ role, resource, actions }) }),
  resetPermissions: () => request('/admin/permissions/reset', { method: 'POST' }),

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
  seedTemplates: () => request('/admin/seed-templates', { method: 'POST' }),

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

  // ── System Config ──
  systemGetConfig: () => request("/system/config"),
  getSystemConfig: () => request("/system/config"),
  systemGetConfigKey: (key: string) => request(`/system/config/${encodeURIComponent(key)}`),
  systemUpdateConfig: (key: string, value: string, changeReason?: string) =>
    request(`/system/config/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value, changeReason }),
    }),
  updateSystemConfig: (key: string, value: string) =>
    request(`/system/config/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    }),
  systemReloadConfig: () => request("/system/config/reload", { method: "POST" }),
  systemGetFeatureFlags: () => request("/system/feature-flags"),
  getFeatureFlags: () => request("/system/feature-flags"),
  systemToggleFeatureFlag: (key: string, enabled: boolean) =>
    request(`/system/feature-flags/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value: String(enabled) }),
    }),
  toggleFeatureFlag: (key: string) =>
    request(`/system/feature-flags/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ value: "toggle" }),
    }),
  systemGetInfrastructureStatus: () => request("/system/infrastructure/status"),
  getInfraStatus: () => request("/system/infrastructure/status"),

  // ── Portal BFF ──
  portalGetDashboard: () => request('/api/v2/portal/dashboard'),
  portalGetDevices: () => request('/api/v2/portal/devices'),
  portalGetTasks: () => request('/api/v2/portal/tasks'),
  portalGetUsage: (params?: { from?: number; to?: number }) => {
    const search = new URLSearchParams();
    if (params?.from) search.set('from', String(params.from));
    if (params?.to) search.set('to', String(params.to));
    const qs = search.toString();
    return request(`/api/v2/portal/usage${qs ? `?${qs}` : ''}`);
  },

  // ── Billing (Portal) ──
  getBillingPlans: () => request('/api/v2/billing/plans'),
  getSubscription: () => request('/api/v2/billing/subscription'),
  subscribePlan: (planId: string) =>
    request('/api/v2/billing/subscribe', { method: 'POST', body: JSON.stringify({ planId }) }),
  cancelSubscription: () =>
    request('/api/v2/billing/subscription/cancel', { method: 'POST' }),
  getBillingOrders: (params?: { limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.offset) search.set('offset', String(params.offset));
    const qs = search.toString();
    return request(`/api/v2/billing/orders${qs ? `?${qs}` : ''}`);
  },
  getBillingOrder: (id: string) => request(`/api/v2/billing/orders/${id}`),
  createBillingOrder: (planId: string, paymentMethod: string) =>
    request('/api/v2/billing/orders', { method: 'POST', body: JSON.stringify({ planId, paymentMethod }) }),

  // ── Support Tickets ──
  getSupportTickets: () => request('/api/v2/support/tickets'),
  getSupportTicket: (id: string) => request(`/api/v2/support/tickets/${id}`),
  createSupportTicket: (data: { subject: string; category: string; message: string; priority?: string }) =>
    request('/api/v2/support/tickets', { method: 'POST', body: JSON.stringify(data) }),
  replySupportTicket: (id: string, message: string) =>
    request(`/api/v2/support/tickets/${id}/replies`, { method: 'POST', body: JSON.stringify({ message }) }),
  closeSupportTicket: (id: string) =>
    request(`/api/v2/support/tickets/${id}/close`, { method: 'POST' }),

  // ── Credits ──
  getCreditsOverview: () => request('/credits/overview'),
  getCreditTransactions: (params?: { userId?: string; limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.userId) search.set('userId', params.userId);
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.offset) search.set('offset', String(params.offset));
    const qs = search.toString();
    return request(`/credits/transactions${qs ? `?${qs}` : ''}`);
  },
  getAllCreditTransactions: (params?: { limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.offset) search.set('offset', String(params.offset));
    const qs = search.toString();
    return request(`/credits/admin/transactions${qs ? `?${qs}` : ''}`);
  },
  grantCredits: (userId: string, amount: number, note?: string) =>
    request('/credits/admin/grant', { method: 'POST', body: JSON.stringify({ userId, amount, note }) }),

  // ── Token Pricing ──
  getTokenPricing: () => request('/credits/pricing'),
  updateTokenPricing: (modelName: string, inputTokensPerCredit: number, outputTokensPerCredit: number) =>
    request('/credits/pricing', { method: 'PUT', body: JSON.stringify({ modelName, inputTokensPerCredit, outputTokensPerCredit }) }),

  // ── Assistant Usage ──
  getAssistantUsage: (params?: { from?: number; to?: number }) => {
    const search = new URLSearchParams();
    if (params?.from) search.set('from', String(params.from));
    if (params?.to) search.set('to', String(params.to));
    const qs = search.toString();
    return request(`/assistant/usage${qs ? `?${qs}` : ''}`);
  },
  getAssistantSessions: (params?: { limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.offset) search.set('offset', String(params.offset));
    const qs = search.toString();
    return request(`/assistant/sessions${qs ? `?${qs}` : ''}`);
  },
  getAssistantSession: (id: string) => request(`/assistant/sessions/${id}`),

  // ── Admin AI Assistant ──
  adminAssistantChat: (messages: { role: string; content: string }[], sessionId?: string) =>
    request('/admin/assistant/chat', { method: 'POST', body: JSON.stringify({ messages, sessionId }) }),
  adminAssistantGetSessions: () => request('/admin/assistant/sessions'),
  adminAssistantGetSession: (id: string) => request(`/admin/assistant/sessions/${id}`),
  adminAssistantDeleteSession: (id: string) =>
    request(`/admin/assistant/sessions/${id}`, { method: 'DELETE' }),

  // Generic request (used by admin pages and custom endpoints)
  request: (path: string, options?: RequestInit) => request(path, options),
};
