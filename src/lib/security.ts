// ============================================================
// Gen3ia — Security Middleware pour les routes API
// Authentification JWT (access 15min) + API keys + RBAC
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db';

export interface SecurityContext {
  userId: string;
  role: string;
  email?: string;
}

interface SecurityOptions {
  requireAuth?: boolean;
  roles?: string[];
}

/**
 * Middleware de sécurité pour les routes API.
 * Supporte:
 * - Bearer token JWT (access token 15min)
 * - X-API-Key (API keys persistantes)
 * - Rôles (RBAC)
 */
export async function applySecurity(
  request: NextRequest,
  options: SecurityOptions = {}
): Promise<{ auth?: SecurityContext; error?: NextResponse }> {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    console.error('[SECURITY] AUTH_SECRET manquant ou trop court');
    if (options.requireAuth) {
      return { error: NextResponse.json({ error: 'Erreur de configuration serveur' }, { status: 500 }) };
    }
    return { auth: { userId: 'anonymous', role: 'guest' } };
  }

  // 1. Essayer API Key d'abord
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) {
    const auth = await authenticateApiKey(apiKey);
    if (auth) return validateRole(auth, options);
  }

  // 2. Essayer Bearer token JWT
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyAccessToken(token);
    if (payload) {
      const auth: SecurityContext = {
        userId: payload.sub,
        role: payload.role,
        email: payload.email,
      };
      return validateRole(auth, options);
    }
  }

  // 3. Si auth requise, retourner 401
  if (options.requireAuth) {
    return { error: NextResponse.json({ error: 'Authentification requise' }, { status: 401 }) };
  }

  return { auth: { userId: 'anonymous', role: 'guest' } };
}

/**
 * Ajoute des en-têtes de sécurité à la réponse
 */
export function secureResponse(response: NextResponse, _request: NextRequest): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

/**
 * Authentifie via API Key
 */
async function authenticateApiKey(apiKey: string): Promise<SecurityContext | null> {
  try {
    const key = await db.accessKey.findFirst({
      where: { keyValue: apiKey, isActive: true },
      include: { user: { select: { id: true, role: true } } },
    });
    if (!key || !key.user) return null;

    // Mettre à jour lastUsed
    await db.accessKey.update({
      where: { id: key.id },
      data: { lastUsed: new Date() },
    }).catch(() => {});

    return { userId: key.user.id, role: key.user.role };
  } catch {
    return null;
  }
}

/**
 * Vérifie les permissions RBAC
 */
function validateRole(auth: SecurityContext, options: SecurityOptions): { auth: SecurityContext; error?: NextResponse } {
  if (options.roles && !options.roles.includes(auth.role)) {
    return {
      auth,
      error: NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 }),
    };
  }
  return { auth };
}
