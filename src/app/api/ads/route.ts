// API Ads - Moteur publicitaire
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { getAdEngine, AdPlacement } from '@/lib/advertising/ad-engine';





export const dynamic = "force-dynamic";
const adEngine = getAdEngine();

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'decide';
    switch (scope) {
      case 'decide': {
        const sessionId = url.searchParams.get('sessionId') || auth.id || auth.userId;
        const placement = url.searchParams.get('placement') as AdPlacement | undefined;
        const keywords = url.searchParams.get('keywords')?.split(',').filter(Boolean);
        const decision = await adEngine.decideAd(auth.id || auth.userId, sessionId, undefined, { placement, keywords: keywords?.length ? keywords : undefined });
        return NextResponse.json({ success: true, decision });
      }
      case 'stats': {
        const stats = await adEngine.getUserAdStats(auth.id || auth.userId);
        return NextResponse.json({ success: true, stats });
      }
      case 'preferences': {
        const prefs = await adEngine.getUserAdPreferences(auth.id || auth.userId);
        return NextResponse.json({ success: true, preferences: prefs });
      }
      case 'campaigns': {
        if (auth.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
        const campaigns = await prisma.adCampaign.findMany({ orderBy: { createdAt: 'desc' } });
        return NextResponse.json({ success: true, campaigns });
      }
      case 'campaign-stats': {
        const campaignId = url.searchParams.get('campaignId');
        if (!campaignId) return NextResponse.json({ error: 'campaignId requis' }, { status: 400 });
        const stats = await adEngine.getCampaignStats(campaignId);
        return NextResponse.json({ success: true, stats });
      }
      case 'ab-test-results': {
        const groupId = url.searchParams.get('groupId');
        if (!groupId) return NextResponse.json({ error: 'groupId requis' }, { status: 400 });
        const results = await adEngine.getABTestResults(groupId);
        return NextResponse.json({ success: true, results });
      }
      default:
        return NextResponse.json({ error: 'Scope inconnu' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'impression';
    switch (action) {
      case 'impression': {
        if (!body.campaignId) return NextResponse.json({ error: 'campaignId requis' }, { status: 400 });
        const result = await adEngine.recordImpression(auth.id, body.campaignId, body.adType || 'unrewarded', body.sessionId || auth.id, body.conversationId);
        return NextResponse.json({ success: true, impression: result });
      }
      case 'click': {
        if (!body.impressionId) return NextResponse.json({ error: 'impressionId requis' }, { status: 400 });
        const result = await adEngine.recordClick(body.impressionId);
        return NextResponse.json({ success: true, click: result });
      }
      case 'set-rewarded': {
        if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'enabled requis (boolean)' }, { status: 400 });
        await adEngine.setRewardedAdsEnabled(auth.id, body.enabled);
        return NextResponse.json({ success: true });
      }
      case 'sync-rewards': {
        const { events } = body;
        if (!events || !Array.isArray(events)) return NextResponse.json({ error: 'events requis (array)' }, { status: 400 });
        const results = await Promise.allSettled(events.map((e: any) =>
          prisma.adImpression.create({ data: { campaignId: e.adId, userId: auth.id, sessionId: auth.id, adType: e.type === 'click' ? 'rewarded' : 'unrewarded', viewDurationMs: 0, wasClicked: e.type === 'click', rewardCredited: true, rewardAmount: e.credits || 0 } })
        ));
        return NextResponse.json({ success: true, synced: results.filter(r => r.status === 'fulfilled').length });
      }
      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
