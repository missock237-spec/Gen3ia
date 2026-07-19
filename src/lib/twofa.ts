import { randomBytes, createHash, timingSafeEqual } from 'crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ISSUER = 'Genova AI';
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
  // Ajouter du padding pour que la longueur soit multiple de 8
  while (secret.length % 8 !== 0) secret += '=';
  return secret;
}

/**
 * Générer l'URL pour le QR code (Google Authenticator compatible)
 */
export function generateTOTPUrl(secret: string, email: string): string {
  const encodedIssuer = encodeURIComponent(ISSUER);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_INTERVAL}`;
}

/**
 * Générer un code TOTP à partir du secret (HMAC-SHA1)
 */
export function generateTOTPCode(secret: string, time: number = Date.now()): string {
  const counter = Math.floor(time / 1000 / TOTP_INTERVAL);
  const counterBuffer = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = counter & 0xff;
    counterBuffer.writeUInt32BE ? null : null;
  }
  counterBuffer.writeBigInt64BE(BigInt(counter), 0);

  // Décoder le secret base32
  const key = base32Decode(secret);

  // HMAC-SHA1
  const hmac = createHash('sha1');
  const blockSize = 64;
  let k = key;
  if (k.length > blockSize) {
    k = createHash('sha1').update(k).digest();
  }
  while (k.length < blockSize) k = Buffer.concat([k, Buffer.alloc(1)]);

  const oKeyPad = Buffer.alloc(blockSize);
  const iKeyPad = Buffer.alloc(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = k[i] ^ 0x5c;
    iKeyPad[i] = k[i] ^ 0x36;
  }

  const inner = createHash('sha1').update(Buffer.concat([iKeyPad, counterBuffer])).digest();
  const hash = createHash('sha1').update(Buffer.concat([oKeyPad, inner])).digest();

  // Dynamic truncation
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
 * Vérifier un code TOTP (avec fenêtre de +/- 1 intervalle)
 */
export function verifyTOTPCode(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  const now = Date.now();
  // Vérifier l'intervalle actuel, -30s, +30s
  for (let i = -1; i <= 1; i++) {
    const expectedCode = generateTOTPCode(secret, now + i * TOTP_INTERVAL * 1000);
    if (timingSafeEqual(Buffer.from(expectedCode), Buffer.from(code))) {
      return true;
    }
  }
  return false;
}

/**
 * Générer des codes de récupération
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
 * Hacher un code de récupération pour stockage sécurisé
 */
export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Vérifier un code de récupération
 */
export function verifyBackupCode(code: string, hashedCodes: string[]): boolean {
  const hashed = hashBackupCode(code);
  return hashedCodes.some(h => {
    try {
      return timingSafeEqual(Buffer.from(h), Buffer.from(hashed));
    } catch {
      return false;
    }
  });
}

// ============================================================
// Base32 Decode helper
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
