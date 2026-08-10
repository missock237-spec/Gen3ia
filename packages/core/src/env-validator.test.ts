// ============================================================
// env-validator — tests unitaires (4.3 : validation au demarrage)
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateEnv, assertEnv, getEnvStatus, REQUIRED_ENV_VARS } from './env-validator.js';

function withEnv(env: Record<string, string | undefined>) {
  const original = { ...process.env };
  Object.keys(env).forEach((k) => {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k] as string;
  });
  return original;
}

describe('env-validator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateEnv', () => {
    it('returns valid when all required vars are present and well-formed', () => {
      const original = withEnv({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        AUTH_SECRET: 'a-very-long-secret-key-0123456789abcdef',
        NEXT_PUBLIC_APP_URL: 'https://gen3ia.ai',
      });
      try {
        const res = validateEnv();
        expect(res.valid).toBe(true);
        expect(res.errors).toHaveLength(0);
      } finally {
        withEnv(original as any);
      }
    });

    it('flags missing required variables', () => {
      const original = withEnv({ DATABASE_URL: undefined, AUTH_SECRET: undefined, NEXT_PUBLIC_APP_URL: undefined });
      try {
        const res = validateEnv();
        expect(res.valid).toBe(false);
        expect(res.errors.length).toBe(REQUIRED_ENV_VARS.length);
      } finally {
        withEnv(original as any);
      }
    });

    it('flags an invalid URL', () => {
      const original = withEnv({
        DATABASE_URL: 'not-a-url',
        AUTH_SECRET: 'a-very-long-secret-key-0123456789abcdef',
        NEXT_PUBLIC_APP_URL: 'https://gen3ia.ai',
      });
      try {
        const res = validateEnv();
        expect(res.errors.some((e) => e.key === 'DATABASE_URL')).toBe(true);
      } finally {
        withEnv(original as any);
      }
    });
  });

  describe('assertEnv', () => {
    it('throws in production when config is invalid', () => {
      const original = withEnv({ DATABASE_URL: undefined, AUTH_SECRET: undefined, NEXT_PUBLIC_APP_URL: undefined });
      const spy = vi.spyOn(process, 'env', 'get');
      process.env.NODE_ENV = 'production';
      try {
        expect(() => assertEnv()).toThrow(/Configuration invalide/);
      } finally {
        withEnv(original as any);
        spy.mockRestore();
      }
    });
  });

  describe('getEnvStatus', () => {
    it('returns degraded when required vars missing', () => {
      const original = withEnv({ DATABASE_URL: undefined, AUTH_SECRET: undefined, NEXT_PUBLIC_APP_URL: undefined });
      try {
        const status = getEnvStatus();
        expect(status.status).toBe('degraded');
        expect(status.required[0].set).toBe(false);
      } finally {
        withEnv(original as any);
      }
    });
  });
});
