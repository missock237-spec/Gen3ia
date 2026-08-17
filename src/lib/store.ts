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
  /** Resets local state AND calls POST /api/auth/logout server-side. */
  logout: () => Promise<void>;
  /** Legacy alias for hydrate — fetch session and populate user. */
  login: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  // Sécurité: jamais authentifié par défaut. isLoading=true jusqu'à hydrate()
  // pour que l'UI affiche un loader plutôt que le dashboard pendant la vérif.
  isAuthenticated: false,
  isLoading: true,
  user: null,
  hydrate: async () => {
    try {
      // Utilise /api/auth/me (route existante). /api/auth/session n'existe pas
      // et renvoyait 404 → hydrate échouait silencieusement à chaque appel.
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          set({
            isAuthenticated: true,
            isLoading: false,
            user: {
              id: data.user.id,
              email: data.user.email,
              name: data.user.name,
              plan: data.user.plan || 'free',
              role: data.user.role || 'user',
            },
          });
          return;
        }
      }
      // Pas de session ou réponse non-OK → utilisateur non authentifié
      set({ isAuthenticated: false, isLoading: false, user: null });
    } catch (e) {
      // Erreur réseau/serveur → non authentifié (pas de fuite du dashboard)
      console.error('[auth/store] hydrate failed:', e);
      set({ isAuthenticated: false, isLoading: false, user: null });
    }
  },
  validateSession: async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      return res.ok && !!(await res.json()).user;
    } catch { return false; }
  },
  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    set({ isAuthenticated: false, isLoading: false, user: null });
  },
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
