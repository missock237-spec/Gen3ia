/**
 * Stripe Marketplace Service — Stripe Connect Integration
 *
 * Handles:
 * - Seller onboarding (Stripe Connect Express)
 * - Checkout sessions with transfers (80/20 split)
 * - Webhook processing for marketplace events
 * - Refunds and payout tracking
 */

import Stripe from 'stripe';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('stripe-marketplace');

// ---------------------------------------------------------------------------
// Stripe Instance
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set');
  }

  _stripe = new Stripe(key, {
    apiVersion: '2025-01-27-ac' as any, // Latest stable
    typescript: true,
  });

  return _stripe;
}

// Commission rate (20%)
const PLATFORM_FEE_PERCENT = 0.20;

// ---------------------------------------------------------------------------
// Seller Onboarding
// ---------------------------------------------------------------------------

/**
 * Create or retrieve a Stripe Connect account for a seller
 */
export async function getOrCreateSellerAccount(userId: string) {
  let sellerProfile = await db.sellerProfile.findUnique({
    where: { userId },
  });

  if (!sellerProfile) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    // Create Stripe Connect Express account
    const account = await getStripe().accounts.create({
      type: 'express',
      country: 'FR', // Default to FR, but should be configurable
      email: user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      settings: {
        payouts: {
          schedule: {
            interval: 'manual',
          },
        },
      },
      metadata: { userId },
    });

    sellerProfile = await db.sellerProfile.create({
      data: {
        userId,
        stripeAccountId: account.id,
        status: 'onboarding',
      },
    });
  }

  return sellerProfile;
}

/**
 * Create an onboarding link for Stripe Connect
 */
