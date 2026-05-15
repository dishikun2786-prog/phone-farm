import type { StateCreator } from "zustand";
import type { AppState } from "./index";
import { api } from "../lib/api";

export interface AdminAIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: AdminAIToolCall[];
  createdAt: string;
}

export interface AdminAIToolCall {
  name: string;
  input: Record<string, unknown>;
  output?: { success: boolean; result: unknown; error?: string; summary: string };
}

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  tokensUsed?: number;
}

export interface AdminAISlice {
  panelOpen: boolean;
  messages: AdminAIMessage[];
  sessionId: string | null;
  isStreaming: boolean;
  error: string | null;
  sessions: SessionSummary[];
  sessionsLoading: boolean;

  togglePanel: () => void;
  sendMessage: (text: string) => Promise<void>;
  newConversation: () => void;
  loadSessions: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  clearError: () => void;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Restore messages from localStorage */
function loadMessages(): AdminAIMessage[] {
  try {
    const raw = localStorage.getItem("admin_ai_messages");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Save messages to localStorage (safe against quota exceeded) */
function saveMessages(msgs: AdminAIMessage[]): void {
  try {
    localStorage.setItem("admin_ai_messages", JSON.stringify(msgs.slice(-50)));
  } catch {
    try {
      localStorage.setItem("admin_ai_messages", JSON.stringify(msgs.slice(-10)));
    } catch { /* localStorage full — discard non-critical */ }
  }
}

export const createAdminAISlice: StateCreator<AppState, [], [], AdminAISlice> = (set, get) => ({
  panelOpen: false,
  messages: loadMessages(),
  sessionId: localStorage.getItem("admin_ai_sessionId"),
  isStreaming: false,
  error: null,
  sessions: [],
  sessionsLoading: false,

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),

  sendMessage: async (text: string) => {
    if (get().isStreaming) return; // prevent duplicate submissions
    const { messages, sessionId } = get();
    const userMsg: AdminAIMessage = {
      id: genId(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMsg];
    set({ messages: updatedMessages, isStreaming: true, error: null });
    saveMessages(updatedMessages);

    try {
      const apiMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const data: any = await api.adminAssistantChat(apiMessages, sessionId || undefined);

      const assistantMsg: AdminAIMessage = {
        id: genId(),
        role: "assistant",
        content: data.content || "",
        toolCalls: data.toolCalls || [],
        createdAt: new Date().toISOString(),
      };

      const finalMessages = [...get().messages, assistantMsg];
      set({
        messages: finalMessages,
        isStreaming: false,
        sessionId: data.sessionId || sessionId,
        error: null,
      });
      saveMessages(finalMessages);
      if (data.sessionId) {
        localStorage.setItem("admin_ai_sessionId", data.sessionId);
      }
    } catch (err: any) {
      set({ isStreaming: false, error: err.message || "AI 助手请求失败" });
    }
  },

  newConversation: () => {
    set({ messages: [], sessionId: null, error: null });
    localStorage.removeItem("admin_ai_messages");
    localStorage.removeItem("admin_ai_sessionId");
  },

  loadSessions: async () => {
    set({ sessionsLoading: true });
    try {
      const data: any = await api.adminAssistantGetSessions();
      set({ sessions: data.sessions || [], sessionsLoading: false });
    } catch (err: any) {
      set({ sessionsLoading: false, error: err.message || "加载会话列表失败" });
    }
  },

  switchSession: async (id: string) => {
    try {
      const data: any = await api.adminAssistantGetSession(id);
      const msgs = (data.messages || []).map((m: any) => ({
        ...m,
        id: m.id || genId(),
        createdAt: m.createdAt || new Date().toISOString(),
      }));
      set({ messages: msgs, sessionId: id, error: null });
      saveMessages(msgs);
      localStorage.setItem("admin_ai_sessionId", id);
    } catch (err: any) {
      set({ error: err.message || "加载会话失败" });
    }
  },

  deleteSession: async (id: string) => {
    try {
      await api.adminAssistantDeleteSession(id);
      const sessions = get().sessions.filter((s) => s.id !== id);
      if (get().sessionId === id) {
        set({ sessionId: null, messages: [], sessions });
        localStorage.removeItem("admin_ai_sessionId");
        saveMessages([]);
      } else {
        set({ sessions });
      }
    } catch (err: any) {
      set({ error: err.message || "删除会话失败" });
    }
  },

  clearError: () => set({ error: null }),
});
