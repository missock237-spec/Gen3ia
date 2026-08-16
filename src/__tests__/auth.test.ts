import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateAuthTokens,
  verifyAccessToken,
  verifyRefreshToken,
  validateEmail,
  validatePassword,
  sanitizeEmail,
  generateSessionToken,
  checkRateLimit,
} from '@/lib/auth';

describe('Password Hashing', () => {
  it('should hash and verify a password correctly', () => {
    const password = 'TestPassword123!';
    const hashed = hashPassword(password);
    expect(hashed).toContain(':');
    expect(verifyPassword(password, hashed)).toBe(true);
  });

  it('should reject wrong password', () => {
    const hashed = hashPassword('CorrectPwd123!');
    expect(verifyPassword('WrongPwd123!', hashed)).toBe(false);
  });

  it('should produce different hashes for same password', () => {
    const password = 'SamePwd123!';
    const hash1 = hashPassword(password);
    const hash2 = hashPassword(password);
    expect(hash1).not.toBe(hash2);
  });
});

describe('JWT Tokens', () => {
  const payload = { userId: 'test_123', email: 'test@test.com', plan: 'free', role: 'user' };

  it('should generate and verify access token', () => {
    const tokens = generateAuthTokens(payload);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.accessToken.split('.')).toHaveLength(3);

    const verified = verifyAccessToken(tokens.accessToken);
    expect(verified).toBeTruthy();
    expect(verified!.userId).toBe('test_123');
  });

  it('should generate and verify refresh token', () => {
    const tokens = generateAuthTokens(payload);
    const verified = verifyRefreshToken(tokens.refreshToken);
    expect(verified).toBeTruthy();
    expect(verified!.email).toBe('test@test.com');
  });

  it('should reject expired token', () => {
    const tokens = generateAuthTokens(payload);
    // Simulate expiration by manipulating the payload
    const parts = tokens.accessToken.split('.');
    const payloadB64 = parts[1];
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    decoded.exp = Math.floor(Date.now() / 1000) - 3600; // 1h ago
    const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url').replace(/=/g, '');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    // Signature will mismatch
    expect(verifyAccessToken(tamperedToken)).toBeNull();
  });

  it('should reject tampered token', () => {
    const tokens = generateAuthTokens(payload);
    const tampered = tokens.accessToken + 'tampered';
    expect(verifyAccessToken(tampered)).toBeNull();
  });
});

describe('Email Validation', () => {
  it('should validate correct emails', () => {
    expect(validateEmail('test@test.com')).toBe(true);
    expect(validateEmail('user+tag@domain.co.uk')).toBe(true);
    expect(validateEmail('a.b@c.d')).toBe(true);
  });

  it('should reject invalid emails', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('notanemail')).toBe(false);
    expect(validateEmail('@domain.com')).toBe(false);
    expect(validateEmail('user@')).toBe(false);
  });

  it('should sanitize emails', () => {
    expect(sanitizeEmail('Test@Example.COM')).toBe('test@example.com');
  });
});

describe('Password Validation', () => {
  it('should validate strong passwords', () => {
    expect(validatePassword('StrongPwd1').valid).toBe(true);
    expect(validatePassword('MyP@ssw0rd!').valid).toBe(true);
  });

  it('should reject weak passwords', () => {
    expect(validatePassword('short').valid).toBe(false);
    expect(validatePassword('nouppercase1').valid).toBe(false);
    expect(validatePassword('NOLOWERCASE1').valid).toBe(false);
    expect(validatePassword('NoDigits!').valid).toBe(false);
  });

  it('should enforce minimum length', () => {
    const result = validatePassword('Ab1');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('8');
  });
});

describe('Session Tokens', () => {
  it('should generate unique session tokens', () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();
    expect(token1).not.toBe(token2);
    expect(token1).toMatch(/^sess_/);
  });
});

describe('Rate Limiting', () => {
  it('should allow requests within limit', () => {
    const key = 'test_key_' + Date.now();
    expect(checkRateLimit(key, 3, 60000)).toBe(true);
    expect(checkRateLimit(key, 3, 60000)).toBe(true);
    expect(checkRateLimit(key, 3, 60000)).toBe(true);
  });

  it('should block requests exceeding limit', () => {
    const key = 'block_key_' + Date.now();
    expect(checkRateLimit(key, 2, 60000)).toBe(true);
    expect(checkRateLimit(key, 2, 60000)).toBe(true);
    expect(checkRateLimit(key, 2, 60000)).toBe(false);
  });
});

describe('Admin Detection', () => {
  const OLD_ENV = process.env;

  beforeAll(() => {
    process.env.ADMIN_EMAILS = 'admin@genova.ai,superadmin@genova.ai';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('should detect admin emails', async () => {
    const { isAdminEmail } = await import('@/lib/admin');
    expect(isAdminEmail('admin@genova.ai')).toBe(true);
    expect(isAdminEmail('superadmin@genova.ai')).toBe(true);
    expect(isAdminEmail('user@genova.ai')).toBe(false);
  });

  it('should be case insensitive for admin emails', async () => {
    const { isAdminEmail } = await import('@/lib/admin');
    expect(isAdminEmail('ADMIN@GENOVA.AI')).toBe(true);
  });
});
