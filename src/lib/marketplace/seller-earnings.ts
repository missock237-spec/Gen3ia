/**
 * Système de commissions Marketplace — 100% Stripe avec retraits instantanés
 *
 * - 30% commission Genova (plateforme)
 * - 70% reversé instantanément au vendeur via Stripe Connect
 * - Les vendeurs recoivent leur argent en temps réel sur Stripe
 */

import { db } from '@/lib/db';
import { stripe } from '@/lib/billing/stripe-client';
import { createLogger } from '@/lib/logger';

const log = createLogger('seller-earnings');

// ============================================================
// Constants
// ============================================================

export const PLATFORM_COMMISSION_RATE = 0.30;
export const SELLER_REVENUE_RATE = 0.70;

// ============================================================
// Types
// ============================================================

export interface SellerProfile {
  userId: string;
  totalSales: number;
  totalRevenue: number;
  totalCommission: number;
  balance: number;
  balanceCredits: number;
  totalListings: number;
  activeListings: number;
  averageRating: number;
  stripeAccountId: string | null;
  stripeOnboarded: boolean;
  stripeLink: string | null;
  instantPayoutEnabled: boolean;
  lastPayoutAt: Date | null;
}

export interface SaleTransaction {
  id: string;
  listingId: string;
  listingName: string;
  buyerName: string;
  amount: number;
  platformCommission: number;
  sellerRevenue: number;
  status: string;
  createdAt: Date;
}

// ============================================================
// Commission Calculation
// ============================================================

export function calculateCommission(priceCredits: number): {
  priceUsd: number;
  platformCommission: number;
  sellerRevenue: number;
} {
  const priceUsd = priceCredits * 0.01;
  const platformCommission = Math.round(priceUsd * PLATFORM_COMMISSION_RATE * 100) / 100;
  const sellerRevenue = Math.round(priceUsd * SELLER_REVENUE_RATE * 100) / 100;
  return { priceUsd, platformCommission, sellerRevenue };
}

// ============================================================
// Stripe Connect — Compte vendeur
// ============================================================

export async function getOrCreateStripeConnectAccount(userId: string): Promise<{
  accountId: string;
  onboardingLink: string;
  isOnboarded: boolean;
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, stripeConnectAccountId: true, stripeConnectOnboarded: true },
  });

  if (!user) throw new Error('Utilisateur introuvable');

  if (user.stripeConnectAccountId) {
    if (user.stripeConnectOnboarded) {
      const link = await stripe().accountLinks.create({
        account: user.stripeConnectAccountId,
        refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller`,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller?onboarding=complete`,
        type: 'account_onboarding',
      });
      return { accountId: user.stripeConnectAccountId, onboardingLink: link.url, isOnboarded: true };
    }

    const link = await stripe().accountLinks.create({
      account: user.stripeConnectAccountId,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller?onboarding=complete`,
      type: 'account_onboarding',
    });
    return { accountId: user.stripeConnectAccountId, onboardingLink: link.url, isOnboarded: false };
  }

  // Créer un compte Stripe Connect avec capacités de paiement instantané
  const account = await stripe().accounts.create({
    type: 'express',
    country: 'FR',
    email: user.email,
    business_type: 'individual',
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: true },
    },
    metadata: { userId },
  });

  await db.user.update({
    where: { id: userId },
    data: { stripeConnectAccountId: account.id },
  });

  const link = await stripe().accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller?onboarding=complete`,
    type: 'account_onboarding',
  });

  log.info('Compte Stripe Connect créé', { userId, accountId: account.id });

  return { accountId: account.id, onboardingLink: link.url, isOnboarded: false };
}

export async function handleStripeConnectOnboarding(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { stripeConnectAccountId: true },
  });

  if (!user?.stripeConnectAccountId) return false;

  try {
    const account = await stripe().accounts.retrieve(user.stripeConnectAccountId);
    const onboarded = !!(account.details_submitted && account.charges_enabled);

    await db.user.update({
      where: { id: userId },
      data: {
        stripeConnectOnboarded: onboarded,
        stripeConnectDetailsSubmitted: !!account.details_submitted,
        stripeConnectChargesEnabled: !!account.charges_enabled,
        stripeConnectPayoutsEnabled: !!account.payouts_enabled,
        stripeConnectCountry: account.country || null,
        stripeConnectCurrency: account.default_currency || null,
        stripeConnectLastSyncedAt: new Date(),
      },
    });

    return onboarded;
  } catch {
    return false;
  }
}

// ============================================================
// Paiement instantané au vendeur après achat
// ============================================================

/**
 * Crée une session de checkout Stripe pour l'achat marketplace
 * et prépare le transfert instantané vers le vendeur
 */
