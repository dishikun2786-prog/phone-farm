import { create } from 'zustand';

export interface PortalPlan {
  id: string;
  name: string;
  tier: string;
  monthlyPriceCents: number;
  maxDevices: number;
  maxVlmCallsPerDay: number;
  maxScriptExecutionsPerDay: number;
  features: string[];
}

export interface PortalSubscription {
  id: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
}

export interface PortalTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortalTicketDetail {
  ticket: PortalTicket;
  replies: Array<{
    id: string;
    message: string;
    isStaff: boolean;
    createdAt: string;
  }>;
}

export interface PortalOrder {
  id: string;
  planId: string;
  planName: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface PortalUsage {
  aggregated: Record<string, number>;
  daily: Record<string, Record<string, number>>;
  limits: { maxDevices: number; maxVlmCallsPerDay: number; maxScriptExecutionsPerDay: number } | null;
  totalRecords: number;
}

interface PortalState {
  plans: PortalPlan[];
  plansLoading: boolean;
  subscription: PortalSubscription | null;
  subscriptionLoading: boolean;
  tickets: PortalTicket[];
  ticketsLoading: boolean;
  currentTicket: PortalTicketDetail | null;
  ticketLoading: boolean;
  orders: PortalOrder[];
  ordersLoading: boolean;
  usage: PortalUsage | null;
  usageLoading: boolean;

  loadPlans: (api: any) => Promise<void>;
  loadSubscription: (api: any) => Promise<void>;
  subscribePlan: (api: any, planId: string) => Promise<void>;
  cancelSubscription: (api: any) => Promise<void>;
  loadTickets: (api: any) => Promise<void>;
  loadTicket: (api: any, id: string) => Promise<void>;
  createTicket: (api: any, data: { subject: string; category: string; message: string; priority?: string }) => Promise<void>;
  replyTicket: (api: any, id: string, message: string) => Promise<void>;
  closeTicket: (api: any, id: string) => Promise<void>;
  loadOrders: (api: any) => Promise<void>;
  loadUsage: (api: any, from?: number, to?: number) => Promise<void>;
}

export const usePortalStore = create<PortalState>((set) => ({
  plans: [],
  plansLoading: false,
  subscription: null,
  subscriptionLoading: false,
  tickets: [],
  ticketsLoading: false,
  currentTicket: null,
  ticketLoading: false,
  orders: [],
  ordersLoading: false,
  usage: null,
  usageLoading: false,

  loadPlans: async (api) => {
    set({ plansLoading: true });
    try {
      const data = await api.getBillingPlans();
      set({ plans: data.plans || [], plansLoading: false });
    } catch { set({ plansLoading: false }); }
  },

  loadSubscription: async (api) => {
    set({ subscriptionLoading: true });
    try {
      const data = await api.getSubscription();
      set({ subscription: data.subscription || null, subscriptionLoading: false });
    } catch { set({ subscriptionLoading: false }); }
  },

  subscribePlan: async (api, planId) => {
    await api.subscribePlan(planId);
  },

  cancelSubscription: async (api) => {
    await api.cancelSubscription();
  },

  loadTickets: async (api) => {
    set({ ticketsLoading: true });
    try {
      const data = await api.getSupportTickets();
      set({ tickets: data.tickets || [], ticketsLoading: false });
    } catch { set({ ticketsLoading: false }); }
  },

  loadTicket: async (api, id) => {
    set({ ticketLoading: true });
    try {
      const data = await api.getSupportTicket(id);
      set({ currentTicket: data, ticketLoading: false });
    } catch { set({ ticketLoading: false }); }
  },

  createTicket: async (api, data) => {
    await api.createSupportTicket(data);
  },

  replyTicket: async (api, id, message) => {
    await api.replySupportTicket(id, message);
  },

  closeTicket: async (api, id) => {
    await api.closeSupportTicket(id);
  },

  loadOrders: async (api) => {
    set({ ordersLoading: true });
    try {
      const data = await api.getBillingOrders();
      set({ orders: data.orders || [], ordersLoading: false });
    } catch { set({ ordersLoading: false }); }
  },

  loadUsage: async (api, from, to) => {
    set({ usageLoading: true });
    try {
      const data = await api.portalGetUsage({ from, to });
      set({ usage: data, usageLoading: false });
    } catch { set({ usageLoading: false }); }
  },
}));
