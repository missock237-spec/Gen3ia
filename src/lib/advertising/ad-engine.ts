// ============================================================
// Gen3ia — Ad Engine (link-only, plan-aware)
// ------------------------------------------------------------
// Business rules (per user spec):
//   - FREE plan:
//       * ads are MANDATORY and shown after every AI agent response
//       * NO credit reward for any ad impression/click
//       * user CANNOT disable ads (server-enforced)
//   - Paid plans (starter / pro / enterprise / custom):
//       * ads shown after every AI agent response WITH credit rewards
//         (1 credit per impression, 2 credits per click by default)
//       * user CAN disable ads — disabling ads ALSO blocks all rewards
//       * user can independently toggle rewards off (ads stay, no credits)
//   - Ad creative format = LINK ONLY.
//       No image, no video, no carousel. Just: text + URL + CTA.
// ============================================================

import { db } from '@/lib/db';
import { getCreditEngine } from '@/lib/billing/credit-engine';
import { createLogger } from '@/lib/logger';
import type { PlanTier } from '@/lib/billing/plans';
import {
  checkImpressionAllowed,
  checkClickAllowed,
  atomicBudgetIncrement,
  ABUSE_LIMITS,
} from '@/lib/advertising/anti-abuse';

const log = createLogger('ad-engine');
const creditEngine = getCreditEngine();

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export type AdType = 'unrewarded' | 'rewarded';
export type CampaignStatus = 'pending' | 'active' | 'paused' | 'completed' | 'cancelled';

/**
 * Placement is conversation-only for now: ads render after each AI agent
 * response. The other placements are kept for API/back-compat but the
 * canonical placement is `conversation_inline`.
 */
export type AdPlacement =
  | 'conversation_inline'
  | 'bottom_bar'
  | 'sidebar'
  | 'banner_top'
  | 'inline';

export interface AdCampaign {
  id: string;
  name: string;
  description: string;
  advertiserName: string;
  advertiserUrl: string;
  // Link-only creative — no image, no video.
  textContent: string;
  ctaText: string;
  ctaUrl: string;
  targetPlan: 'all' | 'free' | 'paid';
  maxImpressions: number;
  maxClicks: number;
  rewardPerView: number;
  rewardPerClick: number;
  costPerView: number;
  costPerClick: number;
  budgetTotal: number;
  budgetSpent: number;
  status: CampaignStatus;
  startAt: Date | null;
  endAt: Date | null;
  isActive: boolean;
  placement: AdPlacement;
  targetKeywords?: string;
  frequencyCap?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdServingDecision {
  shouldShow: boolean;
  adType: AdType;
  campaign: AdCampaign | null;
  reason: string;
  placement?: AdPlacement;
  /** Reward that WILL be credited if the impression is recorded. */
  pendingRewardPerView: number;
  pendingRewardPerClick: number;
  /** Whether this user is on a free plan (and therefore cannot earn). */
  isFreePlan: boolean;
  /** Whether the user is allowed to disable ads (false on free). */
  canDisableAds: boolean;
}

export interface AdImpressionResult {
  impressionId: string;
  campaignId: string;
  adType: AdType;
  rewardCredited: boolean;
  rewardAmount: number;
}

export interface AdUserPreferences {
  /** Master switch — false hides all ads (paid plans only; free is always true). */
  adsEnabled: boolean;
  /** Reward toggle — false keeps ads visible but stops credit rewards (paid plans only). */
  rewardedAdsEnabled: boolean;
  totalCreditsEarned: number;
  totalAdsViewed: number;
  totalAdsClicked: number;
  /** Whether this user is eligible to see rewarded ads right now. */
  isEligible: boolean;
  /** 'rewarded' if both ads + rewards are on and not free, otherwise 'unrewarded'. */
  adType: AdType;
  optedOutCategories: string[];
  /** Free plan = ads are mandatory in conversation flow. */
  mustShowInConversation: boolean;
  /** Free plan = false (cannot disable ads). Paid plans = true. */
  canDisableAds: boolean;
  /** Whether this user is on a free plan. */
  isFreePlan: boolean;
  /** Effective plan tier (free | starter | pro | enterprise | custom). */
  plan: PlanTier;
}

// ------------------------------------------------------------
// Helpers — plan classification (single source of truth)
// ------------------------------------------------------------

const FREE_PLAN: PlanTier = 'free';

function isFreePlan(plan: string | null | undefined): boolean {
  return !plan || plan === FREE_PLAN;
}

function classifyPlan(plan: string | null | undefined): PlanTier {
  if (plan === 'starter' || plan === 'pro' || plan === 'enterprise' || plan === 'custom') {
    return plan;
  }
  return FREE_PLAN;
}

// ------------------------------------------------------------
// In-memory impression frequency cap (best-effort)
// ------------------------------------------------------------

const CAMPAIGN_CACHE_TTL = 30_000;
let campaignsCache: { timestamp: number; campaigns: AdCampaign[] } = { timestamp: 0, campaigns: [] };

const recentImpressions = new Map<string, number[]>();

function cleanupRecentImpressions() {
  const cutoff = Date.now() - 3600000;
  for (const [key, timestamps] of recentImpressions.entries()) {
    const filtered = timestamps.filter(t => t > cutoff);
    if (filtered.length === 0) recentImpressions.delete(key);
    else recentImpressions.set(key, filtered);
  }
}
setInterval(cleanupRecentImpressions, 300000).unref?.();

// ------------------------------------------------------------
// Engine
// ------------------------------------------------------------

export class AdEngine {
  /**
   * Resolve the user's plan from Firestore.
   * Falls back to 'free' when user cannot be found.
   */
  private async getUserPlan(userId: string): Promise<PlanTier> {
    if (!userId) return FREE_PLAN;
    try {
      const user = await db.user.findUnique({ where: { id: userId }, select: { plan: true } });
      return classifyPlan(user?.plan as string | undefined);
    } catch (err) {
      log.warn('getUserPlan_failed', { err: String(err) });
      return FREE_PLAN;
    }
  }

