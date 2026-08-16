// ============================================================
// env-validator — tests unitaires (validation au demarrage, stack Firebase)
// ============================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  validateEnv,
  assertEnv,
  getEnvStatus,
  REQUIRED_ENV_VARS,
  FIREBASE_ADMIN_CREDENTIAL_KEYS,
} from './env-validator.js';

const VALID_ENV: Record<string, string> = {
  FIREBASE_PROJECT_ID: 'gen3ia',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'AIzaSyA1B2C3D4E5F6G7H8J9K0LMNopqrstuvwxyz',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'gen3ia.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'gen3ia',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:123456789012:web:abc123def456',
  NEXT_PUBLIC_APP_URL: 'https://gen3ia.ai',
  // Forme 2 des credentials Admin (separee)
  FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk-abc@gen3ia.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nMIIEowIBAAKCAQEAz\n-----END PRIVATE KEY-----\n',
};

function withEnv(env: Record<string, string | undefined>) {
  const original = { ...process.env };
  Object.keys(env).forEach((k) => {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k] as string;
  });
  return original;
}

function restoreEnv(original: Record<string, string | undefined>) {
  for (const key of [...Object.keys(process.env)]) {
    if (!(key in original)) delete process.env[key];
  }
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe('env-validator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateEnv', () => {
    it('returns valid when all Firebase required vars + admin credentials are present', () => {
      const original = withEnv(VALID_ENV);
      try {
        const res = validateEnv();
        expect(res.valid).toBe(true);
        expect(res.errors).toHaveLength(0);
      } finally {
        restoreEnv(original);
      }
    });

    it('accepts FIREBASE_SERVICE_ACCOUNT JSON as admin credential alternative', () => {
      const original = withEnv({
        ...VALID_ENV,
        FIREBASE_CLIENT_EMAIL: undefined,
        FIREBASE_PRIVATE_KEY: undefined,
        FIREBASE_SERVICE_ACCOUNT: '{"type":"service_account","project_id":"gen3ia"}',
      });
      try {
        const res = validateEnv();
        expect(res.valid).toBe(true);
      } finally {
        restoreEnv(original);
      }
    });

    it('flags missing required variables', () => {
      const original = withEnv({
        FIREBASE_PROJECT_ID: undefined,
        NEXT_PUBLIC_FIREBASE_API_KEY: undefined,
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: undefined,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: undefined,
        NEXT_PUBLIC_FIREBASE_APP_ID: undefined,
        NEXT_PUBLIC_APP_URL: undefined,
      });
      try {
        const res = validateEnv();
        expect(res.valid).toBe(false);
        expect(res.errors.length).toBeGreaterThanOrEqual(REQUIRED_ENV_VARS.length);
        expect(res.errors.some((e) => e.key === 'FIREBASE_PROJECT_ID')).toBe(true);
      } finally {
        restoreEnv(original);
      }
    });

    it('flags missing Firebase Admin credentials even when other required vars are set', () => {
      const original = withEnv({
        ...VALID_ENV,
        FIREBASE_CLIENT_EMAIL: undefined,
        FIREBASE_PRIVATE_KEY: undefined,
        FIREBASE_SERVICE_ACCOUNT: undefined,
      });
      try {
        const res = validateEnv();
        expect(res.valid).toBe(false);
        expect(res.errors.some((e) => e.key === 'FIREBASE_ADMIN_CREDENTIAL')).toBe(true);
      } finally {
        restoreEnv(original);
      }
    });

    it('flags an invalid URL', () => {
      const original = withEnv({ ...VALID_ENV, NEXT_PUBLIC_APP_URL: 'not-a-url' });
      try {
        const res = validateEnv();
        expect(res.errors.some((e) => e.key === 'NEXT_PUBLIC_APP_URL')).toBe(true);
      } finally {
        restoreEnv(original);
      }
    });

    it('flags an invalid FIREBASE_SERVICE_ACCOUNT JSON', () => {
      const original = withEnv({
        ...VALID_ENV,
        FIREBASE_CLIENT_EMAIL: undefined,
        FIREBASE_PRIVATE_KEY: undefined,
        FIREBASE_SERVICE_ACCOUNT: '{not-valid-json',
      });
      try {
        const res = validateEnv();
        expect(res.errors.some((e) => e.key === 'FIREBASE_SERVICE_ACCOUNT')).toBe(true);
      } finally {
        restoreEnv(original);
      }
    });
  });

  describe('validateEnv / exports', () => {
    it('exposes the Firebase admin credential keys and no legacy DATABASE_URL', () => {
      expect(FIREBASE_ADMIN_CREDENTIAL_KEYS).toContain('FIREBASE_SERVICE_ACCOUNT');
      expect(FIREBASE_ADMIN_CREDENTIAL_KEYS).toContain('FIREBASE_PRIVATE_KEY');
      const keys = REQUIRED_ENV_VARS.map((v) => v.key);
      expect(keys).not.toContain('DATABASE_URL');
      expect(keys).not.toContain('AUTH_SECRET');
      expect(keys).toContain('FIREBASE_PROJECT_ID');
    });
  });

  describe('assertEnv', () => {
    it('throws in production when config is invalid', () => {
      const original = withEnv({
        FIREBASE_PROJECT_ID: undefined,
        NEXT_PUBLIC_FIREBASE_API_KEY: undefined,
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: undefined,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: undefined,
        NEXT_PUBLIC_FIREBASE_APP_ID: undefined,
        NEXT_PUBLIC_APP_URL: undefined,
      });
      process.env.NODE_ENV = 'production';
      try {
        expect(() => assertEnv()).toThrow(/Configuration invalide/);
      } finally {
        restoreEnv(original);
        delete process.env.NODE_ENV;
      }
    });
  });

  describe('getEnvStatus', () => {
    it('returns degraded when required vars missing', () => {
      const original = withEnv({
        FIREBASE_PROJECT_ID: undefined,
        NEXT_PUBLIC_FIREBASE_API_KEY: undefined,
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: undefined,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: undefined,
        NEXT_PUBLIC_FIREBASE_APP_ID: undefined,
        NEXT_PUBLIC_APP_URL: undefined,
      });
      try {
        const status = getEnvStatus();
        expect(status.status).toBe('degraded');
        expect(status.required[0].set).toBe(false);
      } finally {
        restoreEnv(original);
      }
    });
  });
});
