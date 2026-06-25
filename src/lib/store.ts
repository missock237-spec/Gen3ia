import { create } from 'zustand';

interface AuthState {
  user: any;
  setUser: (user: any) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user: any) => set({ user }),
  logout: () => set({ user: null }),
}));

interface AppState {
  theme: string;
  setTheme: (theme: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: 'dark',
  setTheme: (theme: string) => set({ theme }),
}));
