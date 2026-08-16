// GET /api/notifications — Récupérer les notifications non lues
import { NextRequest, NextResponse } from 'next/server';
import { getUnreadNotifications } from '@/lib/push-notifications';
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

  const notifications = await getUnreadNotifications(userId);
  return NextResponse.json({ notifications, unreadCount: notifications.length });
}

export const GET = withRateLimit(handler, RATE_LIMIT_PRESETS.default);
