import { NextRequest, NextResponse } from 'next/server';
import { verify } from 'jsonwebtoken';
import { db } from '@/lib/db';

export interface SecurityContext {
  userId: string;
  role: string;
}

interface SecurityOptions {
  requireAuth?: boolean;
  roles?: string[];
}

const JWT_SECRET = process.env.AUTH_SECRET;

export async function applySecurity(
  request: NextRequest,
  options: SecurityOptions = {}
): Promise<{ auth?: SecurityContext; error?: NextResponse }> {

  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('[SECURITY] AUTH_SECRET manquant ou trop court');
    if (options.requireAuth) {
      return { error: NextResponse.json({ error: 'Erreur de configuration serveur' }, { status: 500 }) };
    }
    return { auth: { userId: 'anonymous', role: 'guest' } };
  }

  const apiKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization');

  if (apiKey) {
    const auth = await authenticateApiKey(apiKey);
    if (auth) return validateRole(auth, options);
  }

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const auth = await authenticateToken(token);
    if (auth) return validateRole(auth, options);
  }

  if (options.requireAuth) {
    return { error: NextResponse.json({ error: 'Authentification requise' }, { status: 401 }) };
  }

  return { auth: { userId: 'anonymous', role: 'guest' } };
}

export function secureResponse(response: NextResponse, _request: NextRequest): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

async function authenticateApiKey(apiKey: string): Promise<SecurityContext | null> {
  try {
    const key = await db.accessKey.findFirst({
      where: { keyValue: apiKey, isActive: true },
      include: { user: { select: { id: true, role: true } } },
    });
    if (!key || !key.user) return null;
    return { userId: key.user.id, role: key.user.role };
  } catch { return null; }
}

async function authenticateToken(token: string): Promise<SecurityContext | null> {
  try {
    const decoded = verify(token, JWT_SECRET) as { userId: string; role?: string };
    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true },
    });
    if (!user) return null;
    return { userId: user.id, role: user.role };
  } catch { return null; }
}

function validateRole(auth: SecurityContext, options: SecurityOptions): { auth: SecurityContext; error?: NextResponse } {
  if (options.roles && !options.roles.includes(auth.role)) {
    return {
      auth,
      error: NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 }),
    };
  }
  return { auth };
}
