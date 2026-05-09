const API_BASE = '/api/v1';

async function request(path: string, options?: RequestInit) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
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
};
