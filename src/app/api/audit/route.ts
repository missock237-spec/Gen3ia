// ============================================================
// GET /api/audit — Historique d'audit de l'utilisateur
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuditTrail, detectSuspiciousActivity } from '@/lib/audit-trail';
import { withRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handler(req: NextRequest): Promise<NextResponse> {
  const sessionCookie = req.cookies.get('gen3ia_session')?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(sessionCookie, 'base64url').toString());
    userId = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const checkSuspicious = url.searchParams.get('suspicious') === 'true';

  const [trail, suspicious] = await Promise.all([
    getAuditTrail(userId, { limit, offset }),
    checkSuspicious ? detectSuspiciousActivity(userId) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    trail,
    suspicious,
    total: trail.length,
  });
}

export const GET = withRateLimit(handler, RATE_LIMIT_PRESETS.default);
