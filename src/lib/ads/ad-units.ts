/**
 * Reward Ads System — Ad Units Configuration
 *
 * Configure ad placements and rewards for free users.
 * Free users can earn up to ~200 credits/day by watching ads.
 */

import type { AdUnit } from './types';

export const AD_UNITS: AdUnit[] = [
  // ── Sidebar ──
  {
    id: 'sidebar_discover_pro',
    name: 'Découvrez Genova Pro',
    provider: 'inhouse',
    placement: 'sidebar',
    format: 'rectangle',
    width: 300,
    height: 250,
    rewardCredits: 5,
    dailyLimit: 10,
    cooldownSeconds: 30,
    status: 'active',
    imageUrl: '/ads/pro-upgrade.png',
    targetUrl: '/billing',
    alt: 'Passez à Genova Pro - 29$/mois',
  },
  {
    id: 'sidebar_enterprise',
    name: 'Genova Enterprise',
    provider: 'inhouse',
    placement: 'sidebar',
    format: 'rectangle',
    width: 300,
    height: 250,
    rewardCredits: 10,
    dailyLimit: 5,
    cooldownSeconds: 60,
    status: 'active',
    imageUrl: '/ads/enterprise.png',
    targetUrl: '/billing',
    alt: 'Genova Enterprise - 99$/mois',
  },

  // ── Banner Top ──
  {
    id: 'banner_top_credits',
    name: 'Gagnez des crédits',
    provider: 'inhouse',
    placement: 'banner_top',
    format: 'banner',
    width: 728,
    height: 90,
    rewardCredits: 3,
    dailyLimit: 20,
    cooldownSeconds: 15,
    status: 'active',
    imageUrl: '/ads/earn-credits.png',
    targetUrl: '/billing',
    alt: 'Gagnez des crédits en regardant des pubs',
  },

  // ── Banner Bottom ──
  {
    id: 'banner_bottom_ai',
    name: 'Boostez vos agents AI',
    provider: 'inhouse',
    placement: 'banner_bottom',
    format: 'banner',
    width: 728,
    height: 90,
    rewardCredits: 3,
    dailyLimit: 20,
    cooldownSeconds: 15,
    status: 'active',
    imageUrl: '/ads/boost-ai.png',
    targetUrl: '/billing',
    alt: 'Débloquez plus de puissance AI',
  },

  // ── Rewarded Video (modal) ──
  {
    id: 'rewarded_video_15',
    name: 'Vidéo Récompensée x15',
    provider: 'inhouse',
    placement: 'modal',
    format: 'rewarded_video',
    width: 400,
    height: 600,
    rewardCredits: 15,
    dailyLimit: 8,
    cooldownSeconds: 120,
    status: 'active',
    imageUrl: '/ads/rewarded-video.png',
    targetUrl: '/billing',
    alt: 'Regardez une vidéo pour 15 crédits',
  },
  {
    id: 'rewarded_video_25',
    name: 'Vidéo Premium x25',
    provider: 'inhouse',
    placement: 'modal',
    format: 'rewarded_video',
    width: 400,
    height: 600,
    rewardCredits: 25,
    dailyLimit: 3,
    cooldownSeconds: 300,
    status: 'active',
    imageUrl: '/ads/rewarded-premium.png',
    targetUrl: '/pricing',
    alt: 'Regardez une vidéo premium pour 25 crédits',
  },

  // ── Dashboard Widget ──
  {
    id: 'dashboard_marketplace',
    name: 'Marketplace',
    provider: 'inhouse',
    placement: 'dashboard_widget',
    format: 'native',
    width: 0,
    height: 0,
    rewardCredits: 2,
    dailyLimit: 15,
    cooldownSeconds: 10,
    status: 'active',
    imageUrl: '/ads/marketplace.png',
    targetUrl: '/marketplace',
    alt: 'Découvrez le Marketplace',
  },

  // ── Footer ──
  {
    id: 'footer_starter',
    name: 'Starter à 9$/mois',
    provider: 'inhouse',
    placement: 'footer',
    format: 'banner',
    width: 468,
    height: 60,
    rewardCredits: 2,
    dailyLimit: 30,
    cooldownSeconds: 10,
    status: 'active',
    imageUrl: '/ads/starter-plan.png',
    targetUrl: '/billing',
    alt: 'Passez à Starter - 9$/mois',
  },
];

// ===================================================================
// Helpers
// ===================================================================

export function getAdsForPlacement(placement: string): AdUnit[] {
  return AD_UNITS.filter((ad) => ad.placement === placement && ad.status === 'active');
}

export function getRandomAdForPlacement(placement: string): AdUnit | null {
  const ads = getAdsForPlacement(placement);
  if (ads.length === 0) return null;
  return ads[Math.floor(Math.random() * ads.length)];
}

export function getMaxDailyCreditsFromAds(): number {
  return AD_UNITS
    .filter((ad) => ad.status === 'active')
    .reduce((total, ad) => total + ad.rewardCredits * ad.dailyLimit, 0);
}

export function getPotentialDailyCredits(): { perAd: { name: string; credits: number; maxDaily: number }[]; total: number } {
  const perAd = AD_UNITS
    .filter((ad) => ad.status === 'active')
    .map((ad) => ({
      name: ad.name,
      credits: ad.rewardCredits,
      maxDaily: ad.rewardCredits * ad.dailyLimit,
    }));

  const total = perAd.reduce((sum, a) => sum + a.maxDaily, 0);
  return { perAd, total };
}
