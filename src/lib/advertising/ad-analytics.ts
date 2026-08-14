import { db } from '@/lib/db';

const log = { info: (...a: unknown[]) => console.log('[AdAnalytics]', ...a), error: (...a: unknown[]) => console.error('[AdAnalytics]', ...a) };

/**
 * Advanced Ad Analytics & Reporting System
 * - Real-time performance tracking
 * - Predictive ROI analysis
 * - Fraud detection
 * - User segmentation
 */

interface AdSegment {
  id: string;
  name: string;
  size: number;
  avgEngagement: number;
  avgRevenue: number;
  creditsEarned: number;
  conversionRate: number;
}

interface FraudAlert {
  type: 'suspicious_clicks' | 'bot_activity' | 'unusual_pattern';
  severity: 'low' | 'medium' | 'high';
  campaignId: string;
  reason: string;
  detectedAt: Date;
}

export class AdAnalytics {
  /**
   * Analyze user segments for better targeting
   */
  async analyzeUserSegments(): Promise<AdSegment[]> {
    try {
      const userPrefs = await db.adUserPreference.findMany();
      const segments: AdSegment[] = [];

      // Segment 1: High Engagers
      const highEngagers = userPrefs.filter(p => p.totalAdsClicked > 10);
      segments.push({
        id: 'high_engagers',
        name: 'High Engagers',
        size: highEngagers.length,
        avgEngagement: highEngagers.reduce((sum, p) => sum + (p.totalAdsClicked / Math.max(p.totalAdsViewed, 1)), 0) / highEngagers.length,
        avgRevenue: highEngagers.reduce((sum, p) => sum + p.totalCreditsEarned, 0) / highEngagers.length,
        creditsEarned: highEngagers.reduce((sum, p) => sum + p.totalCreditsEarned, 0),
        conversionRate: 0.35,
      });

      // Segment 2: Light Users
      const lightUsers = userPrefs.filter(p => p.totalAdsViewed > 0 && p.totalAdsViewed < 5);
      segments.push({
        id: 'light_users',
        name: 'Light Users',
        size: lightUsers.length,
        avgEngagement: lightUsers.length > 0 ? lightUsers.reduce((sum, p) => sum + (p.totalAdsClicked / Math.max(p.totalAdsViewed, 1)), 0) / lightUsers.length : 0,
        avgRevenue: lightUsers.length > 0 ? lightUsers.reduce((sum, p) => sum + p.totalCreditsEarned, 0) / lightUsers.length : 0,
        creditsEarned: lightUsers.reduce((sum, p) => sum + p.totalCreditsEarned, 0),
        conversionRate: 0.12,
      });

      // Segment 3: Non-Active
      const nonActive = userPrefs.filter(p => p.totalAdsViewed === 0);
      segments.push({
        id: 'non_active',
        name: 'Non-Active',
        size: nonActive.length,
        avgEngagement: 0,
        avgRevenue: 0,
        creditsEarned: 0,
        conversionRate: 0,
      });

      log.info('User segments analyzed', { segments: segments.length });
      return segments;
    } catch (err) {
      log.error('Segment analysis failed', err);
      return [];
    }
  }

