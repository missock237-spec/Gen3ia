// ============================================================
// POST /api/feedback — Soumettre un feedback
// GET  /api/feedback — Récupérer ses feedbacks
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createFeedback, getUserFeedback } from '@/lib/feedback';
import { withRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractUserId(req: NextRequest): string | null {
  const cookie = req.cookies.get('gen3ia_session')?.value;
  if (!cookie) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cookie, 'base64url').toString());
    return decoded.uid;
  } catch {
    return null;
  }
}

async function postHandler(req: NextRequest): Promise<NextResponse> {
  const userId = extractUserId(req);
  if (!userId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.type || !body?.subject || !body?.description) {
    return NextResponse.json({ error: 'type, subject et description requis' }, { status: 400 });
  }

  const result = await createFeedback({
    userId,
    type: body.type,
    subject: body.subject,
    description: body.description,
    page: body.page || req.headers.get('referer') || undefined,
    userAgent: req.headers.get('user-agent') || undefined,
    screenshots: body.screenshots,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: result.id, message: 'Merci pour votre feedback !' });
}

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const userId = extractUserId(req);
  if (!userId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const feedbacks = await getUserFeedback(userId, { limit, offset });
  return NextResponse.json({ feedbacks, total: feedbacks.length });
}

export const POST = withRateLimit(postHandler, { max: 10, windowSec: 3600, key: 'feedback-create' });
export const GET = withRateLimit(getHandler, RATE_LIMIT_PRESETS.default);
