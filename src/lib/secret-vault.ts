// ============================================================
// SECRET VAULT — Chiffrement AES-256-GCM des secrets utilisateur
// ============================================================

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const TAG_LENGTH = 16;
const ENCRYPTED_PREFIX = 'enc:v1';

function getMasterKey(): Buffer {
  const rawKey = process.env.VAULT_MASTER_KEY;

  if (!rawKey) {
    throw new Error('VAULT_MASTER_KEY environment variable is required');
  }

  if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    throw new Error('VAULT_MASTER_KEY must be a 64-character hex string');
  }

  const key = Buffer.from(rawKey, 'hex');

  if (key.length !== KEY_LENGTH) {
    throw new Error('VAULT_MASTER_KEY must decode to 32 bytes (256 bits)');
  }

  return key;
}

export function looksEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${ENCRYPTED_PREFIX}:`);
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt an empty secret');
  }

  if (looksEncrypted(plaintext)) {
    return plaintext;
  }

  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}:${iv.toString('base64url')}:${authTag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSecret(ciphertext: string): string {
  if (!ciphertext) {
    throw new Error('Cannot decrypt an empty secret');
  }

  if (!looksEncrypted(ciphertext)) {
    return ciphertext;
  }

  const payload = ciphertext.slice(`${ENCRYPTED_PREFIX}:`.length);
  const parts = payload.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format');
  }

  const [ivB64, tagB64, dataB64] = parts;

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted secret payload');
  }

  const key = getMasterKey();
  let iv: Buffer;
  let authTag: Buffer;
  let encrypted: Buffer;

  try {
    iv = Buffer.from(ivB64, 'base64url');
    authTag = Buffer.from(tagB64, 'base64url');
    encrypted = Buffer.from(dataB64, 'base64url');
  } catch {
    throw new Error('Invalid base64url encoding in encrypted secret');
  }

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length in encrypted secret');
  }

  if (authTag.length !== TAG_LENGTH) {
    throw new Error('Invalid auth tag length in encrypted secret');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error(
      `Decryption failed: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return '';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}********${value.slice(-4)}`;
}