export async function createOnboardingLink(userId: string, returnUrl: string) {
  const profile = await getOrCreateSellerAccount(userId);
  if (!profile.stripeAccountId) throw new Error('No Stripe account ID');

  const accountLink = await getStripe().accountLinks.create({
    account: profile.stripeAccountId,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/marketplace/seller/onboard?refresh=true`,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return accountLink.url;
}

/**
 * Sync seller profile with Stripe account status
 */
export async function syncSellerAccount(userId: string) {
  const profile = await db.sellerProfile.findUnique({
    where: { userId },
  });

  if (!profile?.stripeAccountId) return null;

  const account = await getStripe().accounts.retrieve(profile.stripeAccountId);

  return await db.sellerProfile.update({
    where: { userId },
    data: {
      onboardingComplete: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
      status: account.charges_enabled ? 'active' : 'onboarding',
      country: account.country,
      businessType: account.business_type || 'individual',
    },
  });
}

// ---------------------------------------------------------------------------
// Checkout Flow
// ---------------------------------------------------------------------------

/**
 * Create a checkout session for a marketplace listing
 */
export async function createMarketplaceCheckoutSession(params: {
  userId: string;
  listingId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const { userId, listingId, successUrl, cancelUrl } = params;

  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    include: { user: { include: { sellerProfile: true } } },
  });

  if (!listing) throw new Error('Listing not found');
  if (listing.price <= 0) throw new Error('Cannot purchase free listing via Stripe');

  const sellerProfile = listing.user.sellerProfile;
  if (!sellerProfile || !sellerProfile.stripeAccountId || !sellerProfile.chargesEnabled) {
    throw new Error('Seller is not configured to receive payments');
  }

  // Calculate platform fee
  const amount = Math.round(listing.price * 100); // Amount in cents
  const platformFee = Math.round(amount * PLATFORM_FEE_PERCENT);

  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: listing.currency.toLowerCase(),
          product_data: {
            name: listing.name,
            description: listing.description.substring(0, 255),
            images: listing.previewUrl ? [listing.previewUrl] : [],
            metadata: { listingId },
          },
          unit_amount: amount,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFee,
      transfer_data: {
        destination: sellerProfile.stripeAccountId,
      },
      metadata: {
        userId,
        listingId,
        sellerId: sellerProfile.id,
      },
    },
    metadata: {
      userId,
      listingId,
      sellerId: sellerProfile.id,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  return session;
}

// ---------------------------------------------------------------------------
// Webhook Logic
// ---------------------------------------------------------------------------

/**
 * Process a completed checkout session for the marketplace
 */
export async function handleMarketplaceCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { userId, listingId, sellerId } = session.metadata || {};

  if (!userId || !listingId || !sellerId) {
    log.error('Missing metadata in marketplace checkout', { sessionId: session.id });
    return;
  }

  const amount = (session.amount_total || 0) / 100;
  const currency = session.currency || 'usd';
  const platformFee = Math.round(amount * PLATFORM_FEE_PERCENT * 100) / 100;

  // Create transaction record
  const transaction = await db.marketplaceTransaction.create({
    data: {
      stripeSessionId: session.id,
      stripePaymentIntentId: session.payment_intent as string,
      listingId,
      buyerId: userId,
      sellerId,
      amount,
      currency,
      platformFee,
      sellerAmount: amount - platformFee,
      status: 'completed',
    },
  });

  // Grant access (create MarketplacePurchase)
  await db.marketplacePurchase.upsert({
    where: { userId_listingId: { userId, listingId } },
    create: {
      userId,
      listingId,
      transactionId: transaction.id,
      price: amount,
      currency,
      status: 'completed',
    },
    update: {
      transactionId: transaction.id,
      status: 'completed',
    },
  });

  // Update analytics
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await db.marketplaceAnalytics.upsert({
    where: {
      sellerId_listingId_date: {
        sellerId,
        listingId,
        date: today,
      },
    },
    create: {
      sellerId,
      listingId,
      date: today,
      sales: 1,
      revenue: amount,
      platformFees: platformFee,
    },
    update: {
      sales: { increment: 1 },
      revenue: { increment: amount },
      platformFees: { increment: platformFee },
    },
  });

  // Increment listing download/install count
  await db.marketplaceListing.update({
    where: { id: listingId },
    data: { downloads: { increment: 1 }, installCount: { increment: 1 } },
  });

  // Send notifications
  try {
    const { sendEmail } = await import('@/lib/email');
    const buyer = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    const listing = await db.marketplaceListing.findUnique({ where: { id: listingId }, select: { name: true } });
    const seller = await db.sellerProfile.findUnique({ where: { id: sellerId }, include: { user: { select: { email: true, name: true } } } });

    if (buyer && listing) {
      await sendEmail(buyer.email, `Achat réussi : ${listing.name}`, `
        <h1>Merci pour votre achat !</h1>
        <p>L'agent <strong>${listing.name}</strong> est maintenant disponible dans votre Workspace.</p>
        <p>Montant : ${amount}${currency.toUpperCase()}</p>
      `);
    }

    if (seller && listing) {
      await sendEmail(seller.user.email, `Nouvelle vente : ${listing.name}`, `
        <h1>Félicitations !</h1>
        <p>Vous avez vendu <strong>${listing.name}</strong>.</p>
        <p>Vos gains : ${amount - platformFee}${currency.toUpperCase()}</p>
      `);
    }
  } catch (e) {
    log.error('Failed to send marketplace notifications', { error: e });
  }

  log.info('Marketplace purchase completed', { transactionId: transaction.id, userId, listingId });
}

/**
 * Handle account updates from Stripe webhooks
 */
export async function handleStripeAccountUpdated(account: Stripe.Account) {
  const userId = account.metadata?.userId;
  if (!userId) return;

  await db.sellerProfile.update({
    where: { userId },
    data: {
      onboardingComplete: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
      status: account.charges_enabled ? 'active' : 'onboarding',
    },
  });

  log.info('Seller account status updated', { userId, accountId: account.id });
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

/**
 * Refund a marketplace transaction
 */
export async function refundMarketplaceTransaction(transactionId: string, reason?: string) {
  const transaction = await db.marketplaceTransaction.findUnique({
    where: { id: transactionId },
    include: { listing: true, buyer: true }
  });

  if (!transaction || !transaction.stripePaymentIntentId) {
    throw new Error('Transaction not found or not refundable via Stripe');
  }

  // Create refund in Stripe
  const refund = await getStripe().refunds.create({
    payment_intent: transaction.stripePaymentIntentId,
    reason: reason as any || 'requested_by_customer',
  });

  // Update local transaction status
  await db.marketplaceTransaction.update({
    where: { id: transactionId },
    data: { status: 'refunded' }
  });

  // Revoke access (delete purchase)
  await db.marketplacePurchase.deleteMany({
    where: {
      userId: transaction.buyerId,
      listingId: transaction.listingId
    }
  });

  // Create refund record
  await db.marketplaceRefund.create({
    data: {
      transactionId: transaction.id,
      stripeRefundId: refund.id,
      amount: transaction.amount,
      reason,
      status: 'completed'
    }
  });

  // Notify buyer
  try {
    const { sendEmail } = await import('@/lib/email');
    await sendEmail(transaction.buyer.email, `Remboursement effectué : ${transaction.listing.name}`, `
      <h1>Votre achat a été remboursé</h1>
      <p>Le montant de ${transaction.amount}${transaction.currency.toUpperCase()} a été recrédité sur votre moyen de paiement.</p>
      <p>L'accès à l'agent <strong>${transaction.listing.name}</strong> a été révoqué.</p>
    `);
  } catch (e) {
    log.error('Failed to send refund notification', { error: e });
  }

  return refund;
}
