/**
 * Reward Ads System — Types
 */

export type AdProvider = 'google' | 'carbon' | 'native' | 'inhouse' | 'buysellads';
export type AdPlacement = 'sidebar' | 'banner_top' | 'banner_bottom' | 'inline' | 'modal' | 'footer' | 'dashboard_widget';
export type AdFormat = 'banner' | 'skyscraper' | 'rectangle' | 'native' | 'rewarded_video' | 'interstitial';
export type AdStatus = 'active' | 'inactive' | 'paused';

export interface AdUnit {
  id: string;
  name: string;
  provider: AdProvider;
  placement: AdPlacement;
  format: AdFormat;
  width: number;
  height: number;
  rewardCredits: number;
  dailyLimit: number;       // max views per user per day
  cooldownSeconds: number;  // min time between views
  status: AdStatus;
  code?: string;            // HTML/JS snippet for external ads
  imageUrl?: string;        // For in-house ads
  targetUrl?: string;       // For in-house ads
  alt?: string;
}

export interface AdEvent {
  id: string;
  userId: string;
  adUnitId: string;
  type: 'impression' | 'click' | 'view_completed' | 'reward_claimed';
  creditsAwarded: number;
  metadata?: Record<string, string>;
  createdAt: Date;
}

export interface DailyAdQuota {
  userId: string;
  adUnitId: string;
  date: string;          // YYYY-MM-DD
  views: number;
  creditsEarned: number;
  lastViewAt: Date | null;
}

export interface AdRewardResult {
  success: boolean;
  creditsAwarded: number;
  totalToday: number;
  dailyLimit: number;
  cooldownRemaining: number;  // seconds until next ad allowed
  message: string;
}
