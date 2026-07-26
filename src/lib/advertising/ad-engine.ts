// ============================================================
// AD ENGINE — Moteur publicitaire pour les conversations
// Gère l'affichage des pubs, le ciblage, les récompenses
// et la rotation des campagnes
// ============================================================

import { db } from '@/lib/db';
import { getCreditEngine } from '@/lib/billing/credit-engine';
import { createLogger } from '@/lib/logger';

const log = createLogger('ad-engine');
const creditEngine = getCreditEngine();

// ============================================================
// Types
// ============================================================

export type AdType = 'unrewarded' | 'rewarded';
export type CampaignStatus = 'pending' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface AdCampaign {
  id: string;
  name: string;
  description: string;
  advertiserName: string;
  advertiserUrl: string;
  imageUrl: string;
  textContent: string;
  ctaText: string;
  ctaUrl: string;
  targetAudience: string;
  targetPlan: string;
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
}

export interface AdServingDecision {
  shouldShow: boolean;
  adType: AdType;
  campaign: AdCampaign | null;
  reason: string;
}

export interface AdImpressionResult {
  impressionId: string;
  campaignId: string;
  adType: AdType;
  rewardCredited: boolean;
  rewardAmount: number;
}

export interface AdClickResult {
  impressionId: string;
  rewardCredited: boolean;
  rewardAmount: number;
  redirectUrl: string;
}

export interface AdUserPreferences {
  adsEnabled: boolean;
  rewardedAdsEnabled: boolean;
  totalCreditsEarned: number;
  totalAdsViewed: number;
  totalAdsClicked: number;
  isEligible: boolean;
  adType: AdType;
}

const CAMPAIGN_CACHE_TTL = 60_000; // 1 minute
let campaignsCache: { timestamp: number; campaigns: AdCampaign[] } = {
  timestamp: 0,
  campaigns: [],
};

// ============================================================
// Ad Engine
// ============================================================

export class AdEngine {
  /**
   * Récupère les préférences publicitaires d'un utilisateur
   */
  async getUserAdPreferences(userId: string): Promise<AdUserPreferences> {
    // Créer les préférences par défaut si elles n'existent pas
    const prefs = await db.adUserPreference.upsert({
      where: { userId },
      create: {
        userId,
        adsEnabled: true,
        rewardedAdsEnabled: false,
        totalCreditsEarned: 0,
        totalAdsViewed: 0,
        totalAdsClicked: 0,
      },
      update: {},
    });

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    const isFreePlan = user?.plan === 'free';

    return {
      adsEnabled: prefs.adsEnabled,
      rewardedAdsEnabled: prefs.rewardedAdsEnabled,
      totalCreditsEarned: prefs.totalCreditsEarned,
      totalAdsViewed: prefs.totalAdsViewed,
      totalAdsClicked: prefs.totalAdsClicked,
      isEligible: isFreePlan || prefs.rewardedAdsEnabled,
      adType: isFreePlan ? 'unrewarded'
        : prefs.rewardedAdsEnabled ? 'rewarded'
        : 'unrewarded',
    };
  }

  /**
   * Active ou désactive les pubs récompensées pour les utilisateurs payants
   */
  async setRewardedAdsEnabled(userId: string, enabled: boolean): Promise<void> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    if (user?.plan === 'free' && enabled) {
      throw new Error('Les utilisateurs du plan free ne peuvent pas désactiver les pubs');
    }

    await db.adUserPreference.upsert({
      where: { userId },
      create: {
        userId,
        adsEnabled: true,
        rewardedAdsEnabled: enabled,
      },
      update: {
        rewardedAdsEnabled: enabled,
        adsEnabled: true,
      },
    });

