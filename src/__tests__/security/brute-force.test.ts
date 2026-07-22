import { describe, it, expect } from 'vitest';
import { validatePasswordStrength, AUTH_CONFIG } from '@/lib/auth/security';

describe('🔒 Protection Brute Force', () => {
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

describe('🔐 Validation Force Mot de Passe', () => {
  it('rejette mot de passe trop court', () => {
    const result = validatePasswordStrength('Ab1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Minimum 8 caractères');
  });

  it('rejette sans majuscule', () => {
    const result = validatePasswordStrength('abcdefgh1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Doit contenir une majuscule');
  });

  it('rejette sans chiffre', () => {
    const result = validatePasswordStrength('Abcdefgh!');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Doit contenir un chiffre');
  });

  it('accepte mot de passe fort', () => {
    const result = validatePasswordStrength('Str0ng!Pass');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('calcule le score correctement', () => {
    const result = validatePasswordStrength('Str0ng!Pass123');
    expect(result.score).toBeGreaterThanOrEqual(60);
  });
});
