/**
 * Reward Ads System — Engine
 *
 * Handles ad view tracking, quota checks, and credit rewards.
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { AD_UNITS, getRandomAdForPlacement } from './ad-units';
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

/**
 * Check if a user can view a specific ad
 */
export async function canViewAd(userId: string, adUnit: AdUnit): Promise<AdRewardResult> {
  const quota = await getOrCreateDailyQuota(userId, adUnit.id);

  // Check daily limit
  if (quota.views >= adUnit.dailyLimit) {
    const remaining = Math.max(0, adUnit.dailyLimit - quota.views);
    return {
      success: false,
      creditsAwarded: 0,
      totalToday: quota.views,
      dailyLimit: adUnit.dailyLimit,
      cooldownRemaining: 0,
      message: `Daily limit reached for this ad (${quota.views}/${adUnit.dailyLimit}). Try again tomorrow!`,
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
        message: `Please wait ${remaining}s before viewing another ad.`,
      };
    }
  }

  return {
    success: true,
    creditsAwarded: adUnit.rewardCredits,
    totalToday: quota.views,
    dailyLimit: adUnit.dailyLimit,
    cooldownRemaining: 0,
    message: `Watch the ad to earn ${adUnit.rewardCredits} credits!`,
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
      description: `Rewarded ad: ${adUnit.name} (+${adUnit.rewardCredits} credits)`,
      metadata: {
        adUnitId: adUnit.id,
        adName: adUnit.name,
        placement: adUnit.placement,
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
        },
      },
    });

    // Get updated quota
    const updatedQuota = await getOrCreateDailyQuota(userId, adUnit.id);

    log.info('Ad reward claimed', {
      userId,
      adUnitId: adUnit.id,
      creditsAwarded: adUnit.rewardCredits,
      totalToday: updatedQuota.views,
    });

    return {
      success: true,
      creditsAwarded: adUnit.rewardCredits,
      totalToday: updatedQuota.views,
      dailyLimit: adUnit.dailyLimit,
      cooldownRemaining: adUnit.cooldownSeconds,
      message: `+${adUnit.rewardCredits} credits earned!`,
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
      message: 'Failed to process ad reward. Please try again.',
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
 * Get today's ad stats for a user
 */
export async function getUserAdStats(userId: string): Promise<{
  todayEarnings: number;
  todayViews: number;
  maxDailyCredits: number;
  adsWatched: { name: string; views: number; credits: number; limit: number }[];
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
    };
  });

  const totalCredits = AD_UNITS
    .filter((a) => a.status === 'active')
    .reduce((sum, a) => sum + a.rewardCredits * a.dailyLimit, 0);

  return {
    todayEarnings: quotas.reduce((sum, q) => sum + q.creditsEarned, 0),
    todayViews: quotas.reduce((sum, q) => sum + q.views, 0),
    maxDailyCredits: totalCredits,
    adsWatched,
  };
}
