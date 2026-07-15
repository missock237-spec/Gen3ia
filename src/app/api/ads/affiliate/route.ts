/**
 * Affiliate Ads API — GET: List affiliate offers, POST: Record affiliate click
 * Niveau 2 du système de publicités récompensées
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { getAffiliateLinks } from '@/lib/ads/ad-units';
import { addCredits } from '@/lib/billing/credits';
import { createLogger } from '@/lib/logger';

const log = createLogger('ads-affiliate');

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

/**
 * GET /api/ads/affiliate — Liste les offres d'affiliation disponibles
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const ads = getAffiliateLinks();

    // Statistiques de l'utilisateur pour les affiliations
    const events = await db.adEvent.findMany({
      where: {
        userId: auth.userId,
        type: { in: ['affiliate_click', 'affiliate_conversion'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const stats = {
      totalClicks: events.filter((e) => e.type === 'affiliate_click').length,
      totalConversions: events.filter((e) => e.type === 'affiliate_conversion').length,
      totalEarnings: events.reduce((sum, e) => sum + e.creditsAwarded, 0),
      totalCreditsEarned: events
        .filter((e) => e.type === 'affiliate_click')
        .reduce((sum, e) => sum + e.creditsAwarded, 0),
    };

    return secureResponse(NextResponse.json({ ads, stats }), request);
  } catch (err) {
    log.error('Failed to fetch affiliate ads', {
      userId: auth.userId,
      error: err instanceof Error ? err.message : String(err),
    });

    return secureResponse(
      NextResponse.json({ error: 'Failed to fetch affiliate ads' }, { status: 500 }),
      request
    );
  }
}

/**
 * POST /api/ads/affiliate — Enregistrer un clic d'affiliation
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
      return secureResponse(NextResponse.json({ error: 'Missing adUnitId' }, { status: 400 }), request);
    }

    // Vérifier que l'utilisateur n'a pas déjà cliqué récemment sur cette même pub
    const recentClick = await db.adEvent.findFirst({
      where: {
        userId: auth.userId,
        adUnitId,
        type: 'affiliate_click',
        createdAt: { gte: new Date(Date.now() - 3600000) }, // 1 heure
      },
    });

    if (recentClick) {
      // Ne pas récompenser deux fois de suite pour la même affiliation
      return secureResponse(
        NextResponse.json({
          success: true,
          creditsAwarded: 0,
          message: 'Lien déjà visité récemment. Essayez une autre offre !',
        }),
        request
      );
    }

    // Charger la config de l'ad unit
    const { AD_UNITS } = await import('@/lib/ads/ad-units');
    const adUnit = AD_UNITS.find((ad) => ad.id === adUnitId);

    if (!adUnit || adUnit.tier !== 2) {
      return secureResponse(NextResponse.json({ error: 'Invalid affiliate ad' }, { status: 400 }), request);
    }

    // Attribuer la récompense en crédits
    await addCredits({
      userId: auth.userId,
      amount: adUnit.rewardCredits,
      type: 'bonus',
      resourceType: 'ad_reward',
      description: `Affiliation: ${adUnit.name} (+${adUnit.rewardCredits} crédits)`,
      metadata: {
        adUnitId: adUnit.id,
        adName: adUnit.name,
        program: adUnit.affiliateProgram || '',
        commission: String(adUnit.affiliateCommission || 0),
        tier: '2',
      },
    });

    // Journaliser l'événement
    await db.adEvent.create({
      data: {
        userId: auth.userId,
        adUnitId: adUnit.id,
        type: 'affiliate_click',
        creditsAwarded: adUnit.rewardCredits,
        metadata: {
          adName: adUnit.name,
          program: adUnit.affiliateProgram || '',
          tier: '2',
        },
      },
    });

    log.info('Affiliate click recorded', {
      userId: auth.userId,
      adUnitId: adUnit.id,
      creditsAwarded: adUnit.rewardCredits,
    });

    return secureResponse(
      NextResponse.json({
        success: true,
        creditsAwarded: adUnit.rewardCredits,
        message: `+${adUnit.rewardCredits} crédits pour avoir visité ${adUnit.affiliateProgram || adUnit.name}`,
      }),
      request
    );
  } catch (err) {
    log.error('Failed to process affiliate click', {
      userId: auth.userId,
      error: err instanceof Error ? err.message : String(err),
    });

    return secureResponse(
      NextResponse.json({ error: 'Failed to process affiliate click' }, { status: 500 }),
      request
    );
  }
}
