/**
 * Ads API — GET: Get eligible ad, POST: Claim reward
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getEligibleAd, recordAdViewAndReward, getUserAdStats } from '@/lib/ads/engine';
import { getAdsForPlacement, AD_UNITS, getMaxDailyCreditsFromAds } from '@/lib/ads/ad-units';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

/**
 * GET /api/ads?placement=sidebar
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 60, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const { searchParams } = new URL(request.url);
    const placement = searchParams.get('placement') || 'sidebar';
    const includeStats = searchParams.get('stats') === 'true';

    const { ad, eligibility } = await getEligibleAd(auth.userId, placement);
    const allPlacements = ['sidebar', 'banner_top', 'banner_bottom', 'modal', 'dashboard_widget', 'footer'];
    const placementsWithAds = allPlacements
      .map((p) => ({ placement: p, available: getAdsForPlacement(p).length > 0 }))
      .filter((p) => p.available);

    const result: Record<string, unknown> = {
      ad: ad ? {
        id: ad.id, name: ad.name, format: ad.format, width: ad.width, height: ad.height,
        rewardCredits: ad.rewardCredits, imageUrl: ad.imageUrl, targetUrl: ad.targetUrl,
        alt: ad.alt, placement: ad.placement,
      } : null,
      eligibility,
      placements: placementsWithAds.map((p) => p.placement),
    };

    if (includeStats) {
      const stats = await getUserAdStats(auth.userId);
      result.stats = stats;
      result.maxDailyCredits = getMaxDailyCreditsFromAds();
    }

    return secureResponse(NextResponse.json(result), request);
  } catch (err) {
    return secureResponse(
      NextResponse.json({ error: 'Failed to fetch ad', details: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 }),
      request
    );
  }
}

/**
 * POST /api/ads
 */
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const body = await request.json();
    const { adUnitId } = body;

    if (!adUnitId) {
      return secureResponse(NextResponse.json({ error: 'Missing required field: adUnitId' }, { status: 400 }), request);
    }

    const adUnit = AD_UNITS.find((ad) => ad.id === adUnitId);
    if (!adUnit) {
      return secureResponse(NextResponse.json({ error: 'Invalid ad unit' }, { status: 400 }), request);
    }
    if (adUnit.status !== 'active') {
      return secureResponse(NextResponse.json({ error: 'This ad is no longer active' }, { status: 400 }), request);
    }

    const result = await recordAdViewAndReward(auth.userId, adUnit);

    if (!result.success) {
      return secureResponse(NextResponse.json(result, { status: 429 }), request);
    }

    return secureResponse(
      NextResponse.json({
        success: true, creditsAwarded: result.creditsAwarded,
        totalToday: result.totalToday, dailyLimit: result.dailyLimit, message: result.message,
      }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json({ error: 'Failed to process ad reward', details: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 }),
      request
    );
  }
}
