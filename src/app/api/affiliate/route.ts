// API Affiliate - Parrainage et programme d'affiliation
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { generateReferralCode, calculateRewards, getMilestoneLabel, createAffiliateCode, getAffiliateDashboard } from '@/lib/affiliate';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'dashboard';

    switch (scope) {
      case 'dashboard': {
        const codes = await prisma.affiliateCode.findMany({ where: { userId: auth.id }, orderBy: { createdAt: 'desc' } });
        const referrals = await prisma.affiliateReferral.findMany({
          where: { referrerUserId: auth.id },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        // Si aucun code, en creer un
        if (codes.length === 0) {
          const newCode = createAffiliateCode(auth.id, auth.name || 'User');
          await prisma.affiliateCode.create({ data: { code: newCode.code, userId: auth.id, createdAt: new Date(), totalReferrals: 0, totalRewards: 0, isActive: true } });
          codes.push(newCode as any);
        }
        const dashboard = await getAffiliateDashboard(auth.id, codes as any, referrals as any);
        return NextResponse.json({ success: true, dashboard });
      }

      case 'rewards': {
        const referrals = await prisma.affiliateReferral.count({ where: { referrerUserId: auth.id, status: { in: ['active', 'converted'] } } });
        const rewards = calculateRewards(referrals);
        return NextResponse.json({ success: true, rewards, totalReferrals: referrals });
      }

      case 'referrals': {
        const referrals = await prisma.affiliateReferral.findMany({
          where: { referrerUserId: auth.id },
          orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({ success: true, referrals });
      }

      case 'stats': {
        const [totalCodes, totalReferrals, totalRewards, pendingCount] = await Promise.all([
          prisma.affiliateCode.count({ where: { userId: auth.id } }),
          prisma.affiliateReferral.count({ where: { referrerUserId: auth.id, status: { in: ['active', 'converted'] } } }),
          prisma.affiliateReferral.aggregate({ where: { referrerUserId: auth.id, isRewarded: true }, _sum: { rewardCredits: true } }),
          prisma.affiliateReferral.count({ where: { referrerUserId: auth.id, status: 'pending' } }),
        ]);
        return NextResponse.json({
          success: true,
          stats: { totalCodes, totalReferrals, totalRewards: totalRewards._sum.rewardCredits || 0, pendingCount },
        });
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
        const { referralCode, referredEmail } = body;
        if (!referralCode || !referredEmail) return NextResponse.json({ error: 'referralCode et referredEmail requis' }, { status: 400 });
        const code = await prisma.affiliateCode.findUnique({ where: { code: referralCode } });
        if (!code || !code.isActive) return NextResponse.json({ error: 'Code invalide ou inactif' }, { status: 404 });
        const existing = await prisma.affiliateReferral.findFirst({ where: { referredEmail } });
        if (existing) return NextResponse.json({ error: 'Cet email a deja ete parraine' }, { status: 409 });
        const referral = await prisma.affiliateReferral.create({
          data: {
            referralCode, referrerUserId: code.userId, referredEmail,
            status: 'pending', rewardCredits: 0, isRewarded: false,
          },
        });
        await prisma.affiliateCode.update({ where: { id: code.id }, data: { totalReferrals: { increment: 1 } } });
        return NextResponse.json({ success: true, referral });
      }

      case 'convert-referral': {
        const { referralId } = body;
        if (!referralId) return NextResponse.json({ error: 'referralId requis' }, { status: 400 });
        const referral = await prisma.affiliateReferral.findUnique({ where: { id: referralId } });
        if (!referral) return NextResponse.json({ error: 'Referral introuvable' }, { status: 404 });
        // Marquer comme converti et attribuer les recompenses
        const rewards = calculateRewards(1);
        await prisma.affiliateReferral.update({
          where: { id: referralId },
          data: { status: 'converted', rewardCredits: rewards.referrerCredits, isRewarded: true, convertedAt: new Date() },
        });
        // Crediter le parrain
        await prisma.user.update({
          where: { id: referral.referrerUserId },
          data: { credits: { increment: rewards.referrerCredits } },
        });
        await prisma.affiliateCode.update({
          where: { code: referral.referralCode },
          data: { totalRewards: { increment: rewards.referrerCredits } },
        });
        return NextResponse.json({ success: true, rewarded: rewards.referrerCredits });
      }

      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
