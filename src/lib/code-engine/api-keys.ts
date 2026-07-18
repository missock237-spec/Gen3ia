/**
 * Gestion des cles API pour le Code Engine
 * Permet aux utilisateurs et SaaS externes d'appeler l'API /api/code/execute
 */

const API_KEYS = new Map<string, { userId: string; plan: string; maxPerMinute: number }>();

export function registerApiKey(userId: string, plan: string = 'free'): string {
  const key = 'gva_code_' + Array.from({ length: 32 }, () =>
    'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36))
  ).join('');

  const limits: Record<string, number> = {
    free: 5,
    pro: 30,
    enterprise: 120,
  };

  API_KEYS.set(key, {
    userId,
    plan,
    maxPerMinute: limits[plan] || limits.free,
  });

  return key;
}

export function validateApiKey(key: string): { valid: boolean; userId?: string; maxPerMinute?: number; error?: string } {
  const entry = API_KEYS.get(key);
  if (!entry) {
    return { valid: false, error: 'Cle API invalide' };
  }
  return { valid: true, userId: entry.userId, maxPerMinute: entry.maxPerMinute };
}

export function revokeApiKey(key: string): boolean {
  return API_KEYS.delete(key);
}

export function listUserKeys(userId: string): string[] {
  const keys: string[] = [];
  API_KEYS.forEach((entry, key) => {
    if (entry.userId === userId) keys.push(key);
  });
  return keys;
}