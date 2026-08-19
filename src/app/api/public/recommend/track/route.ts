// ============================================================
// API publique de tracking de recommandation Gen3ia
// POST /api/public/recommend/track
//  -> Enregistre un evenement de tracking (click / convert)
//     pour un partenaire donne. Le signup est gere separement
//     via attributeSignup dans le flux d'inscription.
//  -> Requiert le header X-Partner-Key (cle API du partenaire).
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { findActivePartner, trackPartnerEvent } from '@/lib/recommend';
import type { PartnerEventType } from '@/lib/recommend';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-partner-key') ?? request.nextUrl.searchParams.get('key');
  const partner = await findActivePartner(apiKey ?? '');

  if (!partner) {
    return NextResponse.json({ error: 'Cle partenaire invalide' }, { status: 401 });
  }
  if (partner.status !== 'active') {
    return NextResponse.json({ error: 'Partenaire suspendu' }, { status: 403 });
  }

  let body: {
    sessionId?: string;
    eventType?: string;
    metadata?: Record<string, unknown>;
  } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const eventType = body.eventType as PartnerEventType;
  if (eventType !== 'click' && eventType !== 'convert') {
    return NextResponse.json(
      { error: "Type d'evenement invalide. Utilisez 'click' ou 'convert'." },
      { status: 400 },
    );
  }

  await trackPartnerEvent(partner.id, eventType, {
    sessionId: body.sessionId,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] ?? undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
    referrer: request.headers.get('referer') ?? undefined,
    metadata: body.metadata,
  });

  return NextResponse.json(
    { ok: true, tracked: eventType },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'X-Partner-Key, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
}
