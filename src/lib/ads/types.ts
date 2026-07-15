/**
 * Reward Ads System — Types
 */

export type AdProvider = 'google' | 'carbon' | 'native' | 'inhouse' | 'buysellads' | 'affiliate';
export type AdPlacement = 'sidebar' | 'banner_top' | 'banner_bottom' | 'inline' | 'modal' | 'footer' | 'dashboard_widget' | 'affiliate_section';
export type AdFormat = 'banner' | 'skyscraper' | 'rectangle' | 'native' | 'rewarded_video' | 'interstitial' | 'affiliate_link' | 'affiliate_banner';
export type AdStatus = 'active' | 'inactive' | 'paused';
export type AdTier = 1 | 2 | 3;

export interface AdUnit {
  id: string;
  name: string;
  provider: AdProvider;
  placement: AdPlacement;
  format: AdFormat;
  width: number;
  height: number;
  rewardCredits: number;
  dailyLimit: number;
  cooldownSeconds: number;
  status: AdStatus;
  code?: string;
  imageUrl?: string;
  targetUrl?: string;
  alt?: string;
  tier: AdTier;
  /** Niveau 2 : commission d'affiliation (ex: 0.10 = 10%) */
  affiliateCommission?: number;
  /** Niveau 2 : montant minimum pour retrait d'affiliation */
  affiliateMinPayout?: number;
  /** Niveau 2 : lien d'affiliation */
  affiliateUrl?: string;
  /** Niveau 2 : nom du programme d'affiliation */
  affiliateProgram?: string;
}

export interface AdEvent {
  id: string;
  userId: string;
  adUnitId: string;
  type: 'impression' | 'click' | 'view_completed' | 'reward_claimed' | 'affiliate_click' | 'affiliate_conversion';
  creditsAwarded: number;
  metadata?: Record<string, string>;
  createdAt: Date;
}

export interface DailyAdQuota {
  userId: string;
  adUnitId: string;
  date: string;
  views: number;
  creditsEarned: number;
  lastViewAt: Date | null;
}

export interface AdRewardResult {
  success: boolean;
  creditsAwarded: number;
  totalToday: number;
  dailyLimit: number;
  cooldownRemaining: number;
  message: string;
}

export interface AffiliateLink {
  id: string;
  name: string;
  description: string;
  url: string;
  logoUrl?: string;
  commission: number;
  commissionType: 'percentage' | 'fixed';
  cookieDays: number;
  featured: boolean;
  category: string;
}
