/**
 * Reward Ads System — Ad Units Configuration
 *
 * 3 niveaux de récompense :
 * Niveau 1 (Tier 1) : Vidéos simples depuis des sites d'ads (Google AdSense, Carbon)
 * Niveau 2 (Tier 2) : Publicités d'affiliation (liens sponsorisés, commissions)
 * Niveau 3 (Tier 3) : Réservé pour expansion future
 *
 * Free users can earn up to ~400 credits/day by watching ads across all tiers.
 */

import type { AdUnit } from './types';

// ===================================================================
// NIVEAU 1 — Vidéos simples depuis des sites d'ads
// ===================================================================

const TIER1_ADS: AdUnit[] = [
  // ── Sidebar ──
  {
    id: 't1_sidebar_discover_pro',
    name: 'Découvrez Genova Pro',
    provider: 'inhouse',
    placement: 'sidebar',
    format: 'rectangle',
    width: 300,
    height: 250,
    rewardCredits: 3,
    dailyLimit: 10,
    cooldownSeconds: 30,
    status: 'active',
    tier: 1,
    imageUrl: '/ads/pro-upgrade.png',
    targetUrl: '/billing',
    alt: 'Passez à Genova Pro - 29$/mois',
  },
  {
    id: 't1_sidebar_enterprise',
    name: 'Genova Enterprise',
    provider: 'inhouse',
    placement: 'sidebar',
    format: 'rectangle',
    width: 300,
    height: 250,
    rewardCredits: 5,
    dailyLimit: 5,
    cooldownSeconds: 60,
    status: 'active',
    tier: 1,
    imageUrl: '/ads/enterprise.png',
    targetUrl: '/billing',
    alt: 'Genova Enterprise - 99$/mois',
  },

  // ── Rewarded Video (modal) — Vidéos simples récompensées ──
  {
    id: 't1_video_15',
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
    tier: 1,
    imageUrl: '/ads/rewarded-video.png',
    targetUrl: '/billing',
    alt: 'Regardez une vidéo pour 15 crédits',
  },
  {
    id: 't1_video_25',
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
    tier: 1,
    imageUrl: '/ads/rewarded-premium.png',
    targetUrl: '/pricing',
    alt: 'Regardez une vidéo premium pour 25 crédits',
  },

  // ── Google AdSense / Carbon Ads (via RealAdDisplay) ──
  {
    id: 't1_adsense_banner',
    name: 'Annonce partenaire',
    provider: 'google',
    placement: 'banner_top',
    format: 'banner',
    width: 728,
    height: 90,
    rewardCredits: 2,
    dailyLimit: 20,
    cooldownSeconds: 15,
    status: 'active',
    tier: 1,
    code: 'adsense',
    alt: 'Annonce Google AdSense',
  },
  {
    id: 't1_carbon_ads',
    name: 'Carbon Ad',
    provider: 'carbon',
    placement: 'sidebar',
    format: 'rectangle',
    width: 300,
    height: 250,
    rewardCredits: 4,
    dailyLimit: 8,
    cooldownSeconds: 45,
    status: 'active',
    tier: 1,
    alt: 'Carbon Ad',
  },

  // ── Dashboard Widget ──
  {
    id: 't1_dashboard_marketplace',
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
    tier: 1,
    imageUrl: '/ads/marketplace.png',
    targetUrl: '/marketplace',
    alt: 'Découvrez le Marketplace',
  },

  // ── Footer ──
  {
    id: 't1_footer_starter',
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
    tier: 1,
    imageUrl: '/ads/starter-plan.png',
    targetUrl: '/billing',
    alt: 'Passez à Starter - 9$/mois',
  },
];

// ===================================================================
// NIVEAU 2 — Publicités d'affiliation
// ===================================================================

