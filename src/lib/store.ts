import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  isEmailVerified: boolean;
  plan: string;
  role: string;
  avatar: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hydrate: () => void;
  validateSession: () => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  hydrate: () => {
    try {
      const stored = localStorage.getItem('genova_user');
      if (stored) {
        const user = JSON.parse(stored);
        set({ user, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
  validateSession: async () => {
    try {
      const res = await fetch('/api/auth/session');
      if (!res.ok) {
        localStorage.removeItem('genova_user');
        set({ user: null, isAuthenticated: false });
        return false;
      }
      const user = await res.json();
      localStorage.setItem('genova_user', JSON.stringify(user));
      set({ user, isAuthenticated: true });
      return true;
    } catch {
      return false;
    }
  },
  logout: () => {
    localStorage.removeItem('genova_user');
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));

type ViewType = 'dashboard' | 'agents' | 'automation' | 'guardrails' | 'coordination' | 'settings' | 'analytics' | 'approvals' | 'billing';

interface AppState {
  currentView: ViewType;
  approvalCount: number;
  setCurrentView: (view: ViewType) => void;
  fetchApprovalCount: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  approvalCount: 0,
  setCurrentView: (view) => set({ currentView: view }),
  fetchApprovalCount: async () => {
    try {
      const res = await fetch('/api/approvals/count');
      if (res.ok) {
        const data = await res.json();
        set({ approvalCount: data.count ?? 0 });
      }
    } catch {
      // Ignore error
    }
  },
}));