    log.info('Rewarded ads preference updated', {
      userId: userId.slice(0, 8),
      enabled,
    });
  }

  /**
   * Récupère les campagnes actives et éligibles
   */
  async getActiveCampaigns(): Promise<AdCampaign[]> {
    const now = Date.now();

    // Cache
    if (campaignsCache.timestamp > 0 && now - campaignsCache.timestamp < CAMPAIGN_CACHE_TTL) {
      return campaignsCache.campaigns;
    }

    const campaigns = await db.adCampaign.findMany({
      where: {
        isActive: true,
        status: 'active',
        OR: [
          { startAt: null },
          { startAt: { lte: new Date() } },
        ],
        AND: [
          {
            OR: [
              { endAt: null },
              { endAt: { gte: new Date() } },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filtrer les campagnes avec budget
    const active = campaigns.filter(c =>
      (c.budgetTotal === 0 || c.budgetSpent < c.budgetTotal) &&
      (c.maxImpressions === 0 || c.maxImpressions > 0)
    );

    campaignsCache = {
      timestamp: now,
      campaigns: active as unknown as AdCampaign[],
    };

    return active as unknown as AdCampaign[];
  }

  /**
   * Décide si une pub doit être affichée et laquelle
   */
  async decideAd(
    userId: string,
    sessionId: string,
    conversationId?: string
  ): Promise<AdServingDecision> {
    const prefs = await this.getUserAdPreferences(userId);
    const campaigns = await this.getActiveCampaigns();

    if (!prefs.isEligible || campaigns.length === 0) {
      return {
        shouldShow: false,
        adType: prefs.adType,
        campaign: null,
        reason: !prefs.isEligible ? 'Utilisateur non éligible' : 'Aucune campagne active',
      };
    }

    // Cibler la meilleure campagne selon l'utilisateur
    const selectedCampaign = this.selectCampaignForUser(campaigns, userId, prefs);

    if (!selectedCampaign) {
      return {
        shouldShow: false,
        adType: prefs.adType,
        campaign: null,
        reason: 'Aucune campagne correspondante',
      };
    }

    return {
      shouldShow: true,
      adType: prefs.adType,
      campaign: selectedCampaign,
      reason: prefs.adType === 'rewarded' ? 'Pub récompensée' : 'Pub gratuite (plan free)',
    };
  }

  /**
   * Sélectionne la meilleure campagne pour un utilisateur
   */
  private selectCampaignForUser(
    campaigns: AdCampaign[],
    userId: string,
    prefs: AdUserPreferences
  ): AdCampaign | null {
    // Filtrer d'abord les campagnes déjà vues par l'utilisateur dans la session
    // Priorité aux campagnes avec le meilleur taux de récompense
    const scored = campaigns.map(c => {
      let score = 0;

      // Ciblage par plan
      if (c.targetPlan === 'all') score += 10;
      if (c.targetPlan === 'free' && prefs.adType === 'unrewarded') score += 20;
      if (c.targetPlan === 'premium' && prefs.adType === 'rewarded') score += 15;

      // Budget restant favorisé
      if (c.budgetTotal > 0) {
        const remaining = c.budgetTotal - c.budgetSpent;
        const ratio = remaining / c.budgetTotal;
        score += ratio * 10;
      }

      // Récompense plus élevée = plus de chances pour les rewarded
      if (prefs.adType === 'rewarded' && c.rewardPerView > 0) {
        score += c.rewardPerView * 100;
      }

      // Rotation aléatoire
      score += Math.random() * 5;

      return { campaign: c, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.length > 0 ? scored[0].campaign : null;
  }

  /**
   * Enregistre une impression (vue) de publicité
   */
  async recordImpression(
    userId: string,
    campaignId: string,
    adType: AdType,
    sessionId: string,
    conversationId?: string
  ): Promise<AdImpressionResult> {
    const campaign = await db.adCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new Error('Campagne introuvable');
    }

    const isRewarded = adType === 'rewarded';
    const rewardAmount = isRewarded ? campaign.rewardPerView : 0;

    // Créer l'impression
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

    // Créditer la récompense si pub récompensée
    if (isRewarded && rewardAmount > 0) {
      await this.creditReward(userId, rewardAmount, impression.id);
    }

    // Mettre à jour le budget de la campagne
    const costIncrement = isRewarded ? campaign.costPerView : campaign.costPerView * 0.5;
    await db.adCampaign.update({
      where: { id: campaignId },
      data: {
        budgetSpent: { increment: costIncrement },
      },
    });

    // Mettre à jour les préférences utilisateur
    await db.adUserPreference.upsert({
      where: { userId },
      create: {
        userId,
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

    // Invalider le cache
    campaignsCache.timestamp = 0;

    log.info('Ad impression recorded', {
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
   * Enregistre un clic sur une publicité
   */
  async recordClick(impressionId: string): Promise<AdClickResult> {
    const impression = await db.adImpression.findUnique({
      where: { id: impressionId },
      include: { campaign: true },
    });

    if (!impression) {
      throw new Error('Impression introuvable');
    }

    const isRewarded = impression.adType === 'rewarded';
    const rewardAmount = isRewarded ? impression.campaign.rewardPerClick : 0;

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
      await this.creditReward(impression.userId, rewardAmount, impressionId);
    }

    // Mise à jour compteur clics campagne
    await db.adCampaign.update({
      where: { id: impression.campaignId },
      data: {
        budgetSpent: { increment: impression.campaign.costPerClick },
      },
    });

    // Compteur utilisateur
    await db.adUserPreference.upsert({
      where: { userId: impression.userId },
      create: { userId: impression.userId, totalAdsClicked: 1 },
      update: { totalAdsClicked: { increment: 1 } },
    });

    log.info('Ad click recorded', {
      impressionId: impressionId.slice(0, 8),
      userId: impression.userId.slice(0, 8),
      rewarded: isRewarded,
      reward: rewardAmount,
    });

    return {
      impressionId,
      rewardCredited: isRewarded,
      rewardAmount,
      redirectUrl: impression.campaign.ctaUrl,
    };
  }

  /**
   * Crédite la récompense sur le compte de l'utilisateur
   */
  private async creditReward(userId: string, amount: number, impressionId: string): Promise<void> {
    await creditEngine.creditUser(userId, amount,
      `Récompense publicitaire #${impressionId.slice(0, 8)}`,
      { source: 'ad_reward', impressionId }
    );
  }

  /**
   * Récupère les statistiques des campagnes
   */
  async getCampaignStats(campaignId: string) {
    const [impressions, clicks, campaign] = await Promise.all([
      db.adImpression.count({
        where: { campaignId },
      }),
      db.adImpression.count({
        where: { campaignId, wasClicked: true },
      }),
      db.adCampaign.findUnique({ where: { id: campaignId } }),
    ]);

    return {
      campaignId,
      impressions,
      clicks,
      clickRate: impressions > 0 ? (clicks / impressions) * 100 : 0,
      budgetSpent: campaign?.budgetSpent || 0,
      budgetTotal: campaign?.budgetTotal || 0,
    };
  }

  /**
   * Récupère les statistiques d'un utilisateur
   */
  async getUserAdStats(userId: string) {
    const prefs = await db.adUserPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      return {
        adsViewed: 0,
        adsClicked: 0,
        creditsEarned: 0,
        isEligible: true,
      };
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    return {
      adsViewed: prefs.totalAdsViewed,
      adsClicked: prefs.totalAdsClicked,
      creditsEarned: prefs.totalCreditsEarned,
      rewardedEnabled: prefs.rewardedAdsEnabled,
      isEligible: user?.plan === 'free' || prefs.rewardedAdsEnabled,
    };
  }

  /**
   * Crée une nouvelle campagne publicitaire
   */
  async createCampaign(data: {
    name: string;
    description: string;
    advertiserName: string;
    advertiserUrl: string;
    imageUrl: string;
    textContent: string;
    ctaText: string;
    ctaUrl: string;
    rewardPerView?: number;
    rewardPerClick?: number;
    budgetTotal?: number;
    startAt?: Date;
    endAt?: Date;
  }): Promise<AdCampaign> {
    const campaign = await db.adCampaign.create({
      data: {
        name: data.name,
        description: data.description,
        advertiserName: data.advertiserName,
        advertiserUrl: data.advertiserUrl,
        imageUrl: data.imageUrl,
        textContent: data.textContent,
        ctaText: data.ctaText || 'En savoir plus',
        ctaUrl: data.ctaUrl,
        rewardPerView: data.rewardPerView || 0,
        rewardPerClick: data.rewardPerClick || 0,
        budgetTotal: data.budgetTotal || 0,
        startAt: data.startAt || null,
        endAt: data.endAt || null,
        status: 'pending',
        isActive: true,
      },
    });

    campaignsCache.timestamp = 0;
    return campaign as unknown as AdCampaign;
  }

  /**
   * Active ou désactive une campagne
   */
  async setCampaignStatus(campaignId: string, status: CampaignStatus): Promise<void> {
    await db.adCampaign.update({
      where: { id: campaignId },
      data: {
        status,
        isActive: status === 'active',
      },
    });
    campaignsCache.timestamp = 0;
  }
}

// ============================================================
// Singleton
// ============================================================

let instance: AdEngine | null = null;

export function getAdEngine(): AdEngine {
  if (!instance) {
    instance = new AdEngine();
  }
  return instance;
}
