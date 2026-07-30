// Advertising API — Publicites, impressions, clics, preferences

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { applySecurity, secureResponse } from '@/lib/security';
import { getAdEngine } from '@/lib/advertising/ad-engine';

const log = createLogger('advertising');
const engine = getAdEngine();

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const action = request.nextUrl.searchParams.get('action') || 'decide';

  try {
    switch (action) {
      case 'decide': {
        const sessionId = request.nextUrl.searchParams.get('sessionId') || `sess_${Date.now()}`;
        const conversationId = request.nextUrl.searchParams.get('conversationId') || undefined;
        const decision = await engine.decideAd(auth.userId, sessionId, conversationId);
        const res = NextResponse.json(decision);
        return secureResponse(res, request);
      }
      case 'preferences': {
        const prefs = await engine.getUserAdPreferences(auth.userId);
        const res = NextResponse.json(prefs);
        return secureResponse(res, request);
      }
      case 'stats': {
        const stats = await engine.getUserAdStats(auth.userId);
        const res = NextResponse.json(stats);
        return secureResponse(res, request);
      }
      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    log.error('advertising_get_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'impression': {
        const { campaignId, adType, sessionId, conversationId } = params;
        if (!campaignId || !adType || !sessionId) {
          return NextResponse.json({ error: 'campaignId, adType et sessionId requis' }, { status: 400 });
        }
        const result = await engine.recordImpression(auth.userId, campaignId, adType, sessionId, conversationId);
        return NextResponse.json(result);
      }
      case 'click': {
        const { impressionId } = params;
        if (!impressionId) return NextResponse.json({ error: 'impressionId requis' }, { status: 400 });
        const result = await engine.recordClick(impressionId);
        return NextResponse.json(result);
      }
      case 'preferences': {
        const { rewardedAdsEnabled } = params;
        if (typeof rewardedAdsEnabled !== 'boolean') {
          return NextResponse.json({ error: 'rewardedAdsEnabled requis (boolean)' }, { status: 400 });
        }
        await engine.setRewardedAdsEnabled(auth.userId, rewardedAdsEnabled);
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    log.error('advertising_post_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