  /**
   * Detect potential fraud patterns in ad clicks
   */
  async detectFraudPatterns(): Promise<FraudAlert[]> {
    const alerts: FraudAlert[] = [];

    try {
      const recentImpressions = await db.adImpression.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 3600000) } },
        include: { campaign: true },
      });

      const byUser = new Map<string, typeof recentImpressions>();
      for (const imp of recentImpressions) {
        const list = byUser.get(imp.userId) || [];
        list.push(imp);
        byUser.set(imp.userId, list);
      }

      // Check for suspicious click patterns
      for (const [userId, impressions] of byUser.entries()) {
        const clickCount = impressions.filter(i => i.wasClicked).length;
        const viewCount = impressions.length;
        const clickRate = clickCount / Math.max(viewCount, 1);

        if (clickRate > 0.8) {
          const campaigns = new Set(impressions.map(i => i.campaignId));
          for (const campaignId of campaigns) {
            alerts.push({
              type: 'suspicious_clicks',
              severity: clickRate > 0.95 ? 'high' : 'medium',
              campaignId,
              reason: `User ${userId.slice(0, 8)} has ${(clickRate * 100).toFixed(1)}% click rate`,
              detectedAt: new Date(),
            });
          }
        }
      }

      log.info('Fraud detection completed', { alertsFound: alerts.length });
    } catch (err) {
      log.error('Fraud detection failed', err);
    }

    return alerts;
  }

  /**
   * Generate comprehensive performance report
   */
  async generatePerformanceReport(dateRange = 7): Promise<any> {
    try {
      const since = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000);

      const [campaigns, impressions, clicks, userStats] = await Promise.all([
        db.adCampaign.count({ where: { isActive: true } }),
        db.adImpression.findMany({
          where: { createdAt: { gte: since } },
          include: { campaign: true },
        }),
        db.adImpression.count({ where: { createdAt: { gte: since }, wasClicked: true } }),
        db.adUserPreference.aggregate({
          _sum: { totalCreditsEarned: true },
          _avg: { totalAdsClicked: true, totalAdsViewed: true },
        }),
      ]);

      const totalImpressions = impressions.length;
      const totalRewards = impressions.reduce((sum, i) => sum + i.rewardAmount, 0);
      const avgViewDuration = impressions.reduce((sum, i) => sum + i.viewDurationMs, 0) / Math.max(totalImpressions, 1);

      return {
        period: { days: dateRange, since: since.toISOString() },
        campaigns: { active: campaigns },
        impressions: {
          total: totalImpressions,
          clicks,
          ctr: totalImpressions > 0 ? ((clicks / totalImpressions) * 100).toFixed(2) : '0',
          avgViewDuration: Math.round(avgViewDuration),
        },
        rewards: {
          total: totalRewards.toFixed(2),
          avgPerUser: userStats?._sum?.totalCreditsEarned ? (userStats?._sum?.totalCreditsEarned / totalImpressions).toFixed(4) : '0',
        },
        userMetrics: {
          avgClicks: userStats?._avg?.totalAdsClicked?.toFixed(2) || '0',
          avgViews: userStats?._avg?.totalAdsViewed?.toFixed(2) || '0',
        },
      };
    } catch (err) {
      log.error('Report generation failed', err);
      return null;
    }
  }

  /**
   * Predict best time to show ads based on historical data
   */
  async predictOptimalAdTiming(): Promise<{ hour: number; score: number }[]> {
    try {
      const impressions = await db.adImpression.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      });

      const hourlyStats = new Map<number, { views: number; clicks: number }>();

      for (const imp of impressions) {
        const hour = imp.createdAt.getHours();
        const current = hourlyStats.get(hour) || { views: 0, clicks: 0 };
        current.views++;
        if (imp.wasClicked) current.clicks++;
        hourlyStats.set(hour, current);
      }

      const timings = Array.from(hourlyStats.entries()).map(([hour, stats]) => ({
        hour,
        score: stats.views > 0 ? (stats.clicks / stats.views) * 100 : 0,
      }));

      return timings.sort((a, b) => b.score - a.score).slice(0, 5);
    } catch (err) {
      log.error('Timing prediction failed', err);
      return [];
    }
  }

  /**
   * Calculate expected ROI for campaigns
   */
  async calculateCampaignROI(campaignId: string): Promise<{
    campaignId: string;
    totalSpent: number;
    totalRevenue: number;
    roi: number;
    roiPercentage: number;
  }> {
    try {
      const campaign = await db.adCampaign.findUnique({ where: { id: campaignId } });
      if (!campaign) throw new Error('Campaign not found');

      const impressions = await db.adImpression.findMany({ where: { campaignId } });
      const totalRevenue = impressions.reduce((sum, i) => sum + i.rewardAmount, 0);
      const roi = totalRevenue - campaign.budgetSpent;
      const roiPercentage = campaign.budgetSpent > 0 ? (roi / campaign.budgetSpent) * 100 : 0;

      return {
        campaignId,
        totalSpent: campaign.budgetSpent,
        totalRevenue,
        roi,
        roiPercentage,
      };
    } catch (err) {
      log.error('ROI calculation failed', err);
      return { campaignId, totalSpent: 0, totalRevenue: 0, roi: 0, roiPercentage: 0 };
    }
  }
}

export const adAnalytics = new AdAnalytics();
