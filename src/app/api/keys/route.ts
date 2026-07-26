import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-keys');

// ============================================================
// Types
// ============================================================

interface ApiKeyInput {
  name: string;
  scopes?: string[];
  expiresInDays?: number;
}

interface ApiKeyResponse {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  /**
   * La clef complete (visible uniquement a la creation)
   */
  key?: string;
}

// ============================================================
// Helpers
// ============================================================

const KEY_PREFIX = 'gv_';
const DEFAULT_SCOPES = ['chat:read', 'chat:write'];
const ALL_SCOPES = [
  'chat:read', 'chat:write',
  'agent:read', 'agent:write', 'agent:execute',
  'billing:read', 'billing:write',
  'admin:read', 'admin:write',
  'webhook:read', 'webhook:write',
  'voice:read', 'voice:write',
  'media:read', 'media:write',
  'user:read', 'user:write',
  '*',
];

function generateApiKey(): { fullKey: string; hashedKey: string; prefix: string } {
  const randomPart = randomBytes(32).toString('hex');
  const fullKey = `${KEY_PREFIX}${randomPart}`;
  const hashedKey = createHash('sha256').update(fullKey).digest('hex');
  const prefix = fullKey.substring(0, 10) + '...';
  return { fullKey, hashedKey, prefix };
}

function validateScopes(scopes: string[]): { valid: boolean; error?: string } {
  for (const scope of scopes) {
    if (scope === '*') continue;
    if (!ALL_SCOPES.includes(scope)) {
      return { valid: false, error: `Scope invalide: ${scope}` };
    }
  }
  return { valid: true };
}

// ============================================================
// GET /api/keys — Lister les clefs API de l'utilisateur
// ============================================================

export async function GET(request: NextRequest) {
  try {
    // Recuperer l'utilisateur depuis la session via header ou auth
    const userId = request.headers.get('x-user-id') || 'system';

    const apiKeys = await db.accessKey.findMany({
      where: { userId, keyType: 'api_key', service: 'developer' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyValue: true,
        scopes: true,
        createdAt: true,
        expiresAt: true,
        isActive: true,
        lastTestedAt: true,
        usageCount: true,
      },
    });

    const response: ApiKeyResponse[] = apiKeys.map(k => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyValue.substring(0, 10) + '...',
      scopes: JSON.parse(k.scopes || '[]'),
      createdAt: k.createdAt.toISOString(),
      expiresAt: k.expiresAt?.toISOString() || null,
      isActive: k.isActive,
      lastUsedAt: k.lastTestedAt?.toISOString() || null,
    }));

    return NextResponse.json({ success: true, data: response });
  } catch (err) {
    log.error('Failed to list API keys', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ success: false, error: 'Erreur lors de la recuperation des clefs' }, { status: 500 });
  }
}

// ============================================================
// POST /api/keys — Creer une nouvelle clef API
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'system';
    const body: ApiKeyInput = await request.json();

    if (!body.name || body.name.trim().length < 2) {
      return NextResponse.json({ success: false, error: 'Le nom doit contenir au moins 2 caracteres' }, { status: 400 });
    }

    if (body.name.length > 64) {
      return NextResponse.json({ success: false, error: 'Le nom ne doit pas depasser 64 caracteres' }, { status: 400 });
    }

    const scopes = body.scopes || DEFAULT_SCOPES;
    const scopeValidation = validateScopes(scopes);
    if (!scopeValidation.valid) {
      return NextResponse.json({ success: false, error: scopeValidation.error }, { status: 400 });
    }

    const { fullKey, hashedKey, prefix } = generateApiKey();

    const expiresAt = body.expiresInDays
      ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const apiKey = await db.accessKey.create({
      data: {
        name: body.name.trim(),
        description: `API key created: ${body.name.trim()}`,
        service: 'developer',
        keyType: 'api_key',
        keyValue: hashedKey,
        scopes: JSON.stringify(scopes),
        metadata: JSON.stringify({ prefix, scopes, createdVia: 'api' }),
        expiresAt,
        isActive: true,
        userId,
      },
      select: {
        id: true,
        name: true,
        scopes: true,
        createdAt: true,
        expiresAt: true,
        isActive: true,
      },
    });

    log.info('API key created', { userId, keyName: apiKey.name, scopes });

    const response: ApiKeyResponse = {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: prefix,
      key: fullKey, // UNIQUEMENT retourne a la creation !
      scopes: JSON.parse(apiKey.scopes || '[]'),
      createdAt: apiKey.createdAt.toISOString(),
      expiresAt: apiKey.expiresAt?.toISOString() || null,
      isActive: apiKey.isActive,
      lastUsedAt: null,
    };

    return NextResponse.json({ success: true, data: response, warning: 'Conservez cette clef. Elle ne sera plus jamais affichee.' }, { status: 201 });
  } catch (err) {
    log.error('Failed to create API key', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ success: false, error: 'Erreur lors de la creation de la clef' }, { status: 500 });
  }
}

// ============================================================
// PATCH /api/keys — Activer/Desactiver/Supprimer une clef
// ============================================================

export async function PATCH(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'system';
    const body = await request.json();
    const { keyId, action } = body;

    if (!keyId) {
      return NextResponse.json({ success: false, error: 'keyId requis' }, { status: 400 });
    }

    const existingKey = await db.accessKey.findFirst({
      where: { id: keyId, userId, keyType: 'api_key' },
    });

    if (!existingKey) {
      return NextResponse.json({ success: false, error: 'Clef introuvable' }, { status: 404 });
    }

    switch (action) {
      case 'revoke':
        await db.accessKey.update({
          where: { id: keyId },
          data: { isActive: false },
        });
        log.info('API key revoked', { userId, keyId });
        return NextResponse.json({ success: true, message: 'Clef revoquee' });

      case 'activate':
        await db.accessKey.update({
          where: { id: keyId },
          data: { isActive: true },
        });
        log.info('API key activated', { userId, keyId });
        return NextResponse.json({ success: true, message: 'Clef activee' });

      case 'delete':
        await db.accessKey.delete({
          where: { id: keyId },
        });
        log.info('API key deleted', { userId, keyId });
        return NextResponse.json({ success: true, message: 'Clef supprimee definitivement' });

      default:
        return NextResponse.json({ success: false, error: 'Action non reconnue. Utilisez revoke, activate, ou delete.' }, { status: 400 });
    }
  } catch (err) {
    log.error('Failed to update API key', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ success: false, error: 'Erreur lors de la mise a jour' }, { status: 500 });
  }
}
