import { api } from './api';

// Dedicated portal API module — wraps the generic api with portal-specific methods.

export const portalApi = {
  // Dashboard
  getDashboard: () => api.portalGetDashboard(),

  // Devices
  getDevices: () => api.portalGetDevices(),

  // Tasks
  getTasks: () => api.portalGetTasks(),

  // Usage
  getUsage: (from?: number, to?: number) => api.portalGetUsage({ from, to }),

  // Plans & Billing
  getPlans: () => api.getBillingPlans(),
  getSubscription: () => api.getSubscription(),
  subscribePlan: (planId: string) => api.subscribePlan(planId),
  cancelSubscription: () => api.cancelSubscription(),
  getOrders: (limit?: number, offset?: number) => api.getBillingOrders({ limit, offset }),
  getOrder: (id: string) => api.getBillingOrder(id),
  createOrder: (planId: string, paymentMethod: string) => api.createBillingOrder(planId, paymentMethod),

  // Card Keys
  getCardKeys: () => api.request('/api/v2/card-keys'),
  generateCardKeys: (params: { name: string; count: number; planId?: string; days?: number; maxDevices?: number }) =>
    api.request('/api/v2/card-batches', { method: 'POST', body: JSON.stringify(params) }),

  // API Keys
  getApiKeys: () => api.request('/api/v2/api-keys'),
  createApiKey: (data: { name: string; permissions: string[]; rateLimitQps?: number }) =>
    api.request('/api/v2/api-keys', { method: 'POST', body: JSON.stringify(data) }),
  deleteApiKey: (id: string) => api.request(`/api/v2/api-keys/${id}`, { method: 'DELETE' }),

  // Support Tickets
  getTickets: () => api.getSupportTickets(),
  getTicket: (id: string) => api.getSupportTicket(id),
  createTicket: (data: { subject: string; category: string; message: string; priority?: string }) =>
    api.createSupportTicket(data),
  replyTicket: (id: string, message: string) => api.replySupportTicket(id, message),
  closeTicket: (id: string) => api.closeSupportTicket(id),

  // Agent Dashboard
  getAgentDashboard: () => api.request('/api/v2/agent/dashboard'),
  getAgentCommissions: (params?: { period?: string; status?: string }) => {
    const search = new URLSearchParams();
    if (params?.period) search.set('period', params.period);
    if (params?.status) search.set('status', params.status);
    const qs = search.toString();
    return api.request(`/api/v2/agent/commissions${qs ? `?${qs}` : ''}`);
  },

  // Whitelabel
  getWhitelabelConfig: () => api.request('/api/v2/whitelabel/config'),
  getWhitelabelTheme: (tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    return fetch(`/api/v2/whitelabel/theme.css${qs}`).then(r => r.text());
  },
};
