import { db } from '@/lib/db';
import { getCreditEngine } from '@/lib/billing/credit-engine';
import { createLogger } from '@/lib/logger';

const log = createLogger('ad-engine');
const creditEngine = getCreditEngine();

export type AdType = 'unrewarded' | 'rewarded';
export type CampaignStatus = 'pending' | 'active' | 'paused' | 'completed' | 'cancelled';
export type AdPlacement = 'bottom_bar' | 'modal' | 'inline' | 'sidebar' | 'banner_top' | 'sponsored_message' | 'conversation_inline';
export type AdFormat = 'banner' | 'video' | 'native' | 'carousel' | 'interstitial' | 'sponsored_link' | 'subtle_banner';

export interface AdCampaign {
  id: string; name: string; description: string;
  advertiserName: string; advertiserUrl: string;
  imageUrl: string; videoUrl?: string;
  textContent: string; ctaText: string; ctaUrl: string;
  targetAudience: string; targetPlan: string;
  maxImpressions: number; maxClicks: number;
  rewardPerView: number; rewardPerClick: number;
  costPerView: number; costPerClick: number;
  budgetTotal: number; budgetSpent: number;
  status: CampaignStatus; startAt: Date | null; endAt: Date | null;
  isActive: boolean;
  format: AdFormat; placement: AdPlacement;
  abTestGroup?: string; abTestVariant?: string;
  targetKeywords?: string;
  frequencyCap?: number;
}

export interface AdServingDecision {
  shouldShow: boolean; adType: AdType;
  campaign: AdCampaign | null; reason: string;
  placement?: AdPlacement; format?: AdFormat;
  abTestVariant?: string;
  /** Pour conversation_inline : position dans le flux de messages */
  insertAfterMessages?: number;
  /** Style non-intrusif pour ne pas interrompre la conversation */
  isSubtle?: boolean;
}

export interface AdImpressionResult {
  impressionId: string; campaignId: string;
  adType: AdType; rewardCredited: boolean; rewardAmount: number;
}

export interface AdUserPreferences {
  adsEnabled: boolean; rewardedAdsEnabled: boolean;
  totalCreditsEarned: number; totalAdsViewed: number;
  totalAdsClicked: number; isEligible: boolean;
  adType: AdType; optedOutCategories: string[];
  /** Plan free = pubs non-intrusives obligatoires dans les conversations */
  mustShowInConversation: boolean;
}

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
setInterval(cleanupRecentImpressions, 300000);

export class AdEngine {
  async getUserAdPreferences(userId: string): Promise<AdUserPreferences> {
    const prefs = await db.adUserPreference.upsert({
      where: { userId },
      create: { userId, adsEnabled: true, rewardedAdsEnabled: false },
      update: {},
    });
    const user = await db.user.findUnique({ where: { id: userId }, select: { plan: true } });
    const isFreePlan = user?.plan === 'free';
    return {
      adsEnabled: prefs.adsEnabled,
      rewardedAdsEnabled: prefs.rewardedAdsEnabled,
      totalCreditsEarned: prefs.totalCreditsEarned,
      totalAdsViewed: prefs.totalAdsViewed,
      totalAdsClicked: prefs.totalAdsClicked,
      isEligible: isFreePlan || prefs.rewardedAdsEnabled,
      adType: isFreePlan ? 'unrewarded' : prefs.rewardedAdsEnabled ? 'rewarded' : 'unrewarded',
      optedOutCategories: [],
      mustShowInConversation: isFreePlan, // Plan free = pubs conversation obligatoires
    };
  }

  async setRewardedAdsEnabled(userId: string, enabled: boolean): Promise<void> {
    const user = await db.user.findUnique({ where: { id: userId }, select: { plan: true } });
    if (user?.plan === 'free' && enabled) throw new Error('Les utilisateurs free ne peuvent pas desactiver les pubs');
    await db.adUserPreference.upsert({
      where: { userId },
      create: { userId, adsEnabled: true, rewardedAdsEnabled: enabled },
      update: { rewardedAdsEnabled: enabled, adsEnabled: true },
    });
    log.info('Rewarded ads updated', { userId: userId.slice(0, 8), enabled });
  }

