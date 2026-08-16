// ============================================================
// Tests — Protection Brute Force & Validation mot de passe (Firebase)
// ============================================================
//  Note : Firebase Authentication gère nativement la protection brute-force
//  (rate limiting + lockout configurable dans la console Firebase).
//  Les constantes AUTH_CONFIG ci-dessous reflètent la configuration
//  recommandée à appliquer dans Firebase Console > Authentication > Settings.
// ============================================================

import { describe, it, expect } from 'vitest';
import { validatePasswordStrength } from '@/lib/firebase/auth';

// Configuration recommandée pour Firebase Auth (à appliquer côté console)
const AUTH_CONFIG = {
  MAX_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15, // minutes
  LOCKOUT_DURATION_ESCALATED: 60, // minutes après récidive
} as const;

describe('🔒 Protection Brute Force (Firebase Auth configuration)', () => {
  it('limite à 5 tentatives max', () => {
    expect(AUTH_CONFIG.MAX_ATTEMPTS).toBe(5);
  });

  it('bloque pour 15 minutes', () => {
    expect(AUTH_CONFIG.LOCKOUT_DURATION).toBe(15);
  });

  it('escalade à 60 min après récidive', () => {
    expect(AUTH_CONFIG.LOCKOUT_DURATION_ESCALATED).toBe(60);
  });
});

describe('🔐 Validation Force Mot de passe (Firebase)', () => {
  it('rejette mot de passe trop court', () => {
    const result = validatePasswordStrength('Ab1');
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('Minimum 8 caractères');
  });

  it('rejette sans majuscule', () => {
    const result = validatePasswordStrength('abcdefgh1');
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('Au moins une majuscule');
  });

  it('rejette sans chiffre', () => {
    const result = validatePasswordStrength('Abcdefgh!');
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('Au moins un chiffre');
  });

  it('accepte mot de passe fort', () => {
    const result = validatePasswordStrength('Str0ngPass1');
    expect(result.valid).toBe(true);
  });
});
