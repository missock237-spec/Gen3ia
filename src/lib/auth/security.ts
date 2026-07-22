import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

const attemptsMap = new Map();

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attemptsMap.entries()) {
      if (now - entry.lastAttempt > 3600000) attemptsMap.delete(key);
    }
  }, 300000);
}

export const AUTH_CONFIG = {
  MAX_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15,
  LOCKOUT_DURATION_ESCALATED: 60,
  WINDOW_MS: 300000,
  SLOW_DOWN_DELAY: 1000,
};

export function checkLoginAttempts(identifier) {
  const now = Date.now();
  const entry = attemptsMap.get(identifier);
  if (!entry) return { allowed: true, remaining: 5, lockedUntil: null, delay: 0 };
  if (entry.lockedUntil && now < entry.lockedUntil) {
    logger.warn('Tentative bloquee', { identifier });
    return { allowed: false, remaining: 0, lockedUntil: entry.lockedUntil, delay: 0 };
  }
  if (now - entry.firstAttempt > 300000) {
    attemptsMap.delete(identifier);
    return { allowed: true, remaining: 5, lockedUntil: null, delay: 0 };
  }
  const delay = entry.count >= 3 ? 1000 : 0;
  return {
    allowed: entry.count < 5,
    remaining: Math.max(0, 5 - entry.count),
    lockedUntil: null,
    delay,
  };
}

export function recordLoginAttempt(identifier, success, ip) {
  const now = Date.now();
  let entry = attemptsMap.get(identifier);
  if (!entry) entry = { count: 0, firstAttempt: now, lastAttempt: now };
  entry.lastAttempt = now;
  if (!success) {
    entry.count++;
    if (entry.count >= 5) {
      entry.lockedUntil = now + 15 * 60 * 1000;
      logger.error('COMPTE BLOQUE 15min', { identifier, ip });
      prisma.monitoringEvent.create({ data: { userId: identifier, eventType: 'security.brute_force', source: 'auth', message: 'Compte bloque', details: '{}', severity: 'error' } }).catch(() => {});
    }
  } else {
    attemptsMap.delete(identifier);
  }
  attemptsMap.set(identifier, entry);
}

export async function slowDown(identifier) {
  const entry = attemptsMap.get(identifier);
  if (entry && entry.count >= 3) {
    await new Promise(r => setTimeout(r, Math.min(3000, (entry.count - 2) * 1000)));
  }
}

export function validatePasswordStrength(password) {
  const errors = [];
  let score = 0;
  if (password.length >= 8) score += 20; else errors.push('Minimum 8 caracteres');
  if (password.length >= 12) score += 10;
  if (/[A-Z]/.test(password)) score += 20; else errors.push('Doit contenir une majuscule');
  if (/[a-z]/.test(password)) score += 10;
  if (/[0-9]/.test(password)) score += 20; else errors.push('Doit contenir un chiffre');
  if (/[^A-Za-z0-9]/.test(password)) score += 20; else errors.push('Doit contenir un caractere special');
  return { valid: score >= 60, score, errors };
}

const ipRateMap = new Map();
export function checkIpRateLimit(ip) {
  const now = Date.now();
  const entry = ipRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRateMap.set(ip, { count: 1, resetAt: now + 60000 });
    return { allowed: true, remaining: 19 };
  }
  entry.count++;
  return { allowed: entry.count <= 20, remaining: Math.max(0, 20 - entry.count) };
}
