import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';

const log = createLogger('api-keys');

interface ApiKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

function generateApiKey(prefix: string = 'gv'): string {
  const key = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  return `${prefix}_${key}`;
}

function hashKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

const VALID_SCOPES = ['agents:read', 'agents:write', 'voice:call', 'messages:send', 'billing:read', 'admin:read'];

// POST — Créer une nouvelle clé API
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const { name, scopes = ['agents:read'], expiresInDays } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 });
    }

    if (scopes.length === 0) {
      return NextResponse.json({ error: 'Au moins un scope est requis' }, { status: 400 });
    }

    const invalidScopes = scopes.filter((s: string) => !VALID_SCOPES.includes(s));
    if (invalidScopes.length > 0) {
      return NextResponse.json({
        error: `Scopes invalides: ${invalidScopes.join(', ')}`,
        validScopes: VALID_SCOPES,
      }, { status: 400 });
    }

    const rawKey = generateApiKey();
    const keyHash = hashKey(rawKey);
    const prefix = rawKey.slice(0, 8);

    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null;

    await db.$executeRawUnsafe(`
      INSERT INTO api_keys (id, user_id, name, key_hash, prefix, scopes, expires_at, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
    `,
      `key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      session.user.id,
      name.trim(),
      keyHash,
      prefix,
      JSON.stringify(scopes),
      expiresAt
    );

    log.info('API key created', { name: name.trim(), scopes, userId: session.user.id });

    return NextResponse.json({
      success: true,
      key: rawKey,
      prefix,
      name: name.trim(),
      scopes,
      expiresAt,
    });
  } catch (error) {
    log.error('API key creation error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
  }
}

// GET — Lister les clés API
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const keys = await db.$queryRawUnsafe<ApiKey[]>(`
      SELECT id, name, prefix, scopes, last_used_at as "lastUsedAt", expires_at as "expiresAt", is_active as "isActive", created_at as "createdAt"
      FROM api_keys
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, session.user.id);

    return NextResponse.json({
      success: true,
      keys: keys.map(k => ({
        ...k,
        scopes: typeof k.scopes === 'string' ? JSON.parse(k.scopes) : k.scopes,
      })),
    });
  } catch (error) {
    log.error('API keys listing error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur de lecture' }, { status: 500 });
  }
}

// DELETE — Révoquer une clé API
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('id');

    if (!keyId) {
      return NextResponse.json({ error: 'ID de clé requis' }, { status: 400 });
    }

    await db.$executeRawUnsafe(`
      UPDATE api_keys SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
    `, keyId, session.user.id);

    log.info('API key revoked', { keyId, userId: session.user.id });

    return NextResponse.json({ success: true, message: 'Clé révoquée' });
  } catch (error) {
    log.error('API key revocation error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur lors de la révocation' }, { status: 500 });
  }
}