const TIER2_ADS: AdUnit[] = [
  // ── Affiliation : Hébergement / Cloud ──
  {
    id: 't2_affiliate_digitalocean',
    name: 'DigitalOcean - Hébergement Cloud',
    provider: 'affiliate',
    placement: 'affiliate_section',
    format: 'affiliate_banner',
    width: 728,
    height: 90,
    rewardCredits: 10,
    dailyLimit: 3,
    cooldownSeconds: 300,
    status: 'active',
    tier: 2,
    imageUrl: '/ads/affiliate-digitalocean.png',
    targetUrl: 'https://www.digitalocean.com/?ref=genova',
    alt: 'Hébergement cloud DigitalOcean - 200$ de crédit offert',
    affiliateCommission: 0.20,
    affiliateMinPayout: 5,
    affiliateUrl: 'https://www.digitalocean.com/?ref=genova',
    affiliateProgram: 'DigitalOcean Affiliate',
  },
  {
    id: 't2_affiliate_vercel',
    name: 'Vercel - Déploiement',
    provider: 'affiliate',
    placement: 'affiliate_section',
    format: 'affiliate_banner',
    width: 728,
    height: 90,
    rewardCredits: 8,
    dailyLimit: 3,
    cooldownSeconds: 300,
    status: 'active',
    tier: 2,
    imageUrl: '/ads/affiliate-vercel.png',
    targetUrl: 'https://vercel.com/?ref=genova',
    alt: 'Vercel - Déployez vos apps instantanément',
    affiliateCommission: 0.15,
    affiliateMinPayout: 5,
    affiliateUrl: 'https://vercel.com/?ref=genova',
    affiliateProgram: 'Vercel Affiliate',
  },

  // ── Affiliation : Outils AI ──
  {
    id: 't2_affiliate_openai',
    name: 'OpenAI API - Puissance AI',
    provider: 'affiliate',
    placement: 'affiliate_section',
    format: 'affiliate_banner',
    width: 728,
    height: 90,
    rewardCredits: 12,
    dailyLimit: 2,
    cooldownSeconds: 600,
    status: 'active',
    tier: 2,
    imageUrl: '/ads/affiliate-openai.png',
    targetUrl: 'https://platform.openai.com/?ref=genova',
    alt: 'API OpenAI - Les meilleurs modèles de langage',
    affiliateCommission: 0.10,
    affiliateMinPayout: 10,
    affiliateUrl: 'https://platform.openai.com/?ref=genova',
    affiliateProgram: 'OpenAI Affiliate',
  },

  // ── Affiliation : Domaine / SSL ──
  {
    id: 't2_affiliate_namecheap',
    name: 'Namecheap - Domaines',
    provider: 'affiliate',
    placement: 'affiliate_section',
    format: 'affiliate_link',
    width: 300,
    height: 250,
    rewardCredits: 6,
    dailyLimit: 4,
    cooldownSeconds: 180,
    status: 'active',
    tier: 2,
    imageUrl: '/ads/affiliate-namecheap.png',
    targetUrl: 'https://www.namecheap.com/?ref=genova',
    alt: 'Namecheap - Domaines à partir de 8.88$',
    affiliateCommission: 0.25,
    affiliateMinPayout: 5,
    affiliateUrl: 'https://www.namecheap.com/?ref=genova',
    affiliateProgram: 'Namecheap Affiliate',
  },

  // ── Affiliation : Formation / Cours ──
  {
    id: 't2_affiliate_udemy',
    name: 'Udemy - Formation AI',
    provider: 'affiliate',
    placement: 'affiliate_section',
    format: 'affiliate_link',
    width: 300,
    height: 250,
    rewardCredits: 7,
    dailyLimit: 3,
    cooldownSeconds: 180,
    status: 'active',
    tier: 2,
    imageUrl: '/ads/affiliate-udemy.png',
    targetUrl: 'https://www.udemy.com/?ref=genova',
    alt: 'Udemy - Apprenez l'"IA dès maintenant',
    affiliateCommission: 0.30,
    affiliateMinPayout: 5,
    affiliateUrl: 'https://www.udemy.com/?ref=genova',
    affiliateProgram: 'Udemy Affiliate',
  },

  // ── Affiliation : Sidebar - Produits recommandés ──
  {
    id: 't2_sidebar_hostinger',
    name: 'Hostinger - Hébergement pas cher',
    provider: 'affiliate',
    placement: 'sidebar',
    format: 'rectangle',
    width: 300,
    height: 250,
    rewardCredits: 5,
    dailyLimit: 5,
    cooldownSeconds: 120,
    status: 'active',
    tier: 2,
    imageUrl: '/ads/affiliate-hostinger.png',
    targetUrl: 'https://www.hostinger.com/?ref=genova',
    alt: 'Hostinger - Hébergement à partir de 1.99$/mois',
    affiliateCommission: 0.20,
    affiliateMinPayout: 5,
    affiliateUrl: 'https://www.hostinger.com/?ref=genova',
    affiliateProgram: 'Hostinger Affiliate',
  },

  // ── Affiliation : Outils SaaS ──
  {
    id: 't2_affiliate_notion',
    name: 'Notion - Productivité',
    provider: 'affiliate',
    placement: 'affiliate_section',
    format: 'affiliate_banner',
    width: 728,
    height: 90,
    rewardCredits: 8,
    dailyLimit: 3,
    cooldownSeconds: 300,
    status: 'active',
    tier: 2,
    imageUrl: '/ads/affiliate-notion.png',
    targetUrl: 'https://www.notion.so/?ref=genova',
    alt: 'Notion - L'espace de travail connecté',
    affiliateCommission: 0.15,
    affiliateMinPayout: 5,
    affiliateUrl: 'https://www.notion.so/?ref=genova',
    affiliateProgram: 'Notion Affiliate',
  },
];

