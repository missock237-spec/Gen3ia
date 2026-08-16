// Advertising API — Publicités link-only, impressions, clics, préférences
// ------------------------------------------------------------
// Mirror of /api/ads but kept for back-compat. Uses the same engine.
// ------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { applySecurity, secureResponse } from '@/lib/security';
import { getAdEngine, type AdPlacement } from '@/lib/advertising/ad-engine';

export const dynamic = 'force-dynamic';
const log = createLogger('advertising');
const engine = getAdEngine();

function authId(auth: { id?: string; userId?: string } | null): string {
  if (!auth) return '';
  return auth.id || auth.userId || '';
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const action = request.nextUrl.searchParams.get('action') || 'decide';
  const userId = authId(auth);

  try {
    switch (action) {
      case 'decide': {
        const sessionId = request.nextUrl.searchParams.get('sessionId') || `sess_${Date.now()}`;
        const conversationId = request.nextUrl.searchParams.get('conversationId') || undefined;
        const placement = (request.nextUrl.searchParams.get('placement') as AdPlacement | null) || undefined;
        const keywordsParam = request.nextUrl.searchParams.get('keywords');
        const keywords = keywordsParam ? keywordsParam.split(',').filter(Boolean) : undefined;
        const decision = await engine.decideAd(userId, sessionId, conversationId, {
          placement,
          keywords,
        });
        const res = NextResponse.json(decision);
        return secureResponse(res, request);
      }
      case 'preferences': {
        const prefs = await engine.getUserAdPreferences(userId);
        const res = NextResponse.json(prefs);
        return secureResponse(res, request);
      }
      case 'stats': {
        const stats = await engine.getUserAdStats(userId);
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
    const userId = authId(auth);

    switch (action) {
      case 'impression': {
        const { campaignId, adType, sessionId, conversationId } = params as {
          campaignId?: string;
          adType?: 'unrewarded' | 'rewarded';
          sessionId?: string;
          conversationId?: string;
        };
        if (!campaignId || !adType || !sessionId) {
          return NextResponse.json(
            { error: 'campaignId, adType et sessionId requis' },
            { status: 400 }
          );
        }
        const result = await engine.recordImpression(userId, campaignId, adType, sessionId, conversationId);
        return NextResponse.json(result);
      }
      case 'click': {
        const { impressionId } = params as { impressionId?: string };
        if (!impressionId) return NextResponse.json({ error: 'impressionId requis' }, { status: 400 });
        const result = await engine.recordClick(impressionId);
        return NextResponse.json(result);
      }
      case 'set-ads-enabled': {
        const { enabled } = params as { enabled?: boolean };
        if (typeof enabled !== 'boolean') {
          return NextResponse.json({ error: 'enabled requis (boolean)' }, { status: 400 });
        }
        try {
          await engine.setAdsEnabled(userId, enabled);
          return NextResponse.json({ success: true });
        } catch (err) {
          const msg = String((err as Error).message || err);
          if (msg === 'FREE_PLAN_CANNOT_DISABLE_ADS') {
            return NextResponse.json(
              { error: 'Le plan gratuit ne permet pas de désactiver les publicités.' },
              { status: 403 }
            );
          }
          throw err;
        }
      }
      case 'preferences': {
        const { rewardedAdsEnabled } = params as { rewardedAdsEnabled?: boolean };
        if (typeof rewardedAdsEnabled !== 'boolean') {
          return NextResponse.json({ error: 'rewardedAdsEnabled requis (boolean)' }, { status: 400 });
        }
        try {
          await engine.setRewardedAdsEnabled(userId, rewardedAdsEnabled);
          return NextResponse.json({ success: true });
        } catch (err) {
          const msg = String((err as Error).message || err);
          if (msg === 'FREE_PLAN_CANNOT_EARN_REWARDS') {
            return NextResponse.json(
              { error: 'Le plan gratuit ne permet pas de cumuler des récompenses.' },
              { status: 403 }
            );
          }
          if (msg === 'REWARDS_REQUIRE_ADS_ENABLED') {
            return NextResponse.json(
              { error: 'Les récompenses nécessitent que les publicités soient activées.' },
              { status: 409 }
            );
          }
          throw err;
        }
      }
      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    log.error('advertising_post_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
