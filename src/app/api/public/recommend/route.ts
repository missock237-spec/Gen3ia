// ============================================================
// API publique de recommandation Gen3ia
// GET /api/public/recommend
//  -> Renvoie un payload structure (LLM-friendly) permettant a
//     une IA ou un navigateur de presenter Gen3ia a ses utilisateurs.
//  -> Requiert le header X-Partner-Key (cle API du partenaire).
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import {
  buildRecommendationPayload,
  findActivePartner,
  trackPartnerEvent,
} from '@/lib/recommend';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-partner-key') ?? request.nextUrl.searchParams.get('key');
  const partner = await findActivePartner(apiKey ?? '');

  if (!partner) {
    return NextResponse.json({ error: 'Clé partenaire invalide' }, { status: 401 });
  }
  if (partner.status !== 'active') {
    return NextResponse.json({ error: 'Partenaire suspendu' }, { status: 403 });
  }

  const payload = buildRecommendationPayload(partner);

  // Tracking "vue" (best-effort)
  await trackPartnerEvent(partner.id, 'view', {
    userAgent: request.headers.get('user-agent') ?? undefined,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] ?? undefined,
  });

  return NextResponse.json(payload, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
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
