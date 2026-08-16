// Webhook Billing - Chariow (unique passerelle de paiement)
// Declenche: credit utilisateur, creation abonnement, bonus affiliation
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCreditEngine } from '@/lib/billing/credit-engine';
import { chariow } from '@/lib/payment/chariow';

export const dynamic = "force-dynamic";
const creditEngine = getCreditEngine();

// ============================================================
// Declencher le bonus d'affiliation apres achat abonnement
// ============================================================

async function triggerAffiliateBonus(userId: string, plan: string) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return;

    const referral = await prisma.affiliateReferral.findFirst({
      where: { referredEmail: user.email, status: { in: ['pending', 'subscribed'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!referral) return;
    if (referral.status === 'rewarded') return;

    const premiumPlans = ['starter', 'pro', 'enterprise', 'premium'];
    if (!premiumPlans.includes(plan)) return;

    await prisma.affiliateReferral.update({
      where: { id: referral.id },
      data: { referredUserId: userId, status: 'subscribed', subscribedAt: new Date() },
    });

    const REWARD_REFERRER = 500;
    const REWARD_REFERRED = 250;

    await creditEngine.creditUser(referral.referrerUserId, REWARD_REFERRER,
      `Bonus parrainage - ${user.email} a souscrit a ${plan}`);
    await creditEngine.creditUser(userId, REWARD_REFERRED,
      `Bonus bienvenue parrainage - offre ${plan}`);

    await prisma.affiliateReferral.update({
      where: { id: referral.id },
      data: { status: 'rewarded', rewardCredits: REWARD_REFERRER, isRewarded: true, rewardedAt: new Date() },
    });

    await prisma.affiliateCode.update({
      where: { code: referral.referralCode },
      data: { totalRewards: { increment: REWARD_REFERRER } },
    });
  } catch (err) {
    console.error('[AffiliateBonus] Erreur:', err);
  }
}

// ============================================================
// Creer/Mettre a jour l'abonnement
// ============================================================

async function updateSubscription(userId: string, plan: string, _metadata?: any) {
  await prisma.subscription.upsert({
    where: { userId },
    create: { userId, plan, status: 'active', provider: 'chariow', startDate: new Date() },
    update: { plan, status: 'active', provider: 'chariow' },
  });

  await prisma.user.update({ where: { id: userId }, data: { plan } });
}

// ============================================================
// POST /api/billing/webhook
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    const signature = request.headers.get('x-chariow-signature') || request.headers.get('x-signature') || '';

    let payload: any;
    try { payload = JSON.parse(raw); } catch {
      return NextResponse.json({ error: 'Payload JSON invalide' }, { status: 400 });
    }

    const isValid = chariow.verifyWebhookSignature(raw, signature);
    if (!isValid) {
      return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
    }

    const sale = payload.data ?? payload;
    const event = payload.event || '';
    const status = sale.status || '';

    const isSuccess =
      event.includes('sale.completed') ||
      event.includes('payment.received') ||
      status === 'completed';

    if (!isSuccess) {
      if (event.includes('failed') || status === 'failed') {
        console.error('[Chariow] Paiement echoue:', { saleId: sale.id, reason: sale.reason });
        return NextResponse.json({ received: true, status: 'failed' });
      }
      return NextResponse.json({ received: true, event });
    }

    const metadata = sale.metadata ?? {};
    const userId = metadata.userId || sale.userId || sale.client_reference;
    const plan = metadata.planId || sale.plan || 'pro';
    const credits = parseInt(metadata.credits || sale.credits || '0', 10);
    const transactionId = sale.id || payload.id || '';

    if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

    if (credits > 0) {
      await creditEngine.creditUser(userId, credits,
        `Achat ${credits} credits (Chariow - ${sale.operator || 'Mobile Money'})`);
    }

    await updateSubscription(userId, plan, metadata);
    await triggerAffiliateBonus(userId, plan);

    await prisma.activityLog.create({
      data: {
        action: credits > 0 ? 'CREDITS_PURCHASED' : 'SUBSCRIPTION_PURCHASED',
        details: JSON.stringify({ provider: 'chariow', plan, credits, transactionId, saleId: sale.id }),
        category: 'billing',
        userId,
      },
    });

    return NextResponse.json({ received: true, provider: 'chariow', credited: credits > 0, plan, affiliationChecked: true });
  } catch (error: any) {
    console.error('[Webhook] Erreur:', error);
    return NextResponse.json({ error: 'Erreur webhook', message: error.message }, { status: 500 });
  }
}
