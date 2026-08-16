// ============================================================
// GET  /api/referral — Stats de parrainage
// POST /api/referral — Appliquer un code de parrainage
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getReferralStats, getReferralCode, applyReferralCode } from '@/lib/referral';
import { withRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractUser(req: NextRequest): { uid: string; name?: string } | null {
  const cookie = req.cookies.get('gen3ia_session')?.value;
  if (!cookie) return null;
  try {
    return JSON.parse(Buffer.from(cookie, 'base64url').toString());
  } catch {
    return null;
  }
}

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const user = extractUser(req);
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const stats = await getReferralStats(user.uid);
  return NextResponse.json(stats);
}

async function postHandler(req: NextRequest): Promise<NextResponse> {
  const user = extractUser(req);
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.code) {
    return NextResponse.json({ error: 'Code de parrainage requis' }, { status: 400 });
  }

  const result = await applyReferralCode(user.uid, body.code);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message: `Parrainage réussi ! Vous avez gagné 5 crédits grâce à ${result.referrerName}.`,
  });
}

export const GET = withRateLimit(getHandler, RATE_LIMIT_PRESETS.default);
export const POST = withRateLimit(postHandler, { max: 1, windowSec: 3600, key: 'referral-apply' });
