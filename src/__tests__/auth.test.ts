/**
 * Tests unitaires — auth.ts
 * Couvre : hashPassword, verifyPassword, needsMigration, RBAC, safeCompare
 */
import { describe, test, expect, beforeAll } from 'bun:test';
import {
  hashPassword,
  verifyPassword,
  needsMigration,
  hasRole,
  isAdmin,
  isValidRole,
  safeCompare,
  generateResetToken,
  generateSessionToken,
  hashToken,
} from '../lib/auth';

// AUTH_SALT est requis par les anciens formats
beforeAll(() => {
  process.env.AUTH_SALT = 'test-salt-for-unit-tests-only';
});

describe('hashPassword', () => {
  test('génère un hash au format pbkdf2 avec sel unique', async () => {
    const hash = await hashPassword('monMotDePasse123!');
    expect(hash).toStartWith('pbkdf2:');
    const parts = hash.slice('pbkdf2:'.length).split(':');
    expect(parts).toHaveLength(3); // iterations:salt:hash
  });

  test('deux appels avec le même mot de passe génèrent des hash différents (sel aléatoire)', async () => {
    const h1 = await hashPassword('password');
    const h2 = await hashPassword('password');
    expect(h1).not.toBe(h2);
  });

  test('lève une erreur pour un mot de passe vide', async () => {
    await expect(hashPassword('')).rejects.toThrow('Password must not be empty');
  });
});

describe('verifyPassword', () => {
  test('retourne valid:true pour le bon mot de passe', async () => {
    const hash = await hashPassword('correctHorseBattery');
    const result = await verifyPassword('correctHorseBattery', hash);
    expect(result.valid).toBe(true);
    expect(result.needsMigration).toBe(false);
  });

  test('retourne valid:false pour un mauvais mot de passe', async () => {
    const hash = await hashPassword('correctHorseBattery');
    const result = await verifyPassword('wrongPassword', hash);
    expect(result.valid).toBe(false);
  });

  test('retourne valid:false pour des entrées vides', async () => {
    const result = await verifyPassword('', '');
    expect(result.valid).toBe(false);
  });
});

describe('needsMigration', () => {
  test('retourne false pour le format actuel pbkdf2 avec 3 parties', async () => {
    const hash = await hashPassword('test');
    expect(needsMigration(hash)).toBe(false);
  });

  test('retourne true pour les anciens formats', () => {
    expect(needsMigration('sha256:abcdef')).toBe(true);
    expect(needsMigration('gs:100000:abcdef')).toBe(true);
    expect(needsMigration('oldhashnoprefixatall')).toBe(true);
  });
});

describe('RBAC — hasRole / isAdmin / isValidRole', () => {
  test('user ne peut pas accéder aux ressources admin', () => {
    expect(hasRole('user', 'admin')).toBe(false);
  });

  test('admin peut accéder aux ressources admin', () => {
    expect(hasRole('admin', 'admin')).toBe(true);
  });

  test('super_admin peut accéder aux ressources admin', () => {
    expect(hasRole('super_admin', 'admin')).toBe(true);
  });

  test('isAdmin retourne true pour admin et super_admin', () => {
    expect(isAdmin('admin')).toBe(true);
    expect(isAdmin('super_admin')).toBe(true);
    expect(isAdmin('user')).toBe(false);
  });

  test('isValidRole valide correctement les rôles', () => {
    expect(isValidRole('user')).toBe(true);
    expect(isValidRole('admin')).toBe(true);
    expect(isValidRole('super_admin')).toBe(true);
    expect(isValidRole('hacker')).toBe(false);
    expect(isValidRole('')).toBe(false);
  });
});

describe('safeCompare', () => {
  test('retourne true pour des chaînes identiques', () => {
    expect(safeCompare('abc123', 'abc123')).toBe(true);
  });

  test('retourne false pour des chaînes différentes', () => {
    expect(safeCompare('abc123', 'abc124')).toBe(false);
  });

  test('retourne false pour des longueurs différentes', () => {
    expect(safeCompare('abc', 'abcd')).toBe(false);
  });
});

describe('Token utilities', () => {
  test('generateResetToken génère un token de 96 caractères hex', () => {
    const token = generateResetToken();
    expect(token).toHaveLength(96);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  test('generateSessionToken génère un token de 96 caractères hex', () => {
    const token = generateSessionToken();
    expect(token).toHaveLength(96);
  });

  test('deux tokens générés sont toujours différents', () => {
    expect(generateResetToken()).not.toBe(generateResetToken());
  });

  test('hashToken retourne un hash hex de 64 caractères', async () => {
    const hash = await hashToken('mytoken');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('hashToken est déterministe (même input = même hash)', async () => {
    const h1 = await hashToken('mytoken');
    const h2 = await hashToken('mytoken');
    expect(h1).toBe(h2);
  });
});
