export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://genova.app/api';
export const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://genova.app/ws';

export const COLORS = {
  primary: '#6366f1',
  secondary: '#8b5cf6',
  accent: '#f59e0b',
  success: '#22c55e',
  error: '#ef4444',
  dark: '#0f172a',
  light: '#f8fafc',
};

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_PROFILE: 'user_profile',
  THEME: 'theme_preference',
};