export async function createMarketplaceCheckoutSession(
  listingId: string,
  buyerId: string,
): Promise<{ sessionId: string; url: string }> {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    include: { user: { select: { stripeConnectAccountId: true, name: true } } },
  });

  if (!listing) throw new Error('Annonce introuvable');
  if (listing.userId === buyerId) throw new Error('Vous ne pouvez pas acheter votre propre annonce');
  if (listing.price <= 0) throw new Error('Les annonces gratuites ne nécessitent pas de paiement');

  const { priceUsd, platformCommission, sellerRevenue } = calculateCommission(listing.price);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const customerId = await getOrCreateStripeCustomer(buyerId);

  // Créer la session de checkout avec transfert instantané
  const session = await stripe().checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: listing.name,
            description: listing.description?.substring(0, 100) || '',
          },
          unit_amount: Math.round(priceUsd * 100),
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      metadata: {
        type: 'marketplace_purchase',
        listingId,
        buyerId,
        sellerId: listing.userId,
        sellerRevenue: sellerRevenue.toString(),
        platformCommission: platformCommission.toString(),
        priceCredits: listing.price.toString(),
        // On stocke l'ID du compte Stripe Connect pour le transfert
        sellerStripeAccountId: listing.user.stripeConnectAccountId || '',
      },
      // Transfert instantané vers le vendeur dès que le paiement est confirmé
      ...(listing.user.stripeConnectAccountId
        ? {
            transfer_data: {
              destination: listing.user.stripeConnectAccountId,
              amount: Math.round(sellerRevenue * 100), // 70% directement au vendeur
            },
          }
        : {}),
    },
    success_url: `${appUrl}/marketplace?purchase=success&listingId=${listingId}`,
    cancel_url: `${appUrl}/marketplace?purchase=cancel`,
  });

  log.info('Session checkout marketplace créée', {
    listingId,
    buyerId,
    priceUsd,
    sellerRevenue,
    sessionId: session.id,
  });

  return { sessionId: session.id, url: session.url || '' };
}

// ============================================================
// Retrait instantané des gains
// ============================================================

/**
 * Retrait instantané des gains du vendeur vers son compte bancaire
 * via Stripe Connect Instant Payouts
 */
export async function requestInstantPayout(userId: string): Promise<{
  success: boolean;
  message: string;
  amount?: number;
  payoutId?: string;
}> {
  const profile = await getSellerProfile(userId);

  if (profile.balance < 1) {
    return { success: false, message: `Solde insuffisant: ${profile.balance.toFixed(2)}$ (minimum: 1$).` };
  }

  if (!profile.stripeAccountId) {
    return { success: false, message: 'Connectez d\'abord votre compte Stripe.' };
  }

  if (!profile.stripeOnboarded) {
    return { success: false, message: 'Finalisez votre inscription Stripe.' };
  }

  if (!profile.instantPayoutEnabled) {
    return {
      success: false,
      message: 'Les paiements instantanés nécessitent une carte de débit éligible. ' +
        'Connectez une carte dans votre dashboard Stripe pour activer cette fonctionnalité.'
    };
  }

  try {
    // Créer un payout instantané via Stripe Connect
    // Les fonds sont envoyés directement sur la carte de débit du vendeur
    const payout = await stripe().payouts.create(
      {
        amount: Math.round(profile.balance * 100), // Stripe en cents
        currency: 'usd',
        method: 'instant', // Paiement instantané !
        statement_descriptor: 'GENOVA PAYOUT',
        metadata: {
          userId,
          type: 'seller_instant_payout',
        },
      },
      {
        stripeAccount: profile.stripeAccountId, // Compte Connect du vendeur
      },
    );

    // Marquer les transactions comme retirées
    await db.sellerTransaction.updateMany({
      where: { sellerId: userId, status: 'completed', withdrawnAt: null },
      data: {
        withdrawnAt: new Date(),
        withdrawalMethod: 'stripe_instant',
        withdrawalId: payout.id,
      },
    });

    log.info('Paiement instantané effectué', {
      userId,
      amount: profile.balance,
      payoutId: payout.id,
      status: payout.status,
    });

    return {
      success: true,
      message: `✅ ${profile.balance.toFixed(2)}$ envoyés instantanément sur votre carte bancaire ! 🚀`,
      amount: profile.balance,
      payoutId: payout.id,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    log.error('Échec paiement instantané', {
      userId,
      error: errorMsg,
    });

    // Si l'instant payout échoue (carte non éligible), on tombe en payout standard
    if (errorMsg.includes('instant') || errorMsg.includes('card')) {
      try {
        const payout = await stripe().payouts.create(
          {
            amount: Math.round(profile.balance * 100),
            currency: 'usd',
            method: 'standard', // Paiement standard (2-7 jours)
            statement_descriptor: 'GENOVA PAYOUT',
          },
          { stripeAccount: profile.stripeAccountId },
        );

        await db.sellerTransaction.updateMany({
          where: { sellerId: userId, status: 'completed', withdrawnAt: null },
          data: { withdrawnAt: new Date(), withdrawalMethod: 'stripe_standard', withdrawalId: payout.id },
        });

        return {
          success: true,
          message: `✅ ${profile.balance.toFixed(2)}$ en cours d\'envoi (virement standard 2-7 jours).`,
          amount: profile.balance,
          payoutId: payout.id,
        };
      } catch {
        return {
          success: false,
          message: `Impossible de traiter le paiement. Veuillez vérifier vos informations bancaires Stripe.`,
        };
      }
    }

    return { success: false, message: `Erreur: ${errorMsg.substring(0, 200)}` };
  }
}

// ============================================================
// Seller Profile & Stats
// ============================================================

export async function getSellerProfile(userId: string): Promise<SellerProfile> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      stripeConnectAccountId: true,
      stripeConnectOnboarded: true,
    },
  });

  const [listings, transactions, reviews] = await Promise.all([
    db.marketplaceListing.findMany({ where: { userId }, select: { id: true, isActive: true } }),
    db.sellerTransaction.findMany({
      where: { sellerId: userId, status: 'completed' },
      select: { sellerRevenue: true, platformCommission: true, createdAt: true },
    }),
    db.marketplaceReview.findMany({
      where: { listing: { userId } },
      select: { rating: true },
    }),
  ]);

  const totalRevenue = transactions.reduce((sum, t) => sum + t.sellerRevenue, 0);
  const totalCommission = transactions.reduce((sum, t) => sum + t.platformCommission, 0);

  const withdrawn = await db.sellerTransaction.aggregate({
    where: { sellerId: userId, status: 'completed', withdrawnAt: { not: null } },
    _sum: { sellerRevenue: true },
  });

  const balance = Math.max(0, totalRevenue - (withdrawn._sum.sellerRevenue || 0));
  const balanceCredits = Math.round(balance / 0.01);

  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  // Vérifier si l'instantané est disponible
  let instantPayoutEnabled = false;
  let stripeLink: string | null = null;

  if (user?.stripeConnectAccountId && user.stripeConnectOnboarded) {
    try {
      const account = await stripe().accounts.retrieve(user.stripeConnectAccountId);
      // Vérifier si l'instantané est activé (carte de débit éligible)
      const externalAccounts = account.external_accounts?.data || [];
      instantPayoutEnabled = externalAccounts.some(
        (acc: { object?: string; card?: Record<string, unknown> }) =>
          acc.object === 'card' || (acc as Record<string, unknown>)?.card !== undefined
      );

      const loginLink = await stripe().accounts.createLoginLink(user.stripeConnectAccountId);
      stripeLink = loginLink.url;
    } catch { /* ignore */ }
  }

  return {
    userId,
    totalSales: transactions.length,
    totalRevenue,
    totalCommission,
    balance,
    balanceCredits,
    totalListings: listings.length,
    activeListings: listings.filter(l => l.isActive).length,
    averageRating,
    stripeAccountId: user?.stripeConnectAccountId || null,
    stripeOnboarded: user?.stripeConnectOnboarded || false,
    stripeLink,
    instantPayoutEnabled,
    lastPayoutAt: transactions.length > 0 ? transactions[0].createdAt : null,
  };
}