  async getActiveCampaigns(): Promise<AdCampaign[]> {
    const now = Date.now();
    if (campaignsCache.timestamp > 0 && now - campaignsCache.timestamp < CAMPAIGN_CACHE_TTL) {
      return campaignsCache.campaigns;
    }
    const campaigns = await db.adCampaign.findMany({
      where: { isActive: true, status: 'active', OR: [{ startAt: null }, { startAt: { lte: new Date() } }], AND: [{ OR: [{ endAt: null }, { endAt: { gte: new Date() } }] }] },
      orderBy: { createdAt: 'desc' },
    });
    const active = campaigns.filter(c => (c.budgetTotal === 0 || c.budgetSpent < c.budgetTotal) && (c.maxImpressions === 0 || c.maxImpressions > 0));
    campaignsCache = { timestamp: now, campaigns: active as unknown as AdCampaign[] };
    return active as unknown as AdCampaign[];
  }

  async decideAd(
    userId: string,
    sessionId: string,
    conversationId?: string,
    context?: { keywords?: string[]; placement?: AdPlacement; conversationTopic?: string; messageCount?: number }
  ): Promise<AdServingDecision> {
    const prefs = await this.getUserAdPreferences(userId);
    const campaigns = await this.getActiveCampaigns();

    // Si plan free et placement conversation, toujours montrer une pub
    if (prefs.mustShowInConversation && context?.placement === 'conversation_inline') {
      const convCampaigns = campaigns.filter(c => c.placement === 'conversation_inline' || c.placement === 'inline');
      if (convCampaigns.length === 0 && campaigns.length === 0) {
        return { shouldShow: false, adType: 'unrewarded', campaign: null, reason: 'Aucune campagne conversation', isSubtle: true };
      }
      const candidates = convCampaigns.length > 0 ? convCampaigns : campaigns;
      const selected = this.selectCampaignForUser(candidates, userId, prefs, context);
      if (!selected) {
        return { shouldShow: false, adType: 'unrewarded', campaign: null, reason: 'Aucune campagne correspondante' };
      }
      return {
        shouldShow: true,
        adType: 'unrewarded',
        campaign: selected,
        reason: 'Pub conversation (plan free)',
        placement: 'conversation_inline',
        format: 'subtle_banner',
        isSubtle: true,
        // Inserer apres 3 messages ou au milieu de la conversation
        insertAfterMessages: context?.messageCount ? Math.min(context.messageCount, Math.max(2, Math.floor(context.messageCount / 2))) : 3,
      };
    }

    if (!prefs.isEligible || campaigns.length === 0) {
      return { shouldShow: false, adType: prefs.adType, campaign: null, reason: 'Non eligible ou aucune campagne' };
    }

    let candidates = campaigns;
    if (context?.placement) {
      const byPlacement = campaigns.filter(c => c.placement === context.placement);
      if (byPlacement.length > 0) candidates = byPlacement;
    }

    if (context?.keywords && context.keywords.length > 0) {
      const keywordsLower = context.keywords.map(k => k.toLowerCase());
      const byKeywords = candidates.filter(c => {
        if (!c.targetKeywords) return true;
        const targets = c.targetKeywords.toLowerCase().split(',').map(t => t.trim());
        return keywordsLower.some(k => targets.some(t => k.includes(t) || t.includes(k)));
      });
      if (byKeywords.length > 0) candidates = byKeywords;
    }

    const userKey = `${userId}:${sessionId}`;
    const userImpressions = recentImpressions.get(userKey) || [];
    const recentCount = userImpressions.filter(t => t > Date.now() - 3600000).length;
    candidates = candidates.filter(c => !c.frequencyCap || recentCount < c.frequencyCap);

    const selected = this.selectCampaignForUser(candidates, userId, prefs, context);
    if (!selected) {
      return { shouldShow: false, adType: prefs.adType, campaign: null, reason: 'Aucune campagne correspondante' };
    }

    return {
      shouldShow: true, adType: prefs.adType, campaign: selected,
      reason: prefs.adType === 'rewarded' ? 'Pub recompensee' : 'Pub gratuite',
      placement: selected.placement, format: selected.format,
      abTestVariant: selected.abTestVariant,
      isSubtle: selected.placement === 'conversation_inline' || selected.format === 'native',
    };
  }

