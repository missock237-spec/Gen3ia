// ============================================================
// ad-engine.test.ts — Plan-aware ad engine behavior tests.
// ------------------------------------------------------------
// Verifies the business rules:
//   * FREE plan: ads mandatory, NO rewards, CANNOT disable ads.
//   * Paid plan: ads shown WITH rewards; can disable ads (blocks rewards).
//   * Paid plan with rewards toggle off: ads shown, no credits.
//   * Campaign targeting by plan works.
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock the Firestore db facade before importing the engine. ---

type PrefDoc = {
  userId: string;
  adsEnabled: boolean;
  rewardedAdsEnabled: boolean;
  totalAdsViewed: number;
  totalAdsClicked: number;
  totalCreditsEarned: number;
  lastAdViewedAt?: Date | null;
};

type CampaignDoc = Record<string, unknown> & { id: string; placement: string; status: string; isActive: boolean };

type ImpressionDoc = Record<string, unknown> & { id: string };

const fakeDb = {
  _prefs: new Map<string, PrefDoc>(),
  _campaigns: new Map<string, CampaignDoc>(),
  _impressions: new Map<string, ImpressionDoc>(),
  _users: new Map<string, { plan: string }>(),
  _impressionCount: 0,

  user: {
    findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) =>
      fakeDb._users.get(id) || null
    ),
  },
  adUserPreference: {
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const existing = fakeDb._prefs.get(where.userId);
      const merged: PrefDoc = existing
        ? { ...existing, ...(update || {}) }
        : {
            userId: where.userId,
            adsEnabled: create.adsEnabled ?? true,
            rewardedAdsEnabled: create.rewardedAdsEnabled ?? false,
            totalAdsViewed: create.totalAdsViewed ?? 0,
            totalAdsClicked: create.totalAdsClicked ?? 0,
            totalCreditsEarned: create.totalCreditsEarned ?? 0,
            lastAdViewedAt: null,
          };
      fakeDb._prefs.set(where.userId, merged);
      return merged;
    }),
    findUnique: vi.fn(async ({ where: { userId } }: { where: { userId: string } }) =>
      fakeDb._prefs.get(userId) || null
    ),
  },
  adCampaign: {
    findMany: vi.fn(async () => Array.from(fakeDb._campaigns.values())),
    findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) =>
      fakeDb._campaigns.get(id) || null
    ),
    create: vi.fn(async ({ data }: { data: any }) => {
      const id = data.id || `camp_${Date.now()}`;
      const doc = { id, ...data };
      fakeDb._campaigns.set(id, doc as CampaignDoc);
      return doc;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
      const existing = fakeDb._campaigns.get(where.id);
      if (!existing) throw new Error('not found');
      // Support Prisma-style { increment: n } values.
      const merged: CampaignDoc = { ...existing };
      for (const [k, v] of Object.entries(data)) {
        if (v && typeof v === 'object' && 'increment' in (v as any)) {
          merged[k] = Number(merged[k] || 0) + Number((v as any).increment);
        } else {
          merged[k] = v as unknown;
        }
      }
      fakeDb._campaigns.set(where.id, merged);
      return merged;
    }),
  },
  adImpression: {
    create: vi.fn(async ({ data }: { data: any }) => {
      const id = `imp_${++fakeDb._impressionCount}`;
      const doc = { id, ...data };
      fakeDb._impressions.set(id, doc as ImpressionDoc);
      return doc;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
      const existing = fakeDb._impressions.get(where.id);
      if (!existing) throw new Error('not found');
      const merged = { ...existing, ...data };
      fakeDb._impressions.set(where.id, merged as ImpressionDoc);
      return merged;
    }),
    count: vi.fn(async ({ where }: { where?: any }) => {
      let all = Array.from(fakeDb._impressions.values());
      if (where?.campaignId) all = all.filter(i => i.campaignId === where.campaignId);
      if (where?.wasClicked) all = all.filter(i => i.wasClicked === true);
      return all.length;
    }),
    findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) =>
      fakeDb._impressions.get(id) || null
    ),
  },
  creditTransaction: {
    create: vi.fn(async () => ({})),
  },
};

vi.mock('@/lib/db', () => ({
  db: fakeDb,
  prisma: fakeDb,
  default: fakeDb,
}));

