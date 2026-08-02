// API Affiliate - Programme reserve aux premiums, bonus declenche par abonnement
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { generateReferralCode, calculateRewards, getMilestoneLabel, createAffiliateCode, getAffiliateDashboard, isUserPremium, hasActiveSubscription } from '@/lib/affiliate';





export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'dashboard';

    switch (scope) {
      case 'dashboard': {
        const isPremium = await isUserPremium(auth.id);
        if (!isPremium) {
          return NextResponse.json({
            success: true,
            dashboard: {
              isPremium: false,
              message: 'Le programme d\'affiliation est reserve aux abonnes Premium. Passez a Premium pour parrainer vos amis et gagner des credits !',
              stats: { totalReferrals: 0, pendingReferrals: 0, subscribedReferrals: 0, rewardedReferrals: 0, totalRewards: 0, activeCodes: 0 },
              rewards: { perReferral: 500, perReferred: 250, earnedReferrer: 0, earnedReferred: 0, bonusCredits: 0, nextMilestone: 1, nextMilestoneLabel: 'Premier parrainage' },
              shareUrl: '', referralCodes: [], recentReferrals: [],
            },
          });
        }
        const codes = await prisma.affiliateCode.findMany({ where: { userId: auth.id }, orderBy: { createdAt: 'desc' } });
        const referrals = await prisma.affiliateReferral.findMany({
          where: { referrerUserId: auth.id },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        if (codes.length === 0) {
          const newCode = createAffiliateCode(auth.id, auth.name || 'User');
          await prisma.affiliateCode.create({ data: { code: newCode.code, userId: auth.id, createdAt: new Date(), totalReferrals: 0, totalRewards: 0, isActive: true } });
          codes.push(newCode as any);
        }
        const dashboard = await getAffiliateDashboard(auth.id, codes as any, referrals as any);
        return NextResponse.json({ success: true, dashboard: { ...dashboard, isPremium: true } });
      }

      case 'rewards': {
        if (!(await isUserPremium(auth.id))) return NextResponse.json({ success: true, rewards: null, message: 'Affiliation reservee aux premiums' });
        const referrals = await prisma.affiliateReferral.count({ where: { referrerUserId: auth.id, status: { in: ['subscribed', 'rewarded'] } } });
        const rewards = calculateRewards(referrals);
        return NextResponse.json({ success: true, rewards, totalReferrals: referrals });
      }

      case 'referrals': {
        if (!(await isUserPremium(auth.id))) return NextResponse.json({ success: true, referrals: [], message: 'Affiliation reservee aux premiums' });
        const referrals = await prisma.affiliateReferral.findMany({ where: { referrerUserId: auth.id }, orderBy: { createdAt: 'desc' } });
        return NextResponse.json({ success: true, referrals });
      }

      case 'stats': {
        if (!(await isUserPremium(auth.id))) return NextResponse.json({ success: true, stats: { totalCodes: 0, totalReferrals: 0, totalRewards: 0, pendingCount: 0 } });
        const [totalCodes, totalReferrals, totalRewards, pendingCount] = await Promise.all([
          prisma.affiliateCode.count({ where: { userId: auth.id } }),
          prisma.affiliateReferral.count({ where: { referrerUserId: auth.id, status: { in: ['subscribed', 'rewarded'] } } }),
          prisma.affiliateReferral.aggregate({ where: { referrerUserId: auth.id, isRewarded: true }, _sum: { rewardCredits: true } }),
          prisma.affiliateReferral.count({ where: { referrerUserId: auth.id, status: 'pending' } }),
        ]);
        return NextResponse.json({ success: true, stats: { totalCodes, totalReferrals, totalRewards: totalRewards._sum.rewardCredits || 0, pendingCount } });
      }

      default:
        return NextResponse.json({ error: 'Scope inconnu' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'register-referral';

    switch (action) {
      case 'register-referral': {
        // Verifier que le parrain est premium
        const referrer = await prisma.user.findUnique({ where: { id: auth.id }, select: { plan: true } });
        if (!referrer || (referrer.plan !== 'premium' && referrer.plan !== 'pro' && referrer.plan !== 'enterprise')) {
          return NextResponse.json({ error: 'Seuls les abonnes Premium peuvent parrainer' }, { status: 403 });
        }
        const { referralCode, referredEmail } = body;
        if (!referralCode || !referredEmail) return NextResponse.json({ error: 'referralCode et referredEmail requis' }, { status: 400 });
        const code = await prisma.affiliateCode.findUnique({ where: { code: referralCode } });
        if (!code || !code.isActive) return NextResponse.json({ error: 'Code invalide ou inactif' }, { status: 404 });
        const existing = await prisma.affiliateReferral.findFirst({ where: { referredEmail } });
        if (existing) return NextResponse.json({ error: 'Cet email a deja ete parraine' }, { status: 409 });
        // Creer le referral en statut 'pending' - le bonus sera declenche quand le filleul s'abonne
        const referral = await prisma.affiliateReferral.create({
          data: { referralCode, referrerUserId: code.userId, referredEmail, status: 'pending', rewardCredits: 0, isRewarded: false },
        });
        await prisma.affiliateCode.update({ where: { id: code.id }, data: { totalReferrals: { increment: 1 } } });
        return NextResponse.json({
          success: true,
          referral,
          message: 'Parrainage enregistre. Le bonus sera automatiquement attribue quand la personne parrainee souscrira un abonnement Premium.',
        });
      }

      case 'check-subscription': {
        // Endpoint appele quand un filleul achete un abonnement
        // Verifie que le filleul a ete parraine et credite le parrain
        const { referredUserId } = body;
        if (!referredUserId) return NextResponse.json({ error: 'referredUserId requis' }, { status: 400 });
        const referredUser = await prisma.user.findUnique({ where: { id: referredUserId }, select: { email: true } });
        if (!referredUser) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
        const referral = await prisma.affiliateReferral.findFirst({
          where: { referredEmail: referredUser.email, status: { in: ['pending', 'subscribed'] } },
          orderBy: { createdAt: 'desc' },
        });
        if (!referral) return NextResponse.json({ success: false, message: 'Aucun parrainage actif pour cet email' });
        if (referral.status === 'rewarded') return NextResponse.json({ success: true, message: 'Deja recompense' });
        // Verifier que le filleul a bien un abonnement actif
        const hasSub = await hasActiveSubscription(referredUserId);
        if (!hasSub) return NextResponse.json({ success: false, message: 'Le filleul n\'a pas d\'abonnement actif' });
        // Mettre a jour le referral : marquer le filleul et passer en 'subscribed'
        await prisma.affiliateReferral.update({
          where: { id: referral.id },
          data: { referredUserId, status: 'subscribed', subscribedAt: new Date() },
        });
        // Crediter le parrain (500 credits) et le filleul (250 credits)
        const rewards = calculateRewards(1);
        await prisma.affiliateReferral.update({
          where: { id: referral.id },
          data: { status: 'rewarded', rewardCredits: rewards.referrerCredits, isRewarded: true, rewardedAt: new Date() },
        });
        await prisma.user.update({ where: { id: referral.referrerUserId }, data: { credits: { increment: rewards.referrerCredits } } });
        await prisma.user.update({ where: { id: referredUserId }, data: { credits: { increment: rewards.referredCredits } } });
        await prisma.affiliateCode.update({
          where: { code: referral.referralCode },
          data: { totalRewards: { increment: rewards.referrerCredits } },
        });
        return NextResponse.json({
          success: true,
          rewarded: { referrer: rewards.referrerCredits, referred: rewards.referredCredits },
          message: `Le parrain a gagne ${rewards.referrerCredits} credits et le filleul ${rewards.referredCredits} credits !`,
        });
      }

      case 'manual-convert': {
        // Pour admin : forcer la conversion d'un referral
        const { referralId } = body;
        if (!referralId) return NextResponse.json({ error: 'referralId requis' }, { status: 400 });
        const referral = await prisma.affiliateReferral.findUnique({ where: { id: referralId } });
        if (!referral) return NextResponse.json({ error: 'Referral introuvable' }, { status: 404 });
        const rewards = calculateRewards(1);
        await prisma.affiliateReferral.update({
          where: { id: referralId },
          data: { status: 'rewarded', rewardCredits: rewards.referrerCredits, isRewarded: true, rewardedAt: new Date() },
        });
        await prisma.user.update({ where: { id: referral.referrerUserId }, data: { credits: { increment: rewards.referrerCredits } } });
        if (referral.referredUserId) {
          await prisma.user.update({ where: { id: referral.referredUserId }, data: { credits: { increment: rewards.referredCredits } } });
        }
        return NextResponse.json({ success: true, rewarded: rewards.referrerCredits });
      }

      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
