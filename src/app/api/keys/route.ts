import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { getServerSession } from '@/lib/auth';
import crypto from 'crypto';





export const dynamic = "force-dynamic";
const log = createLogger('api-keys');

const VALID_SCOPES = ['agents:read', 'agents:write', 'agents:execute', 'voice:call', 'messages:send', 'billing:read', 'admin:read'];
const PREFIX = 'gva_';
const KEY_BYTES = 48;

function generateApiKey(): string {
  const raw = crypto.randomBytes(KEY_BYTES).toString('base64url');
  return `${PREFIX}${raw}`;
}

function hashKeySha256(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

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

    const validScopes = scopes.filter((s: string) => VALID_SCOPES.includes(s));
    if (validScopes.length === 0) {
      return NextResponse.json({
        error: 'Aucun scope valide fourni',
        validScopes: VALID_SCOPES,
      }, { status: 400 });
    }

    const rawKey = generateApiKey();
    const keyHash = hashKeySha256(rawKey);

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400000)
      : null;

    const id = `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // On utilise le modèle Prisma api_keys (table sql via raw) ou le modèle AccessKey
    // Compatible avec les deux approches du projet
    await db.$executeRawUnsafe(`
      INSERT INTO api_keys (id, user_id, name, key_hash, prefix, scopes, expires_at, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `,
      id,
      session.user.id,
      name.trim(),
      keyHash,
      rawKey.substring(0, 8),
      JSON.stringify(validScopes),
      expiresAt?.toISOString() ?? null
    );

    // Synchroniser aussi avec la table access_keys pour le middleware security.ts
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO access_keys (id, user_id, name, key_value, key_hash, scopes, expires_at, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `,
        id,
        session.user.id,
        name.trim(),
        rawKey,
        keyHash,
        JSON.stringify(validScopes),
        expiresAt?.toISOString() ?? null
      );
    } catch (syncError) {
      log.warn('Failed to sync to access_keys table, security.ts may not recognize this key', {
        error: syncError instanceof Error ? syncError.message : String(syncError),
      });
    }

    log.info('API key created', { name: name.trim(), scopes: validScopes, userId: session.user.id });

    return NextResponse.json({
      success: true,
      key: rawKey,
      prefix: rawKey.substring(0, 8),
      name: name.trim(),
      scopes: validScopes,
      expiresAt: expiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    log.error('API key creation error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const keys = await db.$queryRawUnsafe<Array<{
      id: string;
      name: string;
      prefix: string;
      scopes: string;
      last_used_at: string | null;
      expires_at: string | null;
      is_active: boolean;
      created_at: string;
    }>>(`
      SELECT id, name, prefix, scopes, last_used_at, expires_at, is_active, created_at
      FROM api_keys
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, session.user.id);

    return NextResponse.json({
      success: true,
      keys: keys.map(k => ({
        id: k.id,
        name: k.name,
        key: `${k.prefix}${'•'.repeat(32)}`,
        prefix: k.prefix,
        scopes: typeof k.scopes === 'string' ? JSON.parse(k.scopes) : k.scopes,
        lastUsed: k.last_used_at,
        expiresAt: k.expires_at,
        isActive: k.is_active,
        createdAt: k.created_at,
      })),
    });
  } catch (error) {
    log.error('API keys listing error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur de lecture' }, { status: 500 });
  }
}

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

    // Révoquer dans les deux tables
    await db.$executeRawUnsafe(`
      UPDATE api_keys SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
    `, keyId, session.user.id);

    await db.$executeRawUnsafe(`
      UPDATE access_keys SET is_active = false, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
    `, keyId, session.user.id).catch(() => {});

    log.info('API key revoked', { keyId, userId: session.user.id });

    return NextResponse.json({ success: true, message: 'Clé révoquée' });
  } catch (error) {
    log.error('API key revocation error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur lors de la révocation' }, { status: 500 });
  }
}
