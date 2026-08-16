// Token Encryption — chiffrement AES-256-GCM des tokens OAuth avant stockage
// Utilise VAULT_MASTER_KEY du .env (deja present)

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getMasterKey(): Buffer {
  const keyHex = process.env.VAULT_MASTER_KEY;
  if (!keyHex) {
    throw new Error('VAULT_MASTER_KEY manquant dans .env. Generer avec: openssl rand -hex 32');
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error('VAULT_MASTER_KEY doit etre 64 caracteres hex (32 bytes)');
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString('base64url');
}

export function decryptToken(ciphertext: string): string {
  const key = getMasterKey();
  const combined = Buffer.from(ciphertext, 'base64url');
  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function encryptField(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return encryptToken(value); }
  catch { return null; }
}

export function decryptField(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return decryptToken(value); }
  catch { return null; }
}

export function generateMasterKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