// ===================================================================
// NIVEAU 3 — Réservé pour expansion future
// ===================================================================

const TIER3_ADS: AdUnit[] = [
  // Placeholder pour futur niveau 3
  {
    id: 't3_placeholder_premium',
    name: 'Niveau Premium (Bientôt disponible)',
    provider: 'inhouse',
    placement: 'affiliate_section',
    format: 'native',
    width: 728,
    height: 90,
    rewardCredits: 50,
    dailyLimit: 1,
    cooldownSeconds: 600,
    status: 'inactive',
    tier: 3,
    imageUrl: '/ads/premium-coming-soon.png',
    targetUrl: '/billing',
    alt: 'Niveau 3 - Bientôt disponible',
  },
];

// ===================================================================
// Combined export
// ===================================================================

export const AD_UNITS: AdUnit[] = [...TIER1_ADS, ...TIER2_ADS, ...TIER3_ADS];

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

export function getPotentialDailyCredits(): { perAd: { name: string; credits: number; maxDaily: number; tier: number }[]; total: number } {
  const perAd = AD_UNITS
    .filter((ad) => ad.status === 'active')
    .map((ad) => ({
      name: ad.name,
      credits: ad.rewardCredits,
      maxDaily: ad.rewardCredits * ad.dailyLimit,
      tier: ad.tier,
    }));

  const total = perAd.reduce((sum, a) => sum + a.maxDaily, 0);
  return { perAd, total };
}

/**
 * Obtenir les crédits maximum par tier
 */
export function getMaxDailyCreditsByTier(): Record<number, number> {
  const tiers: Record<number, number> = { 1: 0, 2: 0, 3: 0 };

  AD_UNITS
    .filter((ad) => ad.status === 'active')
    .forEach((ad) => {
      tiers[ad.tier] = (tiers[ad.tier] || 0) + ad.rewardCredits * ad.dailyLimit;
    });

  return tiers;
}

/**
 * Obtenir les pubs d'un niveau spécifique
 */
export function getAdsByTier(tier: number): AdUnit[] {
  return AD_UNITS.filter((ad) => ad.tier === tier && ad.status === 'active');
}

/**
 * Obtenir les liens d'affiliation actifs
 */
export function getAffiliateLinks() {
  return AD_UNITS
    .filter((ad) => ad.provider === 'affiliate' && ad.status === 'active')
    .map((ad) => ({
      id: ad.id,
      name: ad.name,
      description: ad.alt || '',
      url: ad.affiliateUrl || ad.targetUrl || '',
      imageUrl: ad.imageUrl,
      commission: ad.affiliateCommission || 0,
      rewardCredits: ad.rewardCredits,
      program: ad.affiliateProgram,
    }));
}
