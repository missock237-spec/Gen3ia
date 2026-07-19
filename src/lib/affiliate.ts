import { randomBytes, createHash } from 'crypto';

interface AffiliateCode {
  code: string;
  userId: string;
  createdAt: string;
  totalReferrals: number;
  totalRewards: number;
  isActive: boolean;
}

interface Referral {
  id: string;
  referralCode: string;
  referrerUserId: string;
  referredEmail: string;
  status: 'pending' | 'active' | 'converted' | 'expired';
  rewardCredits: number;
  isRewarded: boolean;
  createdAt: string;
  convertedAt: string | null;
}

const CODE_LENGTH = 8;
const REWARD_REFERRER = 500;
const REWARD_REFERRED = 250;
const REFERRAL_EXPIRY_DAYS = 30;
const MIN_CONVERSION_DAYS = 7;

export function generateReferralCode(userId: string): string {
  const hash = createHash('sha256').update(userId + Date.now()).digest('hex');
  const rawCode = hash.substring(0, CODE_LENGTH).toUpperCase();
  // Format: GVA-XXXXXX
  return `GVA-${rawCode}`;
}

export function createAffiliateCode(userId: string, name: string): AffiliateCode {
  return {
    code: generateReferralCode(userId),
    userId,
    createdAt: new Date().toISOString(),
    totalReferrals: 0,
    totalRewards: 0,
    isActive: true,
  };
}

export function calculateRewards(referralsCount: number): {
  referrerCredits: number;
  referredCredits: number;
  bonusCredits: number;
  nextMilestone: number;
} {
  const referrerCredits = referralsCount * REWARD_REFERRER;
  const referredCredits = referralsCount * REWARD_REFERRED;

  // Bonus paliers
  let bonusCredits = 0;
  let nextMilestone = 0;

  if (referralsCount >= 1 && referralsCount < 5) {
    bonusCredits = 200;
    nextMilestone = 5;
  } else if (referralsCount >= 5 && referralsCount < 10) {
    bonusCredits = 1000;
    nextMilestone = 10;
  } else if (referralsCount >= 10 && referralsCount < 25) {
    bonusCredits = 3000;
    nextMilestone = 25;
  } else if (referralsCount >= 25 && referralsCount < 50) {
    bonusCredits = 10000;
    nextMilestone = 50;
  } else if (referralsCount >= 50) {
    bonusCredits = 25000;
    nextMilestone = 0; // Max atteint
  }

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
  const totalReferrals = referrals.filter(r => r.status === 'active' || r.status === 'converted').length;
  const pendingReferrals = referrals.filter(r => r.status === 'pending').length;
  const convertedReferrals = referrals.filter(r => r.status === 'converted').length;
  const totalRewards = referrals
    .filter(r => r.isRewarded)
    .reduce((sum, r) => sum + r.rewardCredits, 0);

  const rewards = calculateRewards(totalReferrals);
  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/register?ref=${codes[0]?.code || ''}`;

  return {
    stats: {
      totalReferrals,
      pendingReferrals,
      convertedReferrals,
      totalRewards,
      activeCodes: codes.filter(c => c.isActive).length,
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