// Mock the credit engine to avoid hitting Firestore for balance.
vi.mock('@/lib/billing/credit-engine', () => ({
  getCreditEngine: () => ({
    creditUser: vi.fn(async () => ({ success: true, balanceAfter: 1 })),
    getUserBalance: vi.fn(async () => 0),
  }),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

// --- Helpers ---

function setUserPlan(userId: string, plan: string) {
  fakeDb._users.set(userId, { plan });
}

function seedCampaign(overrides: Partial<CampaignDoc> = {}): CampaignDoc {
  const id = overrides.id || `camp_${fakeDb._campaigns.size + 1}`;
  const doc: CampaignDoc = {
    id,
    name: 'Test campaign',
    description: '',
    advertiserName: 'Test',
    advertiserUrl: 'https://example.com',
    textContent: 'Test ad',
    ctaText: 'Click',
    ctaUrl: 'https://example.com/cta',
    targetPlan: 'all',
    maxImpressions: 0,
    maxClicks: 0,
    rewardPerView: 1,
    rewardPerClick: 2,
    costPerView: 0,
    costPerClick: 0,
    budgetTotal: 0,
    budgetSpent: 0,
    status: 'active',
    startAt: null,
    endAt: null,
    isActive: true,
    placement: 'conversation_inline',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  fakeDb._campaigns.set(id, doc);
  return doc;
}

// --- Tests ---

describe('AdEngine — plan-aware behavior', () => {
  let AdEngine: typeof import('@/lib/advertising/ad-engine').AdEngine;
  let getAdEngine: typeof import('@/lib/advertising/ad-engine').getAdEngine;

  beforeEach(async () => {
    fakeDb._prefs.clear();
    fakeDb._campaigns.clear();
    fakeDb._impressions.clear();
    fakeDb._users.clear();
    fakeDb._impressionCount = 0;
    vi.clearAllMocks();
    // Re-import fresh to reset the singleton.
    vi.resetModules();
    const mod = await import('@/lib/advertising/ad-engine');
    AdEngine = mod.AdEngine;
    getAdEngine = mod.getAdEngine;
  });

  // ---- FREE PLAN ----

  it('free user: ads are mandatory, rewarded=false, canDisableAds=false', async () => {
    setUserPlan('user_free', 'free');
    seedCampaign();
    const engine = new AdEngine();
    const prefs = await engine.getUserAdPreferences('user_free');
    expect(prefs.isFreePlan).toBe(true);
    expect(prefs.adsEnabled).toBe(true);
    expect(prefs.rewardedAdsEnabled).toBe(false);
    expect(prefs.canDisableAds).toBe(false);
    expect(prefs.mustShowInConversation).toBe(true);
    expect(prefs.adType).toBe('unrewarded');
  });

  it('free user: setAdsEnabled() is rejected', async () => {
    setUserPlan('user_free', 'free');
    const engine = new AdEngine();
    await expect(engine.setAdsEnabled('user_free', false)).rejects.toThrowError(
      'FREE_PLAN_CANNOT_DISABLE_ADS'
    );
  });

  it('free user: setRewardedAdsEnabled() is rejected', async () => {
    setUserPlan('user_free', 'free');
    const engine = new AdEngine();
    await expect(engine.setRewardedAdsEnabled('user_free', true)).rejects.toThrowError(
      'FREE_PLAN_CANNOT_EARN_REWARDS'
    );
  });

  it('free user: decideAd returns shouldShow=true with unrewarded ad', async () => {
    setUserPlan('user_free', 'free');
    seedCampaign();
    const engine = new AdEngine();
    const decision = await engine.decideAd('user_free', 'sess1');
    expect(decision.shouldShow).toBe(true);
    expect(decision.adType).toBe('unrewarded');
    expect(decision.isFreePlan).toBe(true);
    expect(decision.canDisableAds).toBe(false);
    expect(decision.pendingRewardPerView).toBe(0);
    expect(decision.campaign).not.toBeNull();
  });

  it('free user: recordImpression does NOT credit any reward', async () => {
    setUserPlan('user_free', 'free');
    const c = seedCampaign();
    const engine = new AdEngine();
    const result = await engine.recordImpression('user_free', c.id, 'unrewarded', 'sess1');
    expect(result.rewardCredited).toBe(false);
    expect(result.rewardAmount).toBe(0);
    expect(fakeDb.creditTransaction.create).not.toHaveBeenCalled();
  });

  // ---- PAID PLAN ----

  it('paid user: defaults to adsEnabled=true, rewardedAdsEnabled=true', async () => {
    setUserPlan('user_pro', 'pro');
    seedCampaign();
    const engine = new AdEngine();
    const prefs = await engine.getUserAdPreferences('user_pro');
    expect(prefs.isFreePlan).toBe(false);
    expect(prefs.adsEnabled).toBe(true);
    expect(prefs.rewardedAdsEnabled).toBe(true);
    expect(prefs.canDisableAds).toBe(true);
    expect(prefs.adType).toBe('rewarded');
  });

  it('paid user: can disable ads — and rewards are auto-disabled', async () => {
    setUserPlan('user_pro', 'pro');
    const engine = new AdEngine();
    await engine.setAdsEnabled('user_pro', false);
    const prefs = await engine.getUserAdPreferences('user_pro');
    expect(prefs.adsEnabled).toBe(false);
    expect(prefs.rewardedAdsEnabled).toBe(false);
  });

  it('paid user with ads disabled: decideAd returns shouldShow=false', async () => {
    setUserPlan('user_pro', 'pro');
    seedCampaign();
    const engine = new AdEngine();
    await engine.setAdsEnabled('user_pro', false);
    const decision = await engine.decideAd('user_pro', 'sess1');
    expect(decision.shouldShow).toBe(false);
    expect(decision.reason).toBe('ADS_DISABLED_BY_USER');
  });

  it('paid user with ads enabled but rewards off: decideAd shows unrewarded ad', async () => {
    setUserPlan('user_pro', 'pro');
    seedCampaign();
    const engine = new AdEngine();
    await engine.setRewardedAdsEnabled('user_pro', false);
    const decision = await engine.decideAd('user_pro', 'sess1');
    expect(decision.shouldShow).toBe(true);
    expect(decision.adType).toBe('unrewarded');
    expect(decision.pendingRewardPerView).toBe(0);
  });

  it('paid user with rewards on: recordImpression credits a reward', async () => {
    setUserPlan('user_pro', 'pro');
    const c = seedCampaign({ rewardPerView: 1 });
    const engine = new AdEngine();
    const result = await engine.recordImpression('user_pro', c.id, 'rewarded', 'sess1');
    expect(result.rewardCredited).toBe(true);
    expect(result.rewardAmount).toBe(1);
  });

  it('paid user with rewards on: recordClick credits rewardPerClick', async () => {
    setUserPlan('user_pro', 'pro');
    const c = seedCampaign({ rewardPerClick: 2 });
    const engine = new AdEngine();
    const imp = await engine.recordImpression('user_pro', c.id, 'rewarded', 'sess1');
    const click = await engine.recordClick(imp.impressionId);
    expect(click.rewardCredited).toBe(true);
    expect(click.rewardAmount).toBe(2);
  });

  it('paid user cannot enable rewards when ads are disabled', async () => {
    setUserPlan('user_pro', 'pro');
    const engine = new AdEngine();
    await engine.setAdsEnabled('user_pro', false);
    await expect(engine.setRewardedAdsEnabled('user_pro', true)).rejects.toThrowError(
      'REWARDS_REQUIRE_ADS_ENABLED'
    );
  });

  // ---- Campaign targeting ----

  it('campaigns with targetPlan=free are only served to free users', async () => {
    setUserPlan('user_free', 'free');
    setUserPlan('user_pro', 'pro');
    seedCampaign({ id: 'free_only', targetPlan: 'free' });
    const engine = new AdEngine();

    const freeDecision = await engine.decideAd('user_free', 'sess1');
    expect(freeDecision.shouldShow).toBe(true);
    expect(freeDecision.campaign?.id).toBe('free_only');

    const proDecision = await engine.decideAd('user_pro', 'sess1');
    expect(proDecision.shouldShow).toBe(false);
    expect(proDecision.reason).toBe('NO_MATCHING_CAMPAIGN');
  });

  it('campaigns with targetPlan=paid are only served to paid users', async () => {
    setUserPlan('user_free', 'free');
    setUserPlan('user_pro', 'pro');
    seedCampaign({ id: 'paid_only', targetPlan: 'paid' });
    const engine = new AdEngine();

    const proDecision = await engine.decideAd('user_pro', 'sess1');
    expect(proDecision.shouldShow).toBe(true);
    expect(proDecision.campaign?.id).toBe('paid_only');

    const freeDecision = await engine.decideAd('user_free', 'sess1');
    expect(freeDecision.shouldShow).toBe(false);
  });

  it('returns no-campaign reason when DB is empty', async () => {
    setUserPlan('user_free', 'free');
    const engine = new AdEngine();
    const decision = await engine.decideAd('user_free', 'sess1');
    expect(decision.shouldShow).toBe(false);
    expect(decision.reason).toBe('NO_ACTIVE_CAMPAIGN');
  });

  // ---- Singleton ----

  it('getAdEngine returns a singleton', () => {
    const a = getAdEngine();
    const b = getAdEngine();
    expect(a).toBe(b);
  });
});
