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
  dailyLimit: number;
  cooldownSeconds: number;
  status: AdStatus;
  code?: string;
  imageUrl?: string;
  targetUrl?: string;
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