  /**
   * Compute the effective preferences for a user, enforcing plan rules:
   *   - free: adsEnabled=true, rewardedAdsEnabled=false, canDisableAds=false
   *   - paid: respects stored prefs; rewards auto-off when ads disabled
   */
  async getUserAdPreferences(userId: string): Promise<AdUserPreferences> {
    const plan = await this.getUserPlan(userId);
    const free = isFreePlan(plan);

    // Upsert preference doc — defaults: ads on, rewards on for paid / off for free.
    const prefs = await db.adUserPreference.upsert({
      where: { userId },
      create: { userId, adsEnabled: true, rewardedAdsEnabled: !free },
      update: {},
    });

    // Enforce plan rules server-side — stored values are ignored for free.
    const adsEnabled = free ? true : Boolean(prefs.adsEnabled);
    const rewardedAdsEnabled = free ? false : adsEnabled && Boolean(prefs.rewardedAdsEnabled);

    return {
      adsEnabled,
      rewardedAdsEnabled,
      totalCreditsEarned: Number(prefs.totalCreditsEarned ?? 0),
      totalAdsViewed: Number(prefs.totalAdsViewed ?? 0),
      totalAdsClicked: Number(prefs.totalAdsClicked ?? 0),
      isEligible: adsEnabled && (free || rewardedAdsEnabled),
      adType: rewardedAdsEnabled ? 'rewarded' : 'unrewarded',
      optedOutCategories: [],
      mustShowInConversation: adsEnabled,
      canDisableAds: !free,
      isFreePlan: free,
      plan,
    };
  }

  /**
   * Toggle the master ads switch.
   *   - free: REJECTED — free users cannot disable ads.
   *   - paid: when disabled, rewards are also blocked (auto-off).
   */
  async setAdsEnabled(userId: string, enabled: boolean): Promise<void> {
    const plan = await this.getUserPlan(userId);
    if (isFreePlan(plan)) {
      throw new Error('FREE_PLAN_CANNOT_DISABLE_ADS');
    }
    if (typeof enabled !== 'boolean') {
      throw new Error('INVALID_ENABLED_VALUE');
    }

    // When disabling ads, also disable rewards (block reward path entirely).
    const nextRewarded = enabled ? undefined : false;
    await db.adUserPreference.upsert({
      where: { userId },
      create: { userId, adsEnabled: enabled, rewardedAdsEnabled: nextRewarded ?? true },
      update: {
        adsEnabled: enabled,
        ...(nextRewarded === false ? { rewardedAdsEnabled: false } : {}),
      },
    });
    log.info('ads_enabled_updated', { userId: userId.slice(0, 8), plan, enabled });
  }

