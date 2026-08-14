// ============================================================
// GET  /api/feedback/admin — Tous les feedbacks (admin only)
// PATCH /api/feedback/admin — Mettre à jour le statut
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAllFeedback, updateFeedbackStatus, getFeedbackStats } from '@/lib/feedback';
import { withRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractUser(req: NextRequest): { uid: string; role?: string } | null {
  const cookie = req.cookies.get('gen3ia_session')?.value;
  if (!cookie) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cookie, 'base64url').toString());
    return { uid: decoded.uid, role: decoded.role };
  } catch {
    return null;
  }
}

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const user = extractUser(req);
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || undefined;
  const type = url.searchParams.get('type') || undefined;
  const stats = url.searchParams.get('stats') === 'true';

  if (stats) {
    const s = await getFeedbackStats();
    return NextResponse.json(s);
  }

  const feedbacks = await getAllFeedback({ status: status as never, type: type as never });
  return NextResponse.json({ feedbacks, total: feedbacks.length });
}

async function patchHandler(req: NextRequest): Promise<NextResponse> {
  const user = extractUser(req);
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body?.id || !body?.status) {
    return NextResponse.json({ error: 'id et status requis' }, { status: 400 });
  }

  const result = await updateFeedbackStatus(body.id, body.status, body.adminResponse);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ success: true });
}

export const GET = withRateLimit(getHandler, RATE_LIMIT_PRESETS.default);
export const PATCH = withRateLimit(patchHandler, RATE_LIMIT_PRESETS.default);
