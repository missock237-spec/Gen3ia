/**
 * Reward Ads System — Engine
 *
 * Handles ad view tracking, quota checks, and credit rewards.
 * Supporte les 3 niveaux de récompense (Tier 1, 2, 3).
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { AD_UNITS, getRandomAdForPlacement, getAdsByTier, getMaxDailyCreditsByTier } from './ad-units';
import { addCredits } from '@/lib/billing/credits';
import type { AdUnit, AdRewardResult, DailyAdQuota } from './types';

const log = createLogger('ads-engine');

// ===================================================================
// Quota Management
// ===================================================================

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get or create today's quota for a user + ad unit
 */
async function getOrCreateDailyQuota(userId: string, adUnitId: string): Promise<DailyAdQuota> {
  const date = getTodayDate();

  const existing = await db.dailyAdQuota.findUnique({
    where: {
      userId_adUnitId_date: { userId, adUnitId, date },
    },
  });

  if (existing) {
    return {
      userId: existing.userId,
      adUnitId: existing.adUnitId,
      date: existing.date,
      views: existing.views,
      creditsEarned: existing.creditsEarned,
      lastViewAt: existing.lastViewAt,
    };
  }

  await db.dailyAdQuota.create({
    data: { userId, adUnitId, date },
  });

  return { userId, adUnitId, date, views: 0, creditsEarned: 0, lastViewAt: null };
}

// ===================================================================
// Tier-specific daily limits
// ===================================================================

const TIER_DAILY_CREDIT_CAPS = {
  1: 200,  // Niveau 1 : 200 crédits max/jour
  2: 150,  // Niveau 2 : 150 crédits max/jour
  3: 100,  // Niveau 3 : 100 crédits max/jour
};

async function getTierDailyEarnings(userId: string, tier: number): Promise<number> {
  const date = getTodayDate();
  const tierAdIds = getAdsByTier(tier).map((ad) => ad.id);

  if (tierAdIds.length === 0) return 0;

  const quotas = await db.dailyAdQuota.findMany({
    where: {
      userId,
      date,
      adUnitId: { in: tierAdIds },
    },
  });

  return quotas.reduce((sum, q) => sum + q.creditsEarned, 0);
}

// ===================================================================
// Main functions
// ===================================================================

/**
 * Check if a user can view a specific ad
 */
export async function canViewAd(userId: string, adUnit: AdUnit): Promise<AdRewardResult> {
  const quota = await getOrCreateDailyQuota(userId, adUnit.id);

  // Vérifier le plafond quotidien du tier
  const tierCap = TIER_DAILY_CREDIT_CAPS[adUnit.tier as keyof typeof TIER_DAILY_CREDIT_CAPS] || 200;
  const tierEarnings = await getTierDailyEarnings(userId, adUnit.tier);

  if (tierEarnings >= tierCap) {
    return {
      success: false,
      creditsAwarded: 0,
      totalToday: quota.views,
      dailyLimit: adUnit.dailyLimit,
      cooldownRemaining: 0,
      message: `Plafond journalier du Niveau ${adUnit.tier} atteint (${tierEarnings}/${tierCap} crédits). Revenez demain !`,
    };
  }

  // Check daily limit per ad
  if (quota.views >= adUnit.dailyLimit) {
    const remaining = Math.max(0, adUnit.dailyLimit - quota.views);
    return {
      success: false,
      creditsAwarded: 0,
      totalToday: quota.views,
      dailyLimit: adUnit.dailyLimit,
      cooldownRemaining: 0,
      message: `Limite quotidienne atteinte pour cette pub (${quota.views}/${adUnit.dailyLimit}). Réessayez demain !`,
    };
  }

  // Check cooldown
  if (quota.lastViewAt) {
    const elapsed = (Date.now() - new Date(quota.lastViewAt).getTime()) / 1000;
    if (elapsed < adUnit.cooldownSeconds) {
      const remaining = Math.ceil(adUnit.cooldownSeconds - elapsed);
      return {
        success: false,
        creditsAwarded: 0,
        totalToday: quota.views,
        dailyLimit: adUnit.dailyLimit,
        cooldownRemaining: remaining,
        message: `Veuillez patienter ${remaining}s avant de voir une autre pub.`,
      };
    }
  }

  return {
    success: true,
    creditsAwarded: adUnit.rewardCredits,
    totalToday: quota.views,
    dailyLimit: adUnit.dailyLimit,
    cooldownRemaining: 0,
    message: `Regardez la pub pour gagner ${adUnit.rewardCredits} crédits (Niveau ${adUnit.tier}) !`,
  };
}

/**
 * Record an ad view and award credits
 */
