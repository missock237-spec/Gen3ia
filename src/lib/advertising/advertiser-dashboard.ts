// ============================================================
// ADVERTISER DASHBOARD — Tableau de bord pour annonceurs
// Vue d'ensemble: campagnes, performances, budget, audience
// ============================================================

import { prisma } from '@/lib/prisma';
import { getAdEngine } from './ad-engine';

const adEngine = getAdEngine();

export interface DashboardOverview {
  totalCampaigns: number;
  activeCampaigns: number;
  pausedCampaigns: number;
  completedCampaigns: number;
  totalImpressions: number;
  totalClicks: number;
  averageCTR: number;
  totalBudget: number;
  totalSpent: number;
  budgetRemaining: number;
  totalReward: number;
  // Top performing campaigns
  topCampaigns: Array<{
    id: string;
    name: string;
    impressions: number;
    clicks: number;
    ctr: number;
    budgetSpent: number;
    budgetTotal: number;
    status: string;
  }>;
  // Performance par jour (7 derniers jours)
  dailyPerformance: Array<{
    date: string;
    impressions: number;
    clicks: number;
    spent: number;
  }>;
  // Performance par placement
  placementBreakdown: Array<{
    placement: string;
    impressions: number;
    clicks: number;
    ctr: number;
  }>;
  // A/B test results
  abTestResults: Array<{
    campaignId: string;
    campaignName: string;
    variants: Array<{ variantId: string; impressions: number; clicks: number; ctr: number }>;
  }>;
}

export class AdvertiserDashboard {
  /**
   * Vue d'ensemble complète du dashboard annonceur
   */
  async getOverview(): Promise<DashboardOverview> {
    const campaigns = await prisma.adCampaign.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const active = campaigns.filter((c: any) => c.status === 'active' && c.isActive);
    const paused = campaigns.filter((c: any) => c.status === 'paused' || !c.isActive);
    const completed = campaigns.filter((c: any) => c.status === 'completed' || c.status === 'expired');

    // Stats agrégées
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalBudget = 0;
    let totalSpent = 0;
    let totalReward = 0;

    const campaignStatsPromises = campaigns.map(async (c: any) => {
      const stats = await adEngine.getCampaignStats(c.id);
      totalImpressions += stats.impressions;
      totalClicks += stats.clicks;
      totalBudget += Number(c.budgetTotal);
      totalSpent += stats.budgetSpent;
      totalReward += Number(c.rewardPerView) + Number(c.rewardPerClick);
      return {
        id: c.id,
        name: c.name,
        impressions: stats.impressions,
        clicks: stats.clicks,
        ctr: stats.clickRate,
        budgetSpent: stats.budgetSpent,
        budgetTotal: stats.budgetTotal,
        status: c.status,
      };
    });

    const allStats = await Promise.all(campaignStatsPromises);
    const topCampaigns = allStats.sort((a, b) => b.clicks - a.clicks).slice(0, 5);

    // Performance quotidienne (7 derniers jours)
    const dailyPerformance = await this.getDailyPerformance();

    // Performance par placement
    const placementBreakdown = await this.getPlacementBreakdown();

    // A/B test results
    const abTestResults: DashboardOverview['abTestResults'] = [];
    for (const c of campaigns) {
      const variants = adEngine.getVariantStats(c.id);
      if (variants.length > 0) {
        abTestResults.push({
          campaignId: c.id,
          campaignName: (c as any).name,
          variants,
        });
      }
    }

    return {
      totalCampaigns: campaigns.length,
      activeCampaigns: active.length,
      pausedCampaigns: paused.length,
      completedCampaigns: completed.length,
      totalImpressions,
      totalClicks,
      averageCTR: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      totalBudget,
      totalSpent,
      budgetRemaining: Math.max(0, totalBudget - totalSpent),
      totalReward,
      topCampaigns,
      dailyPerformance,
      placementBreakdown,
      abTestResults,
    };
  }

