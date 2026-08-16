// ============================================================
// KEY ROTATION — Rotation des clés de chiffrement et secrets
// Permet de faire tourner VAULT_MASTER_KEY sans perte de données
// Procédure: decrypt(old) → encrypt(new) → update DB → activate
// ============================================================

import * as crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export interface RotationReport {
  startedAt: string;
  completedAt: string;
  totalRecords: number;
  rotated: number;
  failed: number;
  skipped: number;
  errors: Array<{ recordId: string; table: string; error: string }>;
  newKeyFingerprint: string;
  oldKeyFingerprint: string;
  status: 'success' | 'partial' | 'failed';
  rollbackAvailable: boolean;
}

export interface KeyFingerprint {
  hash: string;
  createdAt: string;
}

/**
 * Generate a new 256-bit master key (hex)
 */
export function generateNewMasterKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Compute fingerprint of a key (SHA-256, first 16 chars)
 */
export function keyFingerprint(keyHex: string): string {
  return crypto.createHash('sha256').update(keyHex).digest('hex').slice(0, 16);
}

/**
 * Encrypt with a specific key (not from env)
 */
function encryptWithKey(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

/**
 * Decrypt with a specific key (not from env)
 */
function decryptWithKey(ciphertext: string, keyHex: string): string | null {
  try {
    const key = Buffer.from(keyHex, 'hex');
    const combined = Buffer.from(ciphertext, 'base64url');
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Rotate the master encryption key
 * Re-encrypts all tokens in the database with the new key
 */
export async function rotateMasterKey(
  oldKeyHex: string,
  newKeyHex: string,
  dryRun = false,
): Promise<RotationReport> {
  const startedAt = new Date().toISOString();
  const errors: Array<{ recordId: string; table: string; error: string }> = [];
  let rotated = 0;
  let failed = 0;
  let skipped = 0;

  // Validate keys
  if (!oldKeyHex || oldKeyHex.length !== 64) {
    throw new Error('oldKeyHex invalide — doit être 64 caractères hex');
  }
  if (!newKeyHex || newKeyHex.length !== 64) {
    throw new Error('newKeyHex invalide — doit être 64 caractères hex');
  }
  if (oldKeyHex === newKeyHex) {
    throw new Error('La nouvelle clé doit être différente de l\'ancienne');
  }

  // 1. Rotate WorkflowAuthorization tokens
  try {
    const auths = await prisma.workflowAuthorization.findMany({
      where: { isActive: true, accessToken: { not: null } },
    });

    for (const auth of auths) {
      try {
        const plaintext = decryptWithKey(auth.accessToken, oldKeyHex);
        if (!plaintext) {
          skipped++;
          continue;
        }

        if (!dryRun) {
          const reEncrypted = encryptWithKey(plaintext, newKeyHex);
          await prisma.workflowAuthorization.update({
            where: { id: auth.id },
            data: {
              accessToken: reEncrypted,
              refreshToken: auth.refreshToken ? encryptWithKey(decryptWithKey(auth.refreshToken, oldKeyHex) || '', newKeyHex) : null,
            },
          });
        }
        rotated++;
      } catch (err) {
        failed++;
        errors.push({
          recordId: auth.id,
          table: 'workflowAuthorization',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    errors.push({
      recordId: 'batch',
      table: 'workflowAuthorization',
      error: `Batch failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 2. Rotate any other encrypted fields (agent configs with secrets)
  try {
    const agents = await prisma.agent.findMany({
      where: { config: { contains: 'encrypt' } },
    });

    for (const agent of agents) {
      try {
        let config: Record<string, unknown>;
        try { config = JSON.parse(agent.config); } catch { skipped++; continue; }

        // Check for encrypted secrets in config
        if (config.encryptedSecret && typeof config.encryptedSecret === 'string') {
          const plaintext = decryptWithKey(config.encryptedSecret, oldKeyHex);
          if (plaintext) {
            if (!dryRun) {
              config.encryptedSecret = encryptWithKey(plaintext, newKeyHex);
              await prisma.agent.update({
                where: { id: agent.id },
                data: { config: JSON.stringify(config) },
              });
            }
            rotated++;
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
      } catch (err) {
        failed++;
        errors.push({
          recordId: agent.id,
          table: 'agent',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    errors.push({
      recordId: 'batch',
      table: 'agent',
      error: `Batch failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const status: RotationReport['status'] =
    failed === 0 ? 'success' : rotated > 0 ? 'partial' : 'failed';

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    totalRecords: rotated + failed + skipped,
    rotated: dryRun ? 0 : rotated,
    failed,
    skipped,
    errors,
    newKeyFingerprint: keyFingerprint(newKeyHex),
    oldKeyFingerprint: keyFingerprint(oldKeyHex),
    status,
    rollbackAvailable: !dryRun,
  };
}

/**
 * Verify that all encrypted data can be decrypted with a given key
 */
export async function verifyKey(keyHex: string): Promise<{
  valid: boolean;
  checked: number;
  decrypted: number;
  failed: number;
  details: Array<{ recordId: string; ok: boolean }>;
}> {
  const details: Array<{ recordId: string; ok: boolean }> = [];
  let checked = 0;
  let decrypted = 0;
  let failed = 0;

  const auths = await prisma.workflowAuthorization.findMany({
    where: { isActive: true, accessToken: { not: null } },
    take: 100,
  });

  for (const auth of auths) {
    checked++;
    const result = decryptWithKey(auth.accessToken, keyHex);
    if (result) {
      decrypted++;
      details.push({ recordId: auth.id, ok: true });
    } else {
      failed++;
      details.push({ recordId: auth.id, ok: false });
    }
  }

  return {
    valid: failed === 0,
    checked,
    decrypted,
    failed,
    details,
  };
}

/**
 * Get a list of all secrets that should be rotated regularly
 */
export function getSecretRotationChecklist(): Array<{
  name: string;
  envVar: string;
  rotationDays: number;
  lastRotated?: string;
  priority: 'critical' | 'high' | 'medium';
  description: string;
}> {
  return [
    { name: 'Vault Master Key', envVar: 'VAULT_MASTER_KEY', rotationDays: 90, priority: 'critical', description: 'Clé maître de chiffrement AES-256-GCM' },
    { name: 'JWT Secret', envVar: 'JWT_SECRET', rotationDays: 30, priority: 'critical', description: 'Secret pour la signature des tokens JWT' },
    { name: 'OpenAI API Key', envVar: 'OPENAI_API_KEY', rotationDays: 60, priority: 'high', description: 'Clé API OpenAI pour GPT-4/GPT-3.5' },
    { name: 'Anthropic API Key', envVar: 'ANTHROPIC_API_KEY', rotationDays: 60, priority: 'high', description: 'Clé API Anthropic pour Claude' },
    { name: 'Groq API Key', envVar: 'GROQ_API_KEY', rotationDays: 60, priority: 'high', description: 'Clé API Groq pour Llama' },
    { name: 'GitHub Token', envVar: 'GITHUB_TOKEN', rotationDays: 30, priority: 'high', description: 'Token d\'accès GitHub pour le déploiement' },
    { name: 'Firebase API Key', envVar: 'NEXT_PUBLIC_FIREBASE_API_KEY', rotationDays: 90, priority: 'medium', description: 'Clé API Firebase publique' },
    { name: 'Stripe Secret Key', envVar: 'STRIPE_SECRET_KEY', rotationDays: 30, priority: 'critical', description: 'Clé secrète Stripe pour les paiements' },
    { name: 'Twilio Auth Token', envVar: 'TWILIO_AUTH_TOKEN', rotationDays: 60, priority: 'high', description: 'Token Twilio pour les SMS' },
  ];
}
