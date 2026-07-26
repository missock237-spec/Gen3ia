// ============================================================
// Advertising API — Sert les publicités, enregistre les
// impressions et clics, gère les préférences utilisateur
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getAdEngine } from '@/lib/advertising/ad-engine';
import { getAuthenticatedUser } from '@/lib/session';

const engine = getAdEngine();

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'decide';

  try {
    switch (action) {
      case 'decide': {
        const sessionId = searchParams.get('sessionId') || `sess_${Date.now()}`;
        const conversationId = searchParams.get('conversationId') || undefined;
        const decision = await engine.decideAd(user.userId, sessionId, conversationId);
        return NextResponse.json(decision);
      }

      case 'preferences': {
        const prefs = await engine.getUserAdPreferences(user.userId);
        return NextResponse.json(prefs);
      }

      case 'stats': {
        const stats = await engine.getUserAdStats(user.userId);
        return NextResponse.json(stats);
      }

      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'impression': {
        const { campaignId, adType, sessionId, conversationId } = params;
        if (!campaignId || !adType || !sessionId) {
          return NextResponse.json({ error: 'campaignId, adType et sessionId requis' }, { status: 400 });
        }
        const result = await engine.recordImpression(
          user.userId, campaignId, adType, sessionId, conversationId
        );
        return NextResponse.json(result);
      }

      case 'click': {
        const { impressionId } = params;
        if (!impressionId) {
          return NextResponse.json({ error: 'impressionId requis' }, { status: 400 });
        }
        const result = await engine.recordClick(impressionId);
        return NextResponse.json(result);
      }

      case 'preferences': {
        const { rewardedAdsEnabled } = params;
        if (typeof rewardedAdsEnabled !== 'boolean') {
          return NextResponse.json({ error: 'rewardedAdsEnabled requis (boolean)' }, { status: 400 });
        }
        await engine.setRewardedAdsEnabled(user.userId, rewardedAdsEnabled);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
