import { NextRequest, NextResponse } from 'next/server';
import { dashboardService } from '@/lib/dashboard';
import { getAuth } from '@/lib/security';

export async function GET(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const stats = await dashboardService.getRealtimeStats(auth.uid, 24);
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';

// GET /api/ads/dashboard?scope=overview — full dashboard
// GET /api/ads/dashboard?scope=campaign&campaignId=... — campaign detail
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (auth.role !== 'admin') return NextResponse.json({ error: 'Accès admin requis' }, { status: 403 });

  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'overview';

    if (scope === 'overview') {
      const overview = await advertiserDashboard.getOverview();
      return NextResponse.json({ success: true, overview });
    }

    if (scope === 'campaign') {
      const campaignId = url.searchParams.get('campaignId');
      if (!campaignId) return NextResponse.json({ error: 'campaignId requis' }, { status: 400 });
      const detail = await advertiserDashboard.getCampaignDetail(campaignId);
      return NextResponse.json({ success: true, detail });
    }

    return NextResponse.json({ error: 'Scope invalide' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
