/**
 * API Keys System — Gérez les clés d'API Genova
 * Réservé aux abonnements Starter, Pro et Enterprise.
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import crypto from 'crypto';

const log = createLogger('api-keys');

// ===================================================================
// Types
// ===================================================================

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;     // first 8 chars for identification
  keyHash: string;       // SHA-256 hash of the full key
  keyLastFour: string;   // last 4 chars for display
  scopes: string[];
  rateLimitPerMinute: number;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyInput {
  userId: string;
  name: string;
  scopes?: string[];
  rateLimitPerMinute?: number;
  expiresInDays?: number;
}

export interface ApiKeyWithPlainKey {
  apiKey: ApiKey;
  plainKey: string;   // Only shown once at creation
}

// ===================================================================
// Constants
// ===================================================================

const KEY_PREFIX = 'gva_';
const KEY_BYTES = 32; // 256-bit key

const PLAN_LIMITS: Record<string, { maxKeys: number; rateLimit: number; scopes: string[] }> = {
  free: { maxKeys: 0, rateLimit: 0, scopes: [] },
  starter: { maxKeys: 3, rateLimit: 60, scopes: ['agents:read', 'agents:execute', 'credits:read'] },
  pro: { maxKeys: 10, rateLimit: 300, scopes: ['agents:read', 'agents:execute', 'agents:write', 'credits:read', 'credits:write', 'analytics:read', 'memory:read', 'memory:write'] },
  enterprise: { maxKeys: 50, rateLimit: 1000, scopes: ['*'] },
  custom: { maxKeys: 100, rateLimit: 5000, scopes: ['*'] },
};

// ===================================================================
// Core Functions
// ===================================================================

/**
 * Generate a cryptographically secure API key
 */
function generateApiKey(): { plainKey: string; keyPrefix: string; keyHash: string; keyLastFour: string } {
  const randomBytes = crypto.randomBytes(KEY_BYTES);
  const plainKey = KEY_PREFIX + randomBytes.toString('base64url');
  const keyPrefix = plainKey.substring(0, 11); // "gva_" + 7 chars
  const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
  const keyLastFour = plainKey.slice(-4);

  return { plainKey, keyPrefix, keyHash, keyLastFour };
}

/**
 * Check if a user's plan allows API key creation
 */
export async function canCreateApiKey(userId: string): Promise<{ allowed: boolean; reason?: string; currentCount?: number; maxKeys?: number }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  if (!user) {
    return { allowed: false, reason: 'Utilisateur introuvable' };
  }

  const planLimits = PLAN_LIMITS[user.plan];
  if (!planLimits) {
    return { allowed: false, reason: 'Plan invalide' };
  }

  if (planLimits.maxKeys === 0) {
    return {
      allowed: false,
      reason: `Les clés API sont réservées aux abonnements Starter (9$/mois), Pro (29$/mois) et Enterprise (99$/mois).`,
    };
  }

  // Count existing active keys
  const keyCount = await db.genovaApiKey.count({
    where: { userId, isActive: true },
  });

  if (keyCount >= planLimits.maxKeys) {
    return {
      allowed: false,
      reason: `Vous avez atteint la limite de ${planLimits.maxKeys} clés pour votre plan ${user.plan}. Passez à un plan supérieur pour plus de clés.`,
      currentCount: keyCount,
      maxKeys: planLimits.maxKeys,
    };
  }

  return { allowed: true, currentCount: keyCount, maxKeys: planLimits.maxKeys };
}

