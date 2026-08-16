// POST /api/notifications/subscribe — Enregistrer une souscription push
import { NextRequest, NextResponse } from 'next/server';
import { saveSubscription } from '@/lib/push-notifications';
import { withRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handler(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get('gen3ia_session')?.value;
  if (!cookie) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  let userId: string;
  try {
    userId = JSON.parse(Buffer.from(cookie, 'base64url').toString()).uid;
  } catch {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return NextResponse.json({ error: 'Souscription invalide' }, { status: 400 });
  }

  const result = await saveSubscription(userId, body);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ success: true });
}

export const POST = withRateLimit(handler, RATE_LIMIT_PRESETS.default);