  /**
   * Toggle the rewards switch (paid only).
   *   - free: REJECTED — free users cannot earn credits from ads.
   *   - paid with ads disabled: REJECTED — rewards require ads to be on.
   *   - paid with ads enabled: respects the requested value.
   */
  async setRewardedAdsEnabled(userId: string, enabled: boolean): Promise<void> {
    const plan = await this.getUserPlan(userId);
    if (isFreePlan(plan)) {
      throw new Error('FREE_PLAN_CANNOT_EARN_REWARDS');
    }
    if (typeof enabled !== 'boolean') {
      throw new Error('INVALID_ENABLED_VALUE');
    }

    const current = await db.adUserPreference.findUnique({ where: { userId } });
    const adsEnabled = current ? Boolean(current.adsEnabled) : true;
    if (enabled && !adsEnabled) {
      throw new Error('REWARDS_REQUIRE_ADS_ENABLED');
    }

    await db.adUserPreference.upsert({
      where: { userId },
      create: { userId, adsEnabled: true, rewardedAdsEnabled: enabled },
      update: { rewardedAdsEnabled: enabled },
    });
    log.info('rewarded_ads_updated', { userId: userId.slice(0, 8), enabled });
  }

  /**
   * Fetch all active campaigns. Cached briefly to amortize Firestore reads.
   */
  async getActiveCampaigns(): Promise<AdCampaign[]> {
    const now = Date.now();
    if (campaignsCache.timestamp > 0 && now - campaignsCache.timestamp < CAMPAIGN_CACHE_TTL) {
      return campaignsCache.campaigns;
    }
    const nowDate = new Date();
    const campaigns = await db.adCampaign.findMany({
      where: {
        isActive: true,
        status: 'active',
        OR: [{ startAt: null }, { startAt: { lte: nowDate } }],
        AND: [{ OR: [{ endAt: null }, { endAt: { gte: nowDate } }] }],
      },
      orderBy: { createdAt: 'desc' },
    });
    const active = (campaigns as unknown as AdCampaign[]).filter(
      c => c.budgetTotal === 0 || c.budgetSpent < c.budgetTotal
    );
    campaignsCache = { timestamp: now, campaigns: active };
    return active;
  }

  /**
   * Decide which ad to serve for a given user/session.
   * Returns `shouldShow: false` when:
   *   - the user is on a paid plan AND has disabled ads
   *   - there is no matching active campaign
   */
  async decideAd(
    userId: string,
    sessionId: string,
    conversationId?: string,
    context?: { keywords?: string[]; placement?: AdPlacement; conversationTopic?: string }
  ): Promise<AdServingDecision> {
    const prefs = await this.getUserAdPreferences(userId);
    const campaigns = await this.getActiveCampaigns();

    if (!prefs.adsEnabled) {
      return {
        shouldShow: false,
        adType: 'unrewarded',
        campaign: null,
        reason: 'ADS_DISABLED_BY_USER',
        placement: context?.placement ?? 'conversation_inline',
        pendingRewardPerView: 0,
        pendingRewardPerClick: 0,
        isFreePlan: prefs.isFreePlan,
        canDisableAds: prefs.canDisableAds,
      };
    }

    if (campaigns.length === 0) {
      return {
        shouldShow: false,
        adType: prefs.adType,
        campaign: null,
        reason: 'NO_ACTIVE_CAMPAIGN',
        placement: context?.placement ?? 'conversation_inline',
        pendingRewardPerView: 0,
        pendingRewardPerClick: 0,
        isFreePlan: prefs.isFreePlan,
        canDisableAds: prefs.canDisableAds,
      };
    }

    const placement = context?.placement ?? 'conversation_inline';
    let candidates = campaigns;
    const byPlacement = campaigns.filter(c => c.placement === placement);
    if (byPlacement.length > 0) candidates = byPlacement;

    if (context?.keywords && context.keywords.length > 0) {
      const keywordsLower = context.keywords.map(k => k.toLowerCase());
      const byKeywords = candidates.filter(c => {
        if (!c.targetKeywords) return true;
        const targets = c.targetKeywords.toLowerCase().split(',').map(t => t.trim());
        return keywordsLower.some(k => targets.some(t => k.includes(t) || t.includes(k)));
      });
      if (byKeywords.length > 0) candidates = byKeywords;
    }

    // Plan-targeted filtering: 'free' = free users only, 'paid' = paid users only, 'all' = everyone
    candidates = candidates.filter(c => {
      if (!c.targetPlan || c.targetPlan === 'all') return true;
      if (c.targetPlan === 'free') return prefs.isFreePlan;
      if (c.targetPlan === 'paid') return !prefs.isFreePlan;
      return true;
    });

    const userKey = `${userId}:${sessionId}`;
    const userImpressions = recentImpressions.get(userKey) || [];
    const recentCount = userImpressions.filter(t => t > Date.now() - 3600000).length;
    candidates = candidates.filter(c => !c.frequencyCap || recentCount < c.frequencyCap);

    const selected = this.selectCampaignForUser(candidates, userId, prefs, context);
    if (!selected) {
      return {
        shouldShow: false,
        adType: prefs.adType,
        campaign: null,
        reason: 'NO_MATCHING_CAMPAIGN',
        placement,
        pendingRewardPerView: 0,
        pendingRewardPerClick: 0,
        isFreePlan: prefs.isFreePlan,
        canDisableAds: prefs.canDisableAds,
      };
    }

    const rewardPerView = prefs.rewardedAdsEnabled ? selected.rewardPerView : 0;
    const rewardPerClick = prefs.rewardedAdsEnabled ? selected.rewardPerClick : 0;

    return {
      shouldShow: true,
      adType: prefs.adType,
      campaign: selected,
      reason: prefs.rewardedAdsEnabled ? 'REWARDED_AD' : 'UNREWARDED_AD',
      placement: selected.placement,
      pendingRewardPerView: rewardPerView,
      pendingRewardPerClick: rewardPerClick,
      isFreePlan: prefs.isFreePlan,
      canDisableAds: prefs.canDisableAds,
    };
  }

