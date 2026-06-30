/**
 * Developer API Key Service — For cross-SaaS task execution
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import crypto from 'crypto';

const log = createLogger('developer-service');

export interface CreateKeyInput {
  name: string;
  userId: string;
  scopes?: string[];
  expiresInDays?: number;
}

/**
 * Generate a new API key (prefix + random string)
 * Format: gv_live_[random_32_chars]
 */
export async function createDeveloperKey(input: CreateKeyInput) {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  const apiKey = `gv_live_${randomBytes}`;
  const prefix = apiKey.substring(0, 12); // gv_live_xxxx

  // Hash the full key for secure storage
  const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const key = await db.developerKey.create({
    data: {
      name: input.name,
      apiKey: hashedKey,
      prefix,
      userId: input.userId,
      scopes: JSON.stringify(input.scopes || ['read:agents', 'execute:tasks']),
      expiresAt,
    }
  });

  log.info('New developer key created', { userId: input.userId, keyId: key.id });

  // Return the unhashed key once (client must save it)
  return {
    ...key,
    apiKey, // Return original key
  };
}

/**
 * Validate an API key and return the associated user and scopes
 */
export async function validateDeveloperKey(apiKey: string) {
  const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

  const key = await db.developerKey.findUnique({
    where: { apiKey: hashedKey },
    include: { user: true }
  });

  if (!key || !key.isActive) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;

  // Update last used timestamp
  await db.developerKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() }
  });

  return {
    userId: key.userId,
    user: key.user,
    scopes: JSON.parse(key.scopes) as string[]
  };
}

/**
 * List keys for a user
 */
export async function listDeveloperKeys(userId: string) {
  const keys = await db.developerKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });

  return keys.map(k => ({
    ...k,
    scopes: JSON.parse(k.scopes) as string[]
  }));
}

/**
 * Revoke a key
 */
export async function revokeDeveloperKey(keyId: string, userId: string) {
  return db.developerKey.update({
    where: { id: keyId, userId },
    data: { isActive: false }
  });
}
