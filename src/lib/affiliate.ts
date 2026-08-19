// Programme d'affiliation - Premium uniquement
// Le parrain doit etre premium. Le bonus est verse quand le filleul achete un abonnement.
import { createHash, scryptSync } from 'crypto';
import { prisma } from '@/lib/prisma';

export interface AffiliateCode {
  id?: string;
  code: string;
  userId: string;
  createdAt: string;
  totalReferrals: number;
  totalRewards: number;
  isActive: boolean;
}

export interface Referral {
  id: string;
  referralCode: string;
  referrerUserId: string;
  referredEmail: string;
  referredUserId?: string;
  status: 'pending' | 'subscribed' | 'rewarded' | 'expired';
  rewardCredits: number;
  isRewarded: boolean;
  createdAt: string;
  subscribedAt?: string;
  rewardedAt?: string;
}

const CODE_LENGTH = 8;
const REWARD_REFERRER = 500;
const REWARD_REFERRED = 250;
const REFERRAL_EXPIRY_DAYS = 90; // 90 jours pour s'abonner

export function generateReferralCode(userId: string): string {
  const hash = scryptSync(userId + Date.now().toString(), 'gen3ia-salt', 32).toString('hex');
  const rawCode = hash.substring(0, CODE_LENGTH).toUpperCase();
  return `GVA-${rawCode}`;
}

export function createAffiliateCode(userId: string, _name: string): AffiliateCode {
  return {
    code: generateReferralCode(userId),
    userId,
    createdAt: new Date().toISOString(),
    totalReferrals: 0,
    totalRewards: 0,
    isActive: true,
  };
}

/**
 * Verifie si un utilisateur est premium (peut parrainer)
 */
export async function isUserPremium(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  return user?.plan === 'premium' || user?.plan === 'pro' || user?.plan === 'enterprise';
}

/**
 * Verifie si un utilisateur a un abonnement actif
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: 'active', OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
  });
  return !!sub;
}

export function calculateRewards(referralsCount: number): {
  referrerCredits: number;
  referredCredits: number;
  bonusCredits: number;
  nextMilestone: number;
} {
  const referrerCredits = referralsCount * REWARD_REFERRER;
  const referredCredits = referralsCount * REWARD_REFERRED;
  let bonusCredits = 0;
  let nextMilestone = 0;

  if (referralsCount >= 1 && referralsCount < 5) { bonusCredits = 200; nextMilestone = 5; }
  else if (referralsCount >= 5 && referralsCount < 10) { bonusCredits = 1000; nextMilestone = 10; }
  else if (referralsCount >= 10 && referralsCount < 25) { bonusCredits = 3000; nextMilestone = 25; }
  else if (referralsCount >= 25 && referralsCount < 50) { bonusCredits = 10000; nextMilestone = 50; }
  else if (referralsCount >= 50) { bonusCredits = 25000; nextMilestone = 0; }

  return { referrerCredits, referredCredits, bonusCredits, nextMilestone };
}

export function getMilestoneLabel(milestone: number): string {
  const milestones: Record<number, string> = {
    1: 'Premier parrainage',
    5: '5 filleuls - Pack Argent',
    10: '10 filleuls - Pack Or',
    25: '25 filleuls - Pack Platine',
    50: '50 filleuls - Pack Diamant',
  };
  return milestones[milestone] || `Prochain palier: ${milestone} filleuls`;
}

export async function getAffiliateDashboard(userId: string, codes: AffiliateCode[], referrals: Referral[]) {
  const totalReferrals = referrals.filter(r => r.status === 'subscribed' || r.status === 'rewarded').length;
  const pendingReferrals = referrals.filter(r => r.status === 'pending').length;
  const subscribedReferrals = referrals.filter(r => r.status === 'subscribed').length;
  const rewardedReferrals = referrals.filter(r => r.status === 'rewarded').length;
  const totalRewards = referrals.filter(r => r.isRewarded).reduce((sum, r) => sum + r.rewardCredits, 0);
  const rewards = calculateRewards(totalReferrals);
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/register?ref=${codes[0]?.code || ''}`;

  return {
    stats: {
      totalReferrals, pendingReferrals, subscribedReferrals, rewardedReferrals,
      totalRewards, activeCodes: codes.filter(c => c.isActive).length,
    },
    rewards: {
      perReferral: REWARD_REFERRER,
      perReferred: REWARD_REFERRED,
      earnedReferrer: rewards.referrerCredits,
      earnedReferred: totalReferrals * REWARD_REFERRED,
      bonusCredits: rewards.bonusCredits,
      nextMilestone: rewards.nextMilestone,
      nextMilestoneLabel: getMilestoneLabel(rewards.nextMilestone),
    },
    shareUrl,
    referralCodes: codes,
    recentReferrals: referrals.slice(0, 10),
  };
}