  /**
   * Détail d'une campagne individuelle
   */
  async getCampaignDetail(campaignId: string) {
    const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error('Campagne non trouvée');

    const stats = await adEngine.getCampaignStats(campaignId);
    const variantStats = adEngine.getVariantStats(campaignId);

    // Impressions récentes (100 dernières)
    const recentImpressions = await prisma.adImpression.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Géographie
    const geoBreakdown: Record<string, number> = {};
    for (const imp of recentImpressions) {
      const country = (imp as any).country || 'unknown';
      geoBreakdown[country] = (geoBreakdown[country] || 0) + 1;
    }

    return {
      campaign: {
        id: campaign.id,
        name: (campaign as any).name,
        description: (campaign as any).description,
        status: (campaign as any).status,
        isActive: (campaign as any).isActive,
        budgetTotal: Number((campaign as any).budgetTotal),
        budgetSpent: stats.budgetSpent,
        budgetRemaining: Math.max(0, Number((campaign as any).budgetTotal) - stats.budgetSpent),
        maxImpressions: (campaign as any).maxImpressions,
        maxClicks: (campaign as any).maxClicks,
        startAt: (campaign as any).startAt,
        endAt: (campaign as any).endAt,
        placement: (campaign as any).placement,
        targetKeywords: (campaign as any).targetKeywords,
        targetCountries: (campaign as any).targetCountries,
        targetPlan: (campaign as any).targetPlan,
      },
      stats: {
        impressions: stats.impressions,
        clicks: stats.clicks,
        ctr: stats.clickRate,
        budgetSpent: stats.budgetSpent,
        budgetTotal: stats.budgetTotal,
        budgetUtilization: stats.budgetTotal > 0 ? (stats.budgetSpent / stats.budgetTotal) * 100 : 0,
      },
      variants: variantStats,
      geoBreakdown: Object.entries(geoBreakdown).map(([country, count]) => ({ country, impressions: count })),
      recentImpressions: recentImpressions.length,
    };
  }

  /**
   * Performance quotidienne sur 7 jours
   */
  private async getDailyPerformance(): Promise<Array<{ date: string; impressions: number; clicks: number; spent: number }>> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const impressions = await prisma.adImpression.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: 'asc' },
    });

    const dailyMap: Record<string, { impressions: number; clicks: number; spent: number }> = {};
    
    for (const imp of impressions) {
      const date = (imp as any).createdAt instanceof Date 
        ? (imp as any).createdAt.toISOString().split('T')[0]
        : new Date((imp as any).createdAt).toISOString().split('T')[0];
      
      if (!dailyMap[date]) dailyMap[date] = { impressions: 0, clicks: 0, spent: 0 };
      dailyMap[date].impressions++;
      if ((imp as any).wasClicked) dailyMap[date].clicks++;
      dailyMap[date].spent += Number((imp as any).cost || 0);
    }

    return Object.entries(dailyMap).map(([date, data]) => ({
      date,
      impressions: data.impressions,
      clicks: data.clicks,
      spent: Math.round(data.spent * 100) / 100,
    }));
  }

  /**
   * Performance par placement
   */
  private async getPlacementBreakdown(): Promise<Array<{ placement: string; impressions: number; clicks: number; ctr: number }>> {
    const impressions = await prisma.adImpression.findMany();
    
    const placementMap: Record<string, { impressions: number; clicks: number }> = {};
    for (const imp of impressions) {
      const placement = (imp as any).placement || 'unknown';
      if (!placementMap[placement]) placementMap[placement] = { impressions: 0, clicks: 0 };
      placementMap[placement].impressions++;
      if ((imp as any).wasClicked) placementMap[placement].clicks++;
    }

    return Object.entries(placementMap).map(([placement, data]) => ({
      placement,
      impressions: data.impressions,
      clicks: data.clicks,
      ctr: data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
    }));
  }
}

export const advertiserDashboard = new AdvertiserDashboard();