  private selectCampaignForUser(
    campaigns: AdCampaign[], userId: string,
    prefs: AdUserPreferences,
    context?: { keywords?: string[]; conversationTopic?: string }
  ): AdCampaign | null {
    const scored = campaigns.map(c => {
      let score = 0;
      if (c.targetPlan === 'all') score += 10;
      if (c.targetPlan === 'free' && prefs.adType === 'unrewarded') score += 20;
      if (c.targetPlan === 'premium' && prefs.adType === 'rewarded') score += 15;
      if (c.budgetTotal > 0) {
        score += ((c.budgetTotal - c.budgetSpent) / c.budgetTotal) * 10;
      }
      if (prefs.adType === 'rewarded' && c.rewardPerView > 0) score += c.rewardPerView * 100;
      if (context?.keywords && c.targetKeywords) {
        const kwLower = context.keywords.map(k => k.toLowerCase());
        const targets = c.targetKeywords.toLowerCase().split(',').map(t => t.trim());
        const matchCount = kwLower.filter(k => targets.some(t => k.includes(t) || t.includes(k))).length;
        score += matchCount * 25;
      }
      if (context?.conversationTopic && c.description.toLowerCase().includes(context.conversationTopic.toLowerCase())) {
        score += 30;
      }
      if (c.format === 'video') score += 5;
      if (c.abTestGroup) score += Math.random() * 8;
      score += Math.random() * 5;
      return { campaign: c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    if (scored.length === 0) return null;
    const selected = scored[0].campaign;
    const userKey = `${userId}:session`;
    const imps = recentImpressions.get(userKey) || [];
    imps.push(Date.now());
    recentImpressions.set(userKey, imps.slice(-50));
    return selected;
  }

  async recordImpression(userId: string, campaignId: string, adType: AdType, sessionId: string, conversationId?: string): Promise<AdImpressionResult> {
    const campaign = await db.adCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campagne introuvable');
    const isRewarded = adType === 'rewarded';
    const rewardAmount = isRewarded ? campaign.rewardPerView : 0;
    const impression = await db.adImpression.create({
      data: { campaignId, userId, sessionId, conversationId: conversationId || null, adType, viewDurationMs: 0, wasClicked: false, rewardCredited: false, rewardAmount: 0 },
    });
    if (isRewarded && rewardAmount > 0) await this.creditReward(userId, rewardAmount, impression.id);
    const costIncrement = isRewarded ? campaign.costPerView : campaign.costPerView * 0.5;
    await db.adCampaign.update({ where: { id: campaignId }, data: { budgetSpent: { increment: costIncrement } } });
    await db.adUserPreference.upsert({
      where: { userId },
      create: { userId, totalAdsViewed: 1, totalCreditsEarned: rewardAmount, lastAdViewedAt: new Date() },
      update: { totalAdsViewed: { increment: 1 }, totalCreditsEarned: { increment: rewardAmount }, lastAdViewedAt: new Date() },
    });
    campaignsCache.timestamp = 0;
    log.info('Ad impression', { userId: userId.slice(0, 8), campaignId: campaignId.slice(0, 8), adType, reward: rewardAmount });
    return { impressionId: impression.id, campaignId, adType, rewardCredited: isRewarded, rewardAmount };
  }

  async recordClick(impressionId: string): Promise<{ rewardCredited: boolean; rewardAmount: number; redirectUrl: string }> {
    const impression = await db.adImpression.findUnique({ where: { id: impressionId }, include: { campaign: true } });
    if (!impression) throw new Error('Impression introuvable');
    const isRewarded = impression.adType === 'rewarded';
    const rewardAmount = isRewarded ? impression.campaign.rewardPerClick : 0;
    await db.adImpression.update({
      where: { id: impressionId },
      data: { wasClicked: true, clickedAt: new Date(), rewardCredited: isRewarded && rewardAmount > 0, rewardAmount: isRewarded ? rewardAmount : 0 },
    });
    if (isRewarded && rewardAmount > 0) await this.creditReward(impression.userId, rewardAmount, impressionId);
    await db.adCampaign.update({ where: { id: impression.campaignId }, data: { budgetSpent: { increment: impression.campaign.costPerClick } } });
    await db.adUserPreference.upsert({
      where: { userId: impression.userId },
      create: { userId: impression.userId, totalAdsClicked: 1 },
      update: { totalAdsClicked: { increment: 1 } },
    });
    log.info('Ad click', { impressionId: impressionId.slice(0, 8), rewarded: isRewarded, reward: rewardAmount });
    return { rewardCredited: isRewarded, rewardAmount, redirectUrl: impression.campaign.ctaUrl };
  }

  private async creditReward(userId: string, amount: number, impressionId: string): Promise<void> {
    try { await creditEngine.creditUser(userId, amount, 'Recompense publicitaire', { source: 'ad_reward', impressionId }); } catch {}
  }

  async createCampaign(data: any): Promise<AdCampaign> {
    const campaign = await db.adCampaign.create({
      data: {
        name: data.name, description: data.description || '', advertiserName: data.advertiserName,
        advertiserUrl: data.advertiserUrl, imageUrl: data.imageUrl || '', videoUrl: data.videoUrl || null,
        textContent: data.textContent || '', ctaText: data.ctaText || 'En savoir plus', ctaUrl: data.ctaUrl,
        rewardPerView: data.rewardPerView || 0, rewardPerClick: data.rewardPerClick || 0,
        budgetTotal: data.budgetTotal || 0, startAt: data.startAt ? new Date(data.startAt) : null, endAt: data.endAt ? new Date(data.endAt) : null,
        format: data.format || 'banner', placement: data.placement || 'bottom_bar',
        targetKeywords: data.targetKeywords || null, frequencyCap: data.frequencyCap || null,
        targetPlan: data.targetPlan || 'all',
        status: 'pending', isActive: true,
      },
    });
    campaignsCache.timestamp = 0;
    return campaign as unknown as AdCampaign;
  }

  async createABTestCampaign(base: AdCampaign, variants: Partial<AdCampaign>[]): Promise<AdCampaign[]> {
    const groupId = `ab_${Date.now()}`;
    const created: AdCampaign[] = [];
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const variant = await db.adCampaign.create({
        data: {
          name: `${base.name} (Var ${String.fromCharCode(65 + i)})`, description: base.description,
          advertiserName: base.advertiserName, advertiserUrl: base.advertiserUrl,
          imageUrl: v.imageUrl || base.imageUrl, textContent: v.textContent || base.textContent,
          ctaText: v.ctaText || base.ctaText, ctaUrl: v.ctaUrl || base.ctaUrl,
          rewardPerView: base.rewardPerView, rewardPerClick: base.rewardPerClick,
          budgetTotal: base.budgetTotal / variants.length, format: base.format,
          placement: base.placement, targetKeywords: base.targetKeywords,
          abTestGroup: groupId, abTestVariant: String.fromCharCode(65 + i),
          status: 'active', isActive: true,
        },
      });
      created.push(variant as unknown as AdCampaign);
    }
    campaignsCache.timestamp = 0;
    return created;
  }

  async getABTestResults(groupId: string): Promise<{ variant: string; impressions: number; clicks: number; clickRate: number }[]> {
    const campaigns = await db.adCampaign.findMany({ where: { abTestGroup: groupId } });
    const results = [];
    for (const c of campaigns) {
      const impressions = await db.adImpression.count({ where: { campaignId: c.id } });
      const clicks = await db.adImpression.count({ where: { campaignId: c.id, wasClicked: true } });
      results.push({ variant: c.abTestVariant || 'A', impressions, clicks, clickRate: impressions > 0 ? (clicks / impressions) * 100 : 0 });
    }
    return results;
  }

  async setCampaignStatus(campaignId: string, status: CampaignStatus): Promise<void> {
    await db.adCampaign.update({ where: { id: campaignId }, data: { status, isActive: status === 'active' } });
    campaignsCache.timestamp = 0;
  }

  async getCampaignStats(campaignId: string) {
    const [impressions, clicks, campaign] = await Promise.all([
      db.adImpression.count({ where: { campaignId } }),
      db.adImpression.count({ where: { campaignId, wasClicked: true } }),
      db.adCampaign.findUnique({ where: { id: campaignId } }),
    ]);
    return { campaignId, impressions, clicks, clickRate: impressions > 0 ? (clicks / impressions) * 100 : 0, budgetSpent: campaign?.budgetSpent || 0, budgetTotal: campaign?.budgetTotal || 0 };
  }

  async getUserAdStats(userId: string) {
    const prefs = await db.adUserPreference.findUnique({ where: { userId } });
    if (!prefs) return { adsViewed: 0, adsClicked: 0, creditsEarned: 0, isEligible: true, mustShowInConversation: true };
    const user = await db.user.findUnique({ where: { id: userId }, select: { plan: true } });
    return { adsViewed: prefs.totalAdsViewed, adsClicked: prefs.totalAdsClicked, creditsEarned: prefs.totalCreditsEarned, rewardedEnabled: prefs.rewardedAdsEnabled, isEligible: user?.plan === 'free' || prefs.rewardedAdsEnabled, mustShowInConversation: user?.plan === 'free' };
  }
}

let instance: AdEngine | null = null;
export function getAdEngine(): AdEngine {
  if (!instance) instance = new AdEngine();
  return instance;
}
