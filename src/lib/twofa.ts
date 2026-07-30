// ============================================================
// TWO-FACTOR AUTHENTICATION (2FA) — TOTP + Backup Codes
// Compatible Google Authenticator, Authy, Microsoft Authenticator
// ============================================================

import { randomBytes, createHash, timingSafeEqual } from 'crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ISSUER = 'Gen3ia AI';
const BACKUP_CODES_COUNT = 10;
const BACKUP_CODE_LENGTH = 10;
const TOTP_INTERVAL = 30;
const TOTP_DIGITS = 6;

/**
 * Générer un secret 2FA (base32 pour Google Authenticator)
 */
export function generateTOTPSecret(): string {
  const bytes = randomBytes(20);
  let secret = '';
  for (let i = 0; i < bytes.length; i++) {
    secret += BASE32[bytes[i] % 32];
  }
  // Padding pour multiple de 8
  while (secret.length % 8 !== 0) secret += '=';
  return secret;
}

/**
 * Générer l'URL pour le QR code (compatible Google Authenticator / Authy)
 */
export function generateTOTPUrl(secret: string, email: string): string {
  const encodedIssuer = encodeURIComponent(ISSUER);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_INTERVAL}`;
}

/**
 * Générer un code TOTP à partir du secret (RFC 6238 / HMAC-SHA1)
 */
export function generateTOTPCode(secret: string, time: number = Date.now()): string {
  const counter = Math.floor(time / 1000 / TOTP_INTERVAL);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter), 0);

  // Décoder le secret base32
  const key = base32Decode(secret);

  // HMAC-SHA1 avec padding (RFC 4226 section 5.2)
  const hmac = createHash('sha1');
  const blockSize = 64;
  let k = key;
  if (k.length > blockSize) {
    k = createHash('sha1').update(k).digest();
  }
  while (k.length < blockSize) {
    k = Buffer.concat([k, Buffer.alloc(1)]);
  }

  const oKeyPad = Buffer.alloc(blockSize);
  const iKeyPad = Buffer.alloc(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = k[i] ^ 0x5c;
    iKeyPad[i] = k[i] ^ 0x36;
  }

  const inner = createHash('sha1').update(Buffer.concat([iKeyPad, counterBuffer])).digest();
  const hash = createHash('sha1').update(Buffer.concat([oKeyPad, inner])).digest();

  // Dynamic truncation (RFC 4226 section 5.3)
  const offset = hash[hash.length - 1] & 0xf;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const code = binary % Math.pow(10, TOTP_DIGITS);
  return code.toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Vérifier un code TOTP (fenêtre de +/- 1 intervalle = 90s)
 * Utilise timingSafeEqual contre les attaques timing
 */
export function verifyTOTPCode(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  const now = Date.now();
  // Vérifier l'intervalle actuel, -30s, +30s (tolérance 90s)
  for (let i = -1; i <= 1; i++) {
    const expectedCode = generateTOTPCode(secret, now + i * TOTP_INTERVAL * 1000);
    try {
      if (timingSafeEqual(Buffer.from(expectedCode), Buffer.from(code))) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * Générer des codes de récupération (10 codes)
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODES_COUNT; i++) {
    const code = randomBytes(BACKUP_CODE_LENGTH)
      .toString('hex')
      .toUpperCase()
      .match(/.{4}/g)
      ?.join('-') || '';
    codes.push(code);
  }
  return codes;
}

/**
 * Hacher un code de récupération pour stockage sécurisé (SHA-256)
 */
export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Vérifier un code de récupération contre la liste des hashs stockés
 */
export function verifyBackupCode(code: string, hashedCodes: string[]): boolean {
  // Nettoyer le code (supprimer tirets, espaces)
  const cleaned = code.replace(/[-\s]/g, '').toUpperCase();
  const hashed = hashBackupCode(cleaned);
  return hashedCodes.some(h => {
    try {
      return timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hashed, 'hex'));
    } catch {
      return false;
    }
  });
}

/**
 * Vérifier si la 2FA est requise pour un utilisateur
 */
export function is2FARequired(user: { totpSecret: string | null; role: string }): boolean {
  if (user.totpSecret) return true;
  // Forcer la 2FA pour les admins
  if (user.role === 'admin') return true;
  return false;
}

// ============================================================
// Base32 Decode helper (RFC 4648)
// ============================================================

function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/=+$/, '').toUpperCase();
  const bits: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32.indexOf(char);
    if (idx === -1) continue;
    for (let i = 4; i >= 0; i--) {
      bits.push((idx >> i) & 1);
    }
  }

  const bytes: number[] = [];
  for (let i = 0; i + 7 < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i + j];
    }
    bytes.push(byte);
  }

  return Buffer.from(bytes);
}
