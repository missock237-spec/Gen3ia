import { create } from 'zustand';

export interface User {
  id: string;
  email: string;
  name: string;
  plan: string;
  role: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  hydrate: () => Promise<void>;
  validateSession: () => Promise<boolean>;
  logout: () => void;
  /** Legacy alias for hydrate — fetch session and populate user. */
  login: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: true,
  isLoading: false,
  user: null,
  hydrate: async () => {
    try {
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          set({
            isAuthenticated: true,
            user: {
              id: data.user.id,
              email: data.user.email,
              name: data.user.name,
              plan: data.user.plan || 'free',
              role: data.user.role || 'user',
            },
          });
        }
      }
    } catch {}
    set({ isLoading: false });
  },
  validateSession: async () => {
    try {
      const res = await fetch('/api/auth/session');
      return res.ok;
    } catch { return false; }
  },
  logout: () => set({ isAuthenticated: false, user: null }),
  login: async () => {
    // Legacy alias — delegates to hydrate
    await useAuthStore.getState().hydrate();
  },
}));

export type ViewType =
  | 'dashboard'
  | 'agents'
  | 'automation'
  | 'guardrails'
  | 'coordination'
  | 'settings'
  | 'approvals'
  | 'analytics'
  | 'billing'
  | 'developers';

interface AppState {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  approvalCount: number;
  fetchApprovalCount: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  setCurrentView: (view) => set({ currentView: view }),
  approvalCount: 0,
  fetchApprovalCount: async () => {
    try {
      const res = await fetch('/api/approvals?status=pending');
      if (res.ok) {
        const data = await res.json();
        set({ approvalCount: data?.count || 0 });
      }
    } catch {}
  },
}));
