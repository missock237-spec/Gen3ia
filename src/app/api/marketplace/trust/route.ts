// API Marketplace Trust - Badges, tests, score
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { marketplaceTrust } from '@/lib/marketplace/trust-system';

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'test';
    switch (action) {
      case 'test': {
        if (!body.listingId) return NextResponse.json({ error: 'listingId requis' }, { status: 400 });
        const result = await marketplaceTrust.runSandboxTest(body.listingId);
        return NextResponse.json({ success: true, result });
      }
      case 'badges': {
        if (!body.listingId) return NextResponse.json({ error: 'listingId requis' }, { status: 400 });
        const badges = await marketplaceTrust.computeBadges(body.listingId);
        return NextResponse.json({ success: true, badges });
      }
      case 'score': {
        if (!body.listingId) return NextResponse.json({ error: 'listingId requis' }, { status: 400 });
        const score = await marketplaceTrust.computeTrustScore(body.listingId);
        return NextResponse.json({ success: true, trustScore: score });
      }
      case 'test-all': {
        const result = await marketplaceTrust.testAllPending();
        return NextResponse.json({ success: true, ...result });
      }
      default: return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const badges = marketplaceTrust.getBadgeDefinitions();
    return NextResponse.json({ success: true, badges });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}