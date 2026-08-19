import { db } from '@/lib/db';

const log = { info: (...a: unknown[]) => console.log('[AdOptimizer]', ...a), error: (...a: unknown[]) => console.error('[AdOptimizer]', ...a) };

/**
 * Real-time Ad Campaign Optimizer
 * - Dynamic bid adjustment
 * - Budget allocation
 * - Audience targeting refinement
 * - A/B test management
 */

export class AdOptimizer {
  /**
   * Adjust bids based on performance
   */
  async optimizeBids(): Promise<{ adjusted: number; increased: number; decreased: number }> {
    try {
      const campaigns = await db.adCampaign.findMany({ where: { isActive: true, status: 'active' } });
      let adjusted = 0;
      let increased = 0;
      let decreased = 0;

      for (const campaign of campaigns) {
        const impressions = await db.adImpression.findMany({
          where: { campaignId: campaign.id, createdAt: { gte: new Date(Date.now() - 86400000) } },
        });

        if (impressions.length < 10) continue;

        const clicks = impressions.filter(i => i.wasClicked).length;
        const ctr = clicks / impressions.length;
        const costPerClick = campaign.costPerClick;

        // Decrease bid if CRT is too low
        if (ctr < 0.01) {
          await db.adCampaign.update({
            where: { id: campaign.id },
            data: { costPerClick: Math.max(0.01, costPerClick * 0.85) },
          });
          decreased++;
          adjusted++;
        }
        // Increase bid if CTR is high and budget available
        else if (ctr > 0.05 && campaign.budgetSpent < campaign.budgetTotal * 0.9) {
          await db.adCampaign.update({
            where: { id: campaign.id },
            data: { costPerClick: Math.min(0.5, costPerClick * 1.15) },
          });
          increased++;
          adjusted++;
        }
      }

      log.info('Bids optimized', { adjusted, increased, decreased });
      return { adjusted, increased, decreased };
    } catch (err) {
      log.error('Bid optimization failed', err);
      return { adjusted: 0, increased: 0, decreased: 0 };
    }
  }

  /**
   * Reallocate budget to best performing campaigns
   */
  async optimizeBudgetAllocation(): Promise<{ campaigns: number; budgetReallocated: number }> {
    try {
      const campaigns = await db.adCampaign.findMany({ where: { budgetTotal: { gt: 0 } } });
      let reallocated = 0;

      // Calculate performance scores
      const scores = await Promise.all(
        campaigns.map(async (c) => {
          const impressions = await db.adImpression.count({ where: { campaignId: c.id } });
          const clicks = await db.adImpression.count({ where: { campaignId: c.id, wasClicked: true } });
          const ctr = impressions > 0 ? clicks / impressions : 0;
          const roi = c.budgetSpent > 0 ? ((clicks * c.rewardPerClick - c.budgetSpent) / c.budgetSpent) * 100 : 0;
          return { campaignId: c.id, ctr, roi, budget: c.budgetTotal };
        })
      );

      scores.sort((a, b) => b.roi - a.roi);

      // Top performers get +10%, worst get -10%
      if (scores.length > 2) {
        const top = scores.slice(0, Math.ceil(scores.length / 3));
        const bottom = scores.slice(-Math.ceil(scores.length / 3));

        for (const s of top) {
          await db.adCampaign.update({
            where: { id: s.campaignId },
            data: { budgetTotal: s.budget * 1.1 },
          });
          reallocated++;
        }

        for (const s of bottom) {
          await db.adCampaign.update({
            where: { id: s.campaignId },
            data: { budgetTotal: Math.max(10, s.budget * 0.9) },
          });
          reallocated++;
        }
      }

      log.info('Budget reallocated', { campaigns: campaigns.length, reallocated });
      return { campaigns: campaigns.length, budgetReallocated: reallocated };
    } catch (err) {
      log.error('Budget optimization failed', err);
      return { campaigns: 0, budgetReallocated: 0 };
    }
  }

  /**
   * Smart audience expansion based on lookalike
   */
  async expandTargetAudience(campaignId: string): Promise<{ expanded: boolean; newAudience: string }> {
    try {
      const campaign = await db.adCampaign.findUnique({ where: { id: campaignId } });
      if (!campaign) return { expanded: false, newAudience: '' };

      const impressions = await db.adImpression.findMany({ where: { campaignId, wasClicked: true }, take: 100 });

      // Analyze clicking users
      const clickedUsers = await db.user.findMany({
        where: { id: { in: impressions.map(i => i.userId) } },
        select: { plan: true, createdAt: true },
      });

      // Expand to similar users
      const commonPlan = clickedUsers.length > 0 ? clickedUsers[0].plan : 'free';
      const newAudience = campaign.targetAudience === 'all' ? commonPlan : 'all';

      await db.adCampaign.update({
        where: { id: campaignId },
        data: { targetAudience: newAudience },
      });

      log.info('Audience expanded', { campaignId: campaignId.slice(0, 8), newAudience });
      return { expanded: true, newAudience };
    } catch (err) {
      log.error('Audience expansion failed', err);
      return { expanded: false, newAudience: '' };
    }
  }

  /**
   * Manage A/B test campaigns and promote winners
   */
  async manageABTests(): Promise<{ completed: number; winners: string[] }> {
    try {
      // Get all AB test groups
      const testGroups = await db.adCampaign.findMany({
        where: { abTestGroup: { not: null } },
        select: { abTestGroup: true }
      });

      const winners: string[] = [];
      let completed = 0;

      for (const group of testGroups) {
        if (!group.abTestGroup) continue;

        const variants = await db.adCampaign.findMany({
          where: { abTestGroup: group.abTestGroup },
          include: { _count: { select: { impressions: true } } },
        });

        // Test needs at least 500 impressions per variant
        const totalImpressions = variants.reduce((sum, v) => sum + v._count.impressions, 0);
        if (totalImpressions < 500 * variants.length) continue;

        // Find winner by CTR
        const results = await Promise.all(
          variants.map(async (v) => {
            const clicks = await db.adImpression.count({
              where: { campaignId: v.id, wasClicked: true },
            });
            const impressions = v._count.impressions;
            return { campaignId: v.id, name: v.name, ctr: impressions > 0 ? clicks / impressions : 0 };
          })
        );

        results.sort((a, b) => b.ctr - a.ctr);
        const winner = results[0];

        // Promote winner
        await db.adCampaign.update({
          where: { id: winner.campaignId },
          data: { abTestGroup: null, abTestVariant: null, budgetTotal: variants.reduce((sum, v) => sum + v.budgetTotal, 0) },
        });

        // Pause losers
        for (const result of results.slice(1)) {
          await db.adCampaign.update({
            where: { id: result.campaignId },
            data: { status: 'completed' },
          });
        }

        winners.push(winner.campaignId);
        completed++;
      }

      log.info('AB tests managed', { completed, winners: winners.length });
      return { completed, winners };
    } catch (err) {
      log.error('AB test management failed', err);
      return { completed: 0, winners: [] };
    }
  }

  /**
   * Schedule automatic optimization tasks
   */
  scheduleOptimizations(interval = 3600000): void {
    setInterval(async () => {
      try {
        const [bids, budget, tests] = await Promise.all([
          this.optimizeBids(),
          this.optimizeBudgetAllocation(),
          this.manageABTests(),
        ]);
        log.info('Scheduled optimization completed', { bids: bids.adjusted, budget: budget.budgetReallocated, tests: tests.completed });
      } catch (err) {
        log.error('Scheduled optimization failed', err);
      }
    }, interval);
  }
}

export const adOptimizer = new AdOptimizer();