  private selectCampaignForUser(
    campaigns: AdCampaign[],
    _userId: string,
    prefs: AdUserPreferences,
    context?: { keywords?: string[]; conversationTopic?: string }
  ): AdCampaign | null {
    if (campaigns.length === 0) return null;

    const scored = campaigns.map(c => {
      let score = 0;
      if (c.targetPlan === 'all') score += 10;
      if (c.targetPlan === 'free' && prefs.isFreePlan) score += 20;
      if (c.targetPlan === 'paid' && !prefs.isFreePlan) score += 15;
      if (c.budgetTotal > 0) {
        score += ((c.budgetTotal - c.budgetSpent) / c.budgetTotal) * 10;
      }
      if (prefs.rewardedAdsEnabled && c.rewardPerView > 0) score += c.rewardPerView * 100;
      if (context?.keywords && c.targetKeywords) {
        const kwLower = context.keywords.map(k => k.toLowerCase());
        const targets = c.targetKeywords.toLowerCase().split(',').map(t => t.trim());
        const matchCount = kwLower.filter(k => targets.some(t => k.includes(t) || t.includes(k))).length;
        score += matchCount * 25;
      }
      if (context?.conversationTopic && c.description.toLowerCase().includes(context.conversationTopic.toLowerCase())) {
        score += 30;
      }
      score += Math.random() * 5;
      return { campaign: c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const selected = scored[0].campaign;

    const userKey = `${_userId}:session`;
    const imps = recentImpressions.get(userKey) || [];
    imps.push(Date.now());
    recentImpressions.set(userKey, imps.slice(-50));
    return selected;
  }

  /**
   * Record an ad impression.
   * Credits the user ONLY if:
   *   - plan is paid
   *   - ads are enabled
   *   - rewards are enabled
   *   - campaign has rewardPerView > 0
   */
  async recordImpression(
    userId: string,
    campaignId: string,
    adType: AdType,
    sessionId: string,
    conversationId?: string
  ): Promise<AdImpressionResult> {
    const campaign = await db.adCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');

    // --- Anti-abuse check (server-side, DB-backed) ---
    const abuseCheck = await checkImpressionAllowed(userId, campaignId, sessionId);
    if (!abuseCheck.allowed) {
      log.warn('impression_blocked', {
        userId: userId.slice(0, 8),
        reason: abuseCheck.reason,
        fraudScore: abuseCheck.fraudScore,
      });
      throw new Error(`IMPRESSION_BLOCKED:${abuseCheck.reason}`);
    }

    const prefs = await this.getUserAdPreferences(userId);
    const isRewarded = adType === 'rewarded' && prefs.rewardedAdsEnabled && !prefs.isFreePlan;
    const rewardAmount = isRewarded ? Number(campaign.rewardPerView ?? 0) : 0;

    // --- Atomic budget check + increment (no race condition) ---
    const costIncrement = isRewarded ? Number(campaign.costPerView ?? 0) : Number(campaign.costPerView ?? 0) * 0.5;
    const budgetOk = await atomicBudgetIncrement(campaignId, costIncrement);
    if (!budgetOk) {
      throw new Error('CAMPAIGN_BUDGET_EXHAUSTED');
    }

    const impression = await db.adImpression.create({
      data: {
        campaignId,
        userId,
        sessionId,
        conversationId: conversationId || null,
        adType,
        viewDurationMs: 0,
        wasClicked: false,
        rewardCredited: false,
        rewardAmount: 0,
      },
    });

    if (isRewarded && rewardAmount > 0) {
      await this.creditReward(userId, rewardAmount, impression.id);
      await db.adImpression.update({
        where: { id: impression.id },
        data: { rewardCredited: true, rewardAmount },
      });
    }

    await db.adUserPreference.upsert({
      where: { userId },
      create: {
        userId,
        adsEnabled: true,
        rewardedAdsEnabled: !prefs.isFreePlan,
        totalAdsViewed: 1,
        totalCreditsEarned: rewardAmount,
        lastAdViewedAt: new Date(),
      },
      update: {
        totalAdsViewed: { increment: 1 },
        totalCreditsEarned: { increment: rewardAmount },
        lastAdViewedAt: new Date(),
      },
    });

    campaignsCache.timestamp = 0;
    log.info('ad_impression', {
      userId: userId.slice(0, 8),
      campaignId: campaignId.slice(0, 8),
      adType,
      rewarded: isRewarded,
      reward: rewardAmount,
    });

    return {
      impressionId: impression.id,
      campaignId,
      adType,
      rewardCredited: isRewarded,
      rewardAmount,
    };
  }

  /**
   * Record a click on a previously-recorded impression.
   * Credits the user with rewardPerClick when the impression was rewarded.
   */
  async recordClick(impressionId: string): Promise<{
    rewardCredited: boolean;
    rewardAmount: number;
    redirectUrl: string;
  }> {
    const impression = await db.adImpression.findUnique({ where: { id: impressionId } });
    if (!impression) throw new Error('IMPRESSION_NOT_FOUND');
    const campaign = await db.adCampaign.findUnique({ where: { id: impression.campaignId } });
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');

    // Vérifier que l'impression n'a pas déjà été cliquée
    if (impression.wasClicked) {
      throw new Error('IMPRESSION_ALREADY_CLICKED');
    }

    // --- Anti-abuse check (server-side, DB-backed) ---
    const abuseCheck = await checkClickAllowed(impression.userId as string, impressionId);
    if (!abuseCheck.allowed) {
      log.warn('click_blocked', {
        userId: (impression.userId as string).slice(0, 8),
        reason: abuseCheck.reason,
        fraudScore: abuseCheck.fraudScore,
      });
      throw new Error(`CLICK_BLOCKED:${abuseCheck.reason}`);
    }

    const prefs = await this.getUserAdPreferences(impression.userId as string);
    const isRewarded = impression.adType === 'rewarded' && prefs.rewardedAdsEnabled && !prefs.isFreePlan;
    const rewardAmount = isRewarded ? Number(campaign.rewardPerClick ?? 0) : 0;

    // --- Atomic budget check + increment ---
    const clickCost = Number(campaign.costPerClick ?? 0);
    const budgetOk = await atomicBudgetIncrement(impression.campaignId, clickCost);
    if (!budgetOk) {
      throw new Error('CAMPAIGN_BUDGET_EXHAUSTED');
    }

    await db.adImpression.update({
      where: { id: impressionId },
      data: {
        wasClicked: true,
        clickedAt: new Date(),
        rewardCredited: isRewarded && rewardAmount > 0,
        rewardAmount: isRewarded ? rewardAmount : 0,
      },
    });

    if (isRewarded && rewardAmount > 0) {
      await this.creditReward(impression.userId as string, rewardAmount, impressionId);
    }

    await db.adUserPreference.upsert({
      where: { userId: impression.userId as string },
      create: { userId: impression.userId as string, totalAdsClicked: 1 },
      update: { totalAdsClicked: { increment: 1 } },
    });

    log.info('ad_click', {
      impressionId: impressionId.slice(0, 8),
      rewarded: isRewarded,
      reward: rewardAmount,
    });

    return {
      rewardCredited: isRewarded,
      rewardAmount,
      redirectUrl: String(campaign.ctaUrl ?? ''),
    };
  }

  private async creditReward(userId: string, amount: number, impressionId: string): Promise<void> {
    try {
      await creditEngine.creditUser(userId, amount, 'Récompense publicitaire', {
        source: 'ad_reward',
        impressionId,
      });
    } catch (err) {
      log.warn('credit_reward_failed', { userId: userId.slice(0, 8), err: String(err) });
    }
  }

  /**
   * Create a new campaign (admin only — enforced by route guard).
   * Link-only: image/video fields are rejected.
   */
  async createCampaign(data: {
    name: string;
    description?: string;
    advertiserName: string;
    advertiserUrl: string;
    textContent?: string;
    ctaText?: string;
    ctaUrl: string;
    rewardPerView?: number;
    rewardPerClick?: number;
    costPerView?: number;
    costPerClick?: number;
    budgetTotal?: number;
    startAt?: string | null;
    endAt?: string | null;
    placement?: AdPlacement;
    targetKeywords?: string | null;
    frequencyCap?: number | null;
    targetPlan?: 'all' | 'free' | 'paid';
  }): Promise<AdCampaign> {
    if (!data.name || !data.advertiserName || !data.ctaUrl) {
      throw new Error('MISSING_REQUIRED_FIELDS');
    }

    const campaign = await db.adCampaign.create({
      data: {
        name: data.name,
        description: data.description || '',
        advertiserName: data.advertiserName,
        advertiserUrl: data.advertiserUrl,
        textContent: data.textContent || '',
        ctaText: data.ctaText || 'En savoir plus',
        ctaUrl: data.ctaUrl,
        rewardPerView: data.rewardPerView ?? 1,
        rewardPerClick: data.rewardPerClick ?? 2,
        costPerView: data.costPerView ?? 0,
        costPerClick: data.costPerClick ?? 0,
        budgetTotal: data.budgetTotal ?? 0,
        startAt: data.startAt ? new Date(data.startAt) : null,
        endAt: data.endAt ? new Date(data.endAt) : null,
        placement: data.placement || 'conversation_inline',
        targetKeywords: data.targetKeywords || null,
        frequencyCap: data.frequencyCap || null,
        targetPlan: data.targetPlan || 'all',
        status: 'pending',
        isActive: true,
      },
    });
    campaignsCache.timestamp = 0;
    return campaign as unknown as AdCampaign;
  }

  async setCampaignStatus(campaignId: string, status: CampaignStatus): Promise<void> {
    await db.adCampaign.update({
      where: { id: campaignId },
      data: { status, isActive: status === 'active' },
    });
    campaignsCache.timestamp = 0;
  }

  async getCampaignStats(campaignId: string): Promise<{
    campaignId: string;
    impressions: number;
    clicks: number;
    clickRate: number;
    budgetSpent: number;
    budgetTotal: number;
  }> {
    const [impressions, clicks, campaign] = await Promise.all([
      db.adImpression.count({ where: { campaignId } }),
      db.adImpression.count({ where: { campaignId, wasClicked: true } }),
      db.adCampaign.findUnique({ where: { id: campaignId } }),
    ]);
    return {
      campaignId,
      impressions,
      clicks,
      clickRate: impressions > 0 ? (clicks / impressions) * 100 : 0,
      budgetSpent: Number(campaign?.budgetSpent ?? 0),
      budgetTotal: Number(campaign?.budgetTotal ?? 0),
    };
  }

  async getUserAdStats(userId: string): Promise<{
    adsViewed: number;
    adsClicked: number;
    creditsEarned: number;
    isEligible: boolean;
    mustShowInConversation: boolean;
    canDisableAds: boolean;
    isFreePlan: boolean;
    rewardedEnabled: boolean;
    adsEnabled: boolean;
    plan: PlanTier;
  }> {
    const prefs = await this.getUserAdPreferences(userId);
    return {
      adsViewed: prefs.totalAdsViewed,
      adsClicked: prefs.totalAdsClicked,
      creditsEarned: prefs.totalCreditsEarned,
      isEligible: prefs.isEligible,
      mustShowInConversation: prefs.mustShowInConversation,
      canDisableAds: prefs.canDisableAds,
      isFreePlan: prefs.isFreePlan,
      rewardedEnabled: prefs.rewardedAdsEnabled,
      adsEnabled: prefs.adsEnabled,
      plan: prefs.plan,
    };
  }
}

// ------------------------------------------------------------
// Singleton
// ------------------------------------------------------------

let instance: AdEngine | null = null;
export function getAdEngine(): AdEngine {
  if (!instance) instance = new AdEngine();
  return instance;
}
