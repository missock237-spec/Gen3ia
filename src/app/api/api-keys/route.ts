/**
 * API Keys API — GET: List keys, POST: Create key, DELETE: Revoke key
 * Réservé aux abonnements Starter, Pro et Enterprise.
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  getApiKeyStats,
  canCreateApiKey,
} from '@/lib/api-keys';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

/**
 * GET /api/api-keys
 * Returns list of API keys and stats
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const [keys, stats] = await Promise.all([
      listApiKeys(auth.userId),
      getApiKeyStats(auth.userId),
    ]);

    return secureResponse(
      NextResponse.json({ keys, stats }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Failed to fetch API keys', details: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      ),
      request
    );
  }
}

/**
 * POST /api/api-keys
 * Create a new API key
 */
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 10, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    // First check if user can create keys (plan-based)
    const check = await canCreateApiKey(auth.userId);
    if (!check.allowed) {
      return secureResponse(
        NextResponse.json({
          error: check.reason,
          upgradeRequired: true,
          currentCount: check.currentCount,
          maxKeys: check.maxKeys,
        }, { status: 403 }),
        request
      );
    }

    const body = await request.json();
    const { name, scopes, rateLimitPerMinute, expiresInDays } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return secureResponse(
        NextResponse.json({ error: 'Le nom de la clé est requis' }, { status: 400 }),
        request
      );
    }

    if (name.length > 64) {
      return secureResponse(
        NextResponse.json({ error: 'Le nom ne peut pas dépasser 64 caractères' }, { status: 400 }),
        request
      );
    }

    const result = await createApiKey({
      userId: auth.userId,
      name: name.trim(),
      scopes,
      rateLimitPerMinute,
      expiresInDays: expiresInDays ? parseInt(expiresInDays, 10) : undefined,
    });

    return secureResponse(
      NextResponse.json({
        success: true,
        key: result.apiKey,
        plainKey: result.plainKey,
        warning: 'Conservez cette clé en lieu sûr. Elle ne sera plus jamais affichée.',
      }),
      request
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('clés') || message.includes('plan') || message.includes('abonnement') || message.includes('réservées')) {
      return secureResponse(
        NextResponse.json({ error: message, upgradeRequired: true }, { status: 403 }),
        request
      );
    }

    return secureResponse(
      NextResponse.json(
        { error: 'Failed to create API key', details: message },
        { status: 500 }
      ),
      request
    );
  }
}

/**
 * DELETE /api/api-keys
 * Revoke an API key
 */
export async function DELETE(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 10, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('keyId') || (await request.json().then(b => b.keyId).catch(() => null));

    if (!keyId) {
      return secureResponse(
        NextResponse.json({ error: 'keyId est requis (query ou body)' }, { status: 400 }),
        request
      );
    }

    await revokeApiKey(keyId, auth.userId);

    return secureResponse(
      NextResponse.json({ success: true, message: 'Clé API révoquée avec succès' }),
      request
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('introuvable')) {
      return secureResponse(
        NextResponse.json({ error: message }, { status: 404 }),
        request
      );
    }

    return secureResponse(
      NextResponse.json(
        { error: 'Failed to revoke API key', details: message },
        { status: 500 }
      ),
      request
    );
  }
}