/**
 * Create a new API key for a user
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyWithPlainKey> {
  const { userId, name, scopes, rateLimitPerMinute, expiresInDays } = input;

  // Check plan limits
  const check = await canCreateApiKey(userId);
  if (!check.allowed) {
    throw new Error(check.reason);
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  const planLimits = PLAN_LIMITS[user?.plan || 'free'];

  const { plainKey, keyPrefix, keyHash, keyLastFour } = generateApiKey();

  // Determine scopes
  const allowedScopes = scopes && scopes.length > 0
    ? scopes.filter(s => planLimits.scopes.includes(s) || planLimits.scopes.includes('*'))
    : planLimits.scopes;

  // Determine rate limit
  const rateLimit = rateLimitPerMinute || planLimits.rateLimit;

  // Determine expiration
  let expiresAt: Date | null = null;
  if (expiresInDays && expiresInDays > 0) {
    expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  }

  const apiKey = await db.genovaApiKey.create({
    data: {
      userId,
      name,
      keyPrefix,
      keyHash,
      keyLastFour,
      scopes: JSON.stringify(allowedScopes),
      rateLimitPerMinute: rateLimit,
      expiresAt,
    },
  });

  log.info('API key created', {
    userId,
    keyId: apiKey.id,
    keyPrefix,
    plan: user?.plan,
  });

  return {
    apiKey: {
      id: apiKey.id,
      userId: apiKey.userId,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      keyHash: apiKey.keyHash,
      keyLastFour: apiKey.keyLastFour,
      scopes: JSON.parse(apiKey.scopes),
      rateLimitPerMinute: apiKey.rateLimitPerMinute,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt,
    },
    plainKey, // Displayed only once!
  };
}

/**
 * List all API keys for a user (without the plain key)
 */
export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  const keys = await db.genovaApiKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return keys.map((key) => ({
    id: key.id,
    userId: key.userId,
    name: key.name,
    keyPrefix: key.keyPrefix,
    keyHash: key.keyHash,
    keyLastFour: key.keyLastFour,
    scopes: JSON.parse(key.scopes),
    rateLimitPerMinute: key.rateLimitPerMinute,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    isActive: key.isActive,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  }));
}

/**
 * Revoke (soft-delete) an API key
 */
export async function revokeApiKey(keyId: string, userId: string): Promise<void> {
  const key = await db.genovaApiKey.findFirst({
    where: { id: keyId, userId },
  });

  if (!key) {
    throw new Error('Clé API introuvable');
  }

  await db.genovaApiKey.update({
    where: { id: keyId },
    data: { isActive: false },
  });

  log.info('API key revoked', { userId, keyId, keyPrefix: key.keyPrefix });
}

/**
 * Verify an API key from an Authorization header
 * Returns the user ID and scopes if valid
 */
export async function verifyApiKey(authHeader: string): Promise<{
  valid: boolean;
  userId?: string;
  scopes?: string[];
  reason?: string;
}> {
  // Extract key from "Bearer gva_..."
  const match = authHeader.match(/^Bearer\s+(gva_.+)$/i);
  if (!match) {
    return { valid: false, reason: 'Format de clé API invalide. Utilisez: Bearer gva_...' };
  }

  const plainKey = match[1];
  const keyHash = crypto.createHash('sha256').update(plainKey).digest('hex');
  const keyPrefix = plainKey.substring(0, 11);

  // Find by hash
  const key = await db.genovaApiKey.findFirst({
    where: { keyHash, isActive: true },
    include: { user: { select: { plan: true, isActive: true } } },
  });

  if (!key) {
    return { valid: false, reason: 'Clé API invalide ou révoquée' };
  }

  if (!key.user.isActive) {
    return { valid: false, reason: 'Compte utilisateur désactivé' };
  }

  // Check expiration
  if (key.expiresAt && key.expiresAt < new Date()) {
    return { valid: false, reason: 'Clé API expirée' };
  }

  // Update last used
  await db.genovaApiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    valid: true,
    userId: key.userId,
    scopes: JSON.parse(key.scopes),
  };
}

/**
 * Get API key stats and plan limits for a user
 */
export async function getApiKeyStats(userId: string): Promise<{
  totalKeys: number;
  activeKeys: number;
  maxKeys: number;
  plan: string;
  rateLimit: number;
  availableScopes: string[];
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  const plan = user?.plan || 'free';
  const planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  const totalKeys = await db.genovaApiKey.count({ where: { userId } });
  const activeKeys = await db.genovaApiKey.count({ where: { userId, isActive: true } });

  return {
    totalKeys,
    activeKeys,
    maxKeys: planLimits.maxKeys,
    plan,
    rateLimit: planLimits.rateLimit,
    availableScopes: planLimits.scopes,
  };
}
