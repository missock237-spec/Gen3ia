import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

interface AttemptEntry {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
  lockedUntil?: number;
}

const attemptsMap = new Map<string, AttemptEntry>();

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

export function checkLoginAttempts(identifier: string) {
  const now = Date.now();
  const entry = attemptsMap.get(identifier);
  if (!entry) {
    return { allowed: true, remaining: AUTH_CONFIG.MAX_ATTEMPTS, lockedUntil: null, delay: 0 };
  }
  if (entry.lockedUntil && now < entry.lockedUntil) {
    logger.warn('Tentative bloquee', { identifier, count: entry.count });
    return { allowed: false, remaining: 0, lockedUntil: entry.lockedUntil, delay: 0 };
  }
  if (now - entry.firstAttempt > AUTH_CONFIG.WINDOW_MS) {
    attemptsMap.delete(identifier);
    return { allowed: true, remaining: AUTH_CONFIG.MAX_ATTEMPTS, lockedUntil: null, delay: 0 };
  }
  const delay = entry.count >= 3 ? AUTH_CONFIG.SLOW_DOWN_DELAY : 0;
  return {
    allowed: entry.count < AUTH_CONFIG.MAX_ATTEMPTS,
    remaining: Math.max(0, AUTH_CONFIG.MAX_ATTEMPTS - entry.count),
    lockedUntil: null, delay,
  };
}

export function recordLoginAttempt(identifier: string, success: boolean, ip?: string) {
  const now = Date.now();
  let entry = attemptsMap.get(identifier);
  if (!entry) entry = { count: 0, firstAttempt: now, lastAttempt: now };
  entry.lastAttempt = now;
  if (!success) {
    entry.count++;
    if (entry.count >= AUTH_CONFIG.MAX_ATTEMPTS) {
      const escalatedEntry = attemptsMap.get('escalated_' + identifier);
      const escalated = escalatedEntry ? escalatedEntry.count >= 2 : false;
      entry.lockedUntil = now + (escalated ? AUTH_CONFIG.LOCKOUT_DURATION_ESCALATED : AUTH_CONFIG.LOCKOUT_DURATION) * 60 * 1000;
      logger.error('COMPTE BLOQUE', { identifier, attempts: entry.count, ip });
      prisma.monitoringEvent.create({
        data: {
          userId: identifier, eventType: 'security.brute_force', source: 'auth',
          message: 'Compte bloque apres ' + entry.count + ' tentatives',
          details: JSON.stringify({ ip, attempts: entry.count, escalated }),
          severity: 'error',
        },
      }).catch(() => {});
      if (!escalatedEntry) {
        attemptsMap.set('escalated_' + identifier, { count: 1, firstAttempt: now, lastAttempt: now });
      } else {
        escalatedEntry.count++;
      }
    } else if (entry.count >= 3) {
      logger.warn('Tentatives echouees', { identifier, attempts: entry.count, ip });
    }
  } else {
    attemptsMap.delete(identifier);
    attemptsMap.delete('escalated_' + identifier);
  }
  attemptsMap.set(identifier, entry);
}

export async function slowDown(identifier: string) {
  const entry = attemptsMap.get(identifier);
  if (entry && entry.count >= 3) {
    const delay = Math.min(3000, (entry.count - 2) * AUTH_CONFIG.SLOW_DOWN_DELAY);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

export function validatePasswordStrength(password: string): { valid: boolean; score: number; errors: string[] } {
  const errors: string[] = [];
  let score = 0;
  if (password.length >= 8) score += 20; else errors.push('Minimum 8 caracteres');
  if (password.length >= 12) score += 10;
  if (/[A-Z]/.test(password)) score += 20; else errors.push('Doit contenir une majuscule');
  if (/[a-z]/.test(password)) score += 10;
  if (/[0-9]/.test(password)) score += 20; else errors.push('Doit contenir un chiffre');
  if (/[^A-Za-z0-9]/.test(password)) score += 20; else errors.push('Doit contenir un caractere special');
  return { valid: score >= 60, score, errors };
}

const ipRateMap = new Map<string, { count: number; resetAt: number }>();

export function checkIpRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = ipRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRateMap.set(ip, { count: 1, resetAt: now + 60000 });
    return { allowed: true, remaining: 19 };
  }
  entry.count++;
  return { allowed: entry.count <= 20, remaining: Math.max(0, 20 - entry.count) };
}
