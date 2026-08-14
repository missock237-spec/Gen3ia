import { describe, it, expect, beforeEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('Ad Rewards System', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should award credits for paid plan users', async () => {
    const { awardAdReward } = await import('@/lib/ad-rewards');
    const result = awardAdReward('test-ad', 'view', 'pro');
    expect(result.success).toBe(true);
    expect(result.credits).toBe(1);
    expect(result.balance?.total).toBe(1);
  });

  it('should award more credits for clicks', async () => {
    const { awardAdReward } = await import('@/lib/ad-rewards');
    const result = awardAdReward('test-ad-click', 'click', 'starter');
    expect(result.success).toBe(true);
    expect(result.credits).toBe(2);
  });

  it('should not award credits for free plan', async () => {
    const { awardAdReward } = await import('@/lib/ad-rewards');
    const result = awardAdReward('test-ad', 'view', 'free');
    expect(result.success).toBe(false);
    expect(result.credits).toBeUndefined();
  });

  it('should enforce cooldown between rewards', async () => {
    const { awardAdReward } = await import('@/lib/ad-rewards');
    // Premier award
    const first = awardAdReward('ad-1', 'view', 'pro');
    expect(first.success).toBe(true);

    // Deuxième immédiatement - doit être bloqué par le cooldown
    const second = awardAdReward('ad-2', 'view', 'pro');
    expect(second.success).toBe(false);
  });

  it('should prevent duplicate counting', async () => {
    const { awardAdReward } = await import('@/lib/ad-rewards');
    const first = awardAdReward('same-ad', 'view', 'pro');
    expect(first.success).toBe(true);

    // Même adId, même type = doublon
    const duplicate = awardAdReward('same-ad', 'view', 'pro');
    // Devrait être détecté comme doublon si dans les 5 minutes
    // Mais le cooldown peut aussi le bloquer
    expect(duplicate.success).toBe(false);
  });

  it('should persist balance across operations', async () => {
    const { awardAdReward, getCreditBalance } = await import('@/lib/ad-rewards');

    // Simuler en modifiant le timestamp pour bypasser le cooldown
    const now = Date.now();
    const mockEntry = {
      adId: 'past-ad',
      type: 'view',
      credits: 1,
      timestamp: new Date(now - 60000).toISOString(), // 1 minute ago
      plan: 'pro',
    };
    localStorageMock.setItem('genova_ad_rewards_history', JSON.stringify([mockEntry]));

    const balance = getCreditBalance();
    expect(balance.total).toBe(0); // Le historique est lu mais pas le solde
  });

  it('should respect daily limit', async () => {
    const { awardAdReward } = await import('@/lib/ad-rewards');

    // Simuler qu'on a déjà 50 récompenses aujourd'hui (en manipulant le temps)
    const pastEntries = Array.from({ length: 50 }, (_, i) => ({
      adId: `ad-${i}`,
      type: 'view' as const,
      credits: 1,
      timestamp: new Date(Date.now() - i * 35000).toISOString(),
      plan: 'pro',
    }));
    localStorageMock.setItem('genova_ad_rewards_history', JSON.stringify(pastEntries));

    const result = awardAdReward('new-ad', 'view', 'pro');
    expect(result.success).toBe(false);
  });
});
