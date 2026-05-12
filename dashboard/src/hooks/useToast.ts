import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

let nextId = 0;

export const useToastState = create<ToastState>((set) => ({
  toasts: [],

  addToast: (type, message) => {
    const id = `toast-${++nextId}`;
    const toast: Toast = { id, type, message, createdAt: Date.now() };
    set(s => ({ toasts: [...s.toasts, toast] }));

    const timeout = type === 'error' ? 5000 : 3000;
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, timeout);
  },

  removeToast: (id) => {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
  },
}));

export function toast(type: ToastType, message: string) {
  useToastState.getState().addToast(type, message);
}