// ============================================================
// Ventes
// ============================================================

export async function recordSale(
  listingId: string,
  buyerId: string,
  priceCredits: number,
): Promise<{ success: boolean; sellerRevenueUsd: number; platformCommissionUsd: number; message: string }> {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    select: { userId: true, name: true, price: true },
  });

  if (!listing) return { success: false, sellerRevenueUsd: 0, platformCommissionUsd: 0, message: 'Annonce introuvable' };
  if (listing.userId === buyerId) return { success: false, sellerRevenueUsd: 0, platformCommissionUsd: 0, message: 'Achat personnel impossible' };

  const { priceUsd, platformCommission, sellerRevenue } = calculateCommission(priceCredits);

  await db.marketplacePurchase.updateMany({
    where: { listingId, userId: buyerId, status: 'completed' },
    data: { sellerRevenue, platformCommission, transferStatus: 'completed' },
  });

  await db.sellerTransaction.create({
    data: {
      sellerId: listing.userId,
      buyerId,
      listingId,
      listingName: listing.name,
      amountCredits: priceCredits,
      amountUsd: priceUsd,
      platformCommission,
      sellerRevenue,
      status: 'completed',
    },
  });

  log.info('Vente enregistrée', { sellerId: listing.userId, buyerId, priceUsd, sellerRevenue });

  return {
    success: true,
    sellerRevenueUsd: sellerRevenue,
    platformCommissionUsd: platformCommission,
    message: `Vente réussie ! ${sellerRevenue.toFixed(2)}$ pour le vendeur`,
  };
}

export async function getSellerSalesHistory(userId: string, limit = 20): Promise<SaleTransaction[]> {
  const transactions = await db.sellerTransaction.findMany({
    where: { sellerId: userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return transactions.map(t => ({
    id: t.id,
    listingId: t.listingId,
    listingName: t.listingName,
    buyerName: t.buyerName || 'Acheteur',
    amount: t.amountUsd,
    platformCommission: t.platformCommission,
    sellerRevenue: t.sellerRevenue,
    status: t.status,
    createdAt: t.createdAt,
  }));
}

// ============================================================
// Helper: Stripe Customer
// ============================================================

async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const existing = await db.subscription.findFirst({
    where: { userId, stripeCustomerId: { not: null } },
    select: { stripeCustomerId: true },
  });

  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user) throw new Error('Utilisateur introuvable');

  const customer = await stripe().customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId },
  });

  return customer.id;
}