export async function recordAdViewAndReward(
  userId: string,
  adUnit: AdUnit
): Promise<AdRewardResult> {
  const check = await canViewAd(userId, adUnit);
  if (!check.success) {
    return check;
  }

  const date = getTodayDate();

  try {
    // Update quota
    await db.dailyAdQuota.upsert({
      where: {
        userId_adUnitId_date: { userId, adUnitId: adUnit.id, date },
      },
      update: {
        views: { increment: 1 },
        creditsEarned: { increment: adUnit.rewardCredits },
        lastViewAt: new Date(),
      },
      create: {
        userId,
        adUnitId: adUnit.id,
        date,
        views: 1,
        creditsEarned: adUnit.rewardCredits,
        lastViewAt: new Date(),
      },
    });

    // Award credits
    await addCredits({
      userId,
      amount: adUnit.rewardCredits,
      type: 'bonus',
      resourceType: 'ad_reward',
      description: `Pub Niveau ${adUnit.tier}: ${adUnit.name} (+${adUnit.rewardCredits} crédits)`,
      metadata: {
        adUnitId: adUnit.id,
        adName: adUnit.name,
        placement: adUnit.placement,
        tier: String(adUnit.tier),
      },
    });

    // Log event
    await db.adEvent.create({
      data: {
        userId,
        adUnitId: adUnit.id,
        type: 'reward_claimed',
        creditsAwarded: adUnit.rewardCredits,
        metadata: {
          placement: adUnit.placement,
          adName: adUnit.name,
          tier: String(adUnit.tier),
        },
      },
    });

    // Get updated quota
    const updatedQuota = await getOrCreateDailyQuota(userId, adUnit.id);

    log.info('Ad reward claimed', {
      userId,
      adUnitId: adUnit.id,
      tier: adUnit.tier,
      creditsAwarded: adUnit.rewardCredits,
      totalToday: updatedQuota.views,
    });

    return {
      success: true,
      creditsAwarded: adUnit.rewardCredits,
      totalToday: updatedQuota.views,
      dailyLimit: adUnit.dailyLimit,
      cooldownRemaining: adUnit.cooldownSeconds,
      message: `+${adUnit.rewardCredits} crédits gagnés (Niveau ${adUnit.tier}) !`,
    };
  } catch (err) {
    log.error('Failed to record ad reward', {
      userId,
      adUnitId: adUnit.id,
      error: err instanceof Error ? err.message : String(err),
    });

    return {
      success: false,
      creditsAwarded: 0,
      totalToday: 0,
      dailyLimit: adUnit.dailyLimit,
      cooldownRemaining: 0,
      message: 'Impossible de traiter la récompense. Réessayez.',
    };
  }
}

/**
 * Get ad for a placement with user eligibility
 */
export async function getEligibleAd(
  userId: string,
  placement: string
): Promise<{ ad: AdUnit | null; eligibility: AdRewardResult | null }> {
  const ad = getRandomAdForPlacement(placement);
  if (!ad) {
    return { ad: null, eligibility: null };
  }

  const eligibility = await canViewAd(userId, ad);
  return { ad, eligibility };
}

/**
 * Get today's ad stats for a user (with tier breakdown)
 */
export async function getUserAdStats(userId: string): Promise<{
  todayEarnings: number;
  todayViews: number;
  maxDailyCredits: number;
  tierEarnings: Record<number, { earned: number; cap: number }>;
  adsWatched: { name: string; views: number; credits: number; limit: number; tier: number }[];
}> {
  const date = getTodayDate();

  const quotas = await db.dailyAdQuota.findMany({
    where: { userId, date },
  });

  const adsWatched = quotas.map((q) => {
    const adUnit = AD_UNITS.find((a) => a.id === q.adUnitId);
    return {
      name: adUnit?.name || q.adUnitId,
      views: q.views,
      credits: q.creditsEarned,
      limit: adUnit?.dailyLimit || 0,
      tier: adUnit?.tier || 1,
    };
  });

  // Calcul par tier
  const tierEarnings: Record<number, { earned: number; cap: number }> = {};
  for (const tier of [1, 2, 3]) {
    const tierAds = adsWatched.filter((a) => a.tier === tier);
    const earned = tierAds.reduce((sum, a) => sum + a.credits, 0);
    tierEarnings[tier] = {
      earned,
      cap: TIER_DAILY_CREDIT_CAPS[tier as keyof typeof TIER_DAILY_CREDIT_CAPS],
    };
  }

  const maxDailyCredits = Object.values(TIER_DAILY_CREDIT_CAPS).reduce((a, b) => a + b, 0);

  return {
    todayEarnings: quotas.reduce((sum, q) => sum + q.creditsEarned, 0),
    todayViews: quotas.reduce((sum, q) => sum + q.views, 0),
    maxDailyCredits,
    tierEarnings,
    adsWatched,
  };
}

export { TIER_DAILY_CREDIT_CAPS };
