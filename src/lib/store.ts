import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  isEmailVerified: boolean;
  plan: string;
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
    return true;
  },
  logout: () => {
    localStorage.removeItem('genova_user');
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));

type ViewType = 'dashboard' | 'agents' | 'automation' | 'guardrails' | 'coordination' | 'settings' | 'analytics' | 'billing';

interface AppState {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  fetchApprovalCount: () => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  setCurrentView: (view) => set({ currentView: view }),
  fetchApprovalCount: async () => {},
}));
