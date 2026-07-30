// Webhook Billing - Stripe & SebPay (Mobile Money Afrique)
// Declenche: credit utilisateur, creation abonnement, bonus affiliation
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCreditEngine } from '@/lib/billing/credit-engine';

const creditEngine = getCreditEngine();
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const sebpayWebhookSecret = process.env.SEBPAY_WEBHOOK_SECRET || '';

// ============================================================
// SebPay: Verification de signature HMAC
// ============================================================

function verifySebpaySignature(payload: string, signature: string): boolean {
  if (!sebpayWebhookSecret) return process.env.NODE_ENV === 'development';
  try {
    const { createHmac, timingSafeEqual } = require('node:crypto');
    const expected = createHmac('sha256', sebpayWebhookSecret).update(payload).digest('hex');
    const sig = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    if (expected.length !== sig.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch { return false; }
}

// ============================================================
// Declencher le bonus d'affiliation apres achat abonnement
// ============================================================

async function triggerAffiliateBonus(userId: string, plan: string) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return;

    // Chercher un referral en attente pour cet email
    const referral = await prisma.affiliateReferral.findFirst({
      where: { referredEmail: user.email, status: { in: ['pending', 'subscribed'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!referral) return;
    if (referral.status === 'rewarded') return;

    // Verifier que le plan est premium
    const premiumPlans = ['starter', 'pro', 'enterprise', 'premium'];
    if (!premiumPlans.includes(plan)) return;

    // Marquer le filleul et crediter le parrain
    await prisma.affiliateReferral.update({
      where: { id: referral.id },
      data: { referredUserId: userId, status: 'subscribed', subscribedAt: new Date() },
    });

    const REWARD_REFERRER = 500;
    const REWARD_REFERRED = 250;

    // Crediter le parrain
    await creditEngine.creditUser(referral.referrerUserId, REWARD_REFERRER,
      `Bonus parrainage - ${user.email} a souscrit a ${plan}`);

    // Crediter le filleul
    await creditEngine.creditUser(userId, REWARD_REFERRED,
      `Bonus bienvenue parrainage - offre ${plan}`);

    // Marquer comme rewarde
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

async function updateSubscription(userId: string, plan: string, provider: string, metadata?: any) {
  await prisma.subscription.upsert({
    where: { userId },
    create: { userId, plan, status: 'active', provider, startDate: new Date() },
    update: { plan, status: 'active', provider },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { plan },
  });
}

// ============================================================
// POST /api/billing/webhook
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const contentType = request.headers.get('content-type') || '';
    const stripeSignature = request.headers.get('stripe-signature');
    const sebpaySignature = request.headers.get('x-sebpay-signature') || request.headers.get('x-signature') || '';

    // === DETECTION STRIPE ===
    if (stripeSignature && webhookSecret) {
      try {
        const Stripe = require('stripe');
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-02-24.acacia' });
        const event = stripe.webhooks.constructEvent(body, stripeSignature, webhookSecret);

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const userId = session.metadata?.userId;
          const credits = parseInt(session.metadata?.credits || '0');
          const plan = session.metadata?.plan || 'pro';

          if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });

          if (credits > 0) {
            await creditEngine.creditUser(userId, credits, 'Achat credits (Stripe)');
          }

          await updateSubscription(userId, plan, 'stripe');
          await triggerAffiliateBonus(userId, plan);

          await prisma.activityLog.create({
            data: { action: 'SUBSCRIPTION_PURCHASED', details: JSON.stringify({ provider: 'stripe', plan, credits, sessionId: session.id }), category: 'billing', userId },
          });
        }

        return NextResponse.json({ received: true, provider: 'stripe' });
      } catch (stripeErr: any) {
        console.error('[Stripe] Erreur:', stripeErr.message);
        // Fallthrough to SebPay check
      }
    }

    // === DETECTION SEBPAY (Mobile Money) ===
    if (sebpaySignature || contentType.includes('json')) {
      const isValid = verifySebpaySignature(body, sebpaySignature);
      if (!isValid && sebpayWebhookSecret) {
        return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
      }

      let payload: any;
      try { payload = JSON.parse(body); } catch { payload = { event: 'unknown', status: body }; }

      const event = payload.event || payload.type || 'payment.completed';
      const userId = payload.metadata?.userId || payload.userId || payload.client_reference;
      const plan = payload.metadata?.plan || payload.plan || 'pro';
      const credits = parseInt(payload.metadata?.credits || payload.credits || '0');
      const status = payload.status || payload.payment_status || 'completed';
      const transactionId = payload.transaction_id || payload.id || '';

      // Paiement complete
      if (event.includes('completed') || event.includes('succeeded') || status === 'completed') {
        if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });

        // Recuperer l'utilisateur pour verifier
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
        if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

        // Crediter si achat de credits
        if (credits > 0) {
          await creditEngine.creditUser(userId, credits,
            `Achat ${credits} credits (SebPay - ${payload.operator || 'Mobile Money'})`);
        }

        // Mettre a jour le plan/abonnement
        await updateSubscription(userId, plan, 'sebpay');

        // Declencher bonus affiliation
        await triggerAffiliateBonus(userId, plan);

        // Logger
        await prisma.activityLog.create({
          data: {
            action: credits > 0 ? 'CREDITS_PURCHASED' : 'SUBSCRIPTION_PURCHASED',
            details: JSON.stringify({ provider: 'sebpay', plan, credits, transactionId, operator: payload.operator }),
            category: 'billing',
            userId,
          },
        });

        return NextResponse.json({ received: true, provider: 'sebpay', credited: credits > 0, plan, affiliationChecked: true });
      }

      // Echec du paiement
      if (event.includes('failed') || status === 'failed') {
        console.error('[SebPay] Paiement echoue:', { userId, transactionId, reason: payload.reason });
        return NextResponse.json({ received: true, status: 'failed' });
      }

      return NextResponse.json({ received: true, event });
    }

    // === AUCUNE SIGNATURE VALIDE ===
    return NextResponse.json({ error: 'Signature webhook manquante' }, { status: 400 });

  } catch (error: any) {
    console.error('[Webhook] Erreur:', error);
    return NextResponse.json({ error: 'Erreur webhook', message: error.message }, { status: 500 });
  }
}
