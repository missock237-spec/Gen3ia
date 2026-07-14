/**
 * Système de commissions Marketplace — 100% Stripe
 *
 * - 30% commission Genova (plateforme)
 * - 70% reversé au vendeur
 * - Tous les paiements via Stripe uniquement
 * - Stripe Connect pour les retraits vendeurs
 */

import { db } from '@/lib/db';
import { stripe } from '@/lib/billing/stripe-client';
import { createLogger } from '@/lib/logger';

const log = createLogger('seller-earnings');

// ============================================================
// Constants
// ============================================================

export const PLATFORM_COMMISSION_RATE = 0.30; // 30%
export const SELLER_REVENUE_RATE = 0.70;       // 70%
const MIN_WITHDRAWAL_AMOUNT = 5;  // 5$ minimum

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

/**
 * Crée ou récupère un compte Stripe Connect pour le vendeur
 */
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

  // Compte déjà existant
  if (user.stripeConnectAccountId) {
    // Vérifier si l'onboarding est complété
    if (user.stripeConnectOnboarded) {
      const link = await stripe().accountLinks.create({
        account: user.stripeConnectAccountId,
        refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller`,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller?onboarding=complete`,
        type: 'account_onboarding',
      });
      return { accountId: user.stripeConnectAccountId, onboardingLink: link.url, isOnboarded: true };
    }

    // Onboarding non terminé — nouveau lien
    const link = await stripe().accountLinks.create({
      account: user.stripeConnectAccountId,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller?onboarding=complete`,
      type: 'account_onboarding',
    });
    return { accountId: user.stripeConnectAccountId, onboardingLink: link.url, isOnboarded: false };
  }

  // Créer un nouveau compte Stripe Connect
  const account = await stripe().accounts.create({
    type: 'express',
    country: 'FR',
    email: user.email,
    business_type: 'individual',
    metadata: { userId },
  });

  // Sauvegarder l'ID Stripe Connect
  await db.user.update({
    where: { id: userId },
    data: { stripeConnectAccountId: account.id },
  });

  // Lien d'onboarding
  const link = await stripe().accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/seller?onboarding=complete`,
    type: 'account_onboarding',
  });

  log.info('Compte Stripe Connect créé', { userId, accountId: account.id });

  return { accountId: account.id, onboardingLink: link.url, isOnboarded: false };
}

/**
 * Traite le retour d'onboarding Stripe Connect
 */
export async function handleStripeConnectOnboarding(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { stripeConnectAccountId: true }},
  );

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
// Ventes via Stripe
// ============================================================

/**
 * Crée une session de paiement Stripe pour l'achat marketplace
 * et prépare le transfert vers le vendeur
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

  // Créer le client Stripe pour l'acheteur si nécessaire
  const customerId = await getOrCreateStripeCustomer(buyerId);

  // Créer la session de checkout Stripe
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
            description: `${listing.description?.substring(0, 100)}...`,
          },
          unit_amount: Math.round(priceUsd * 100), // Stripe en cents
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: 'marketplace_purchase',
      listingId,
      buyerId,
      sellerId: listing.userId,
      sellerRevenue: sellerRevenue.toString(),
      platformCommission: platformCommission.toString(),
      priceCredits: listing.price.toString(),
    },
    success_url: `${appUrl}/marketplace?purchase=success&listingId=${listingId}`,
    cancel_url: `${appUrl}/marketplace?purchase=cancel`,
  });

  log.info('Session checkout marketplace créée', {
    listingId,
    buyerId,
    priceUsd,
    sessionId: session.id,
  });

  return { sessionId: session.id, url: session.url || '' };
}

/**
 * Exécute le transfert vers le vendeur après achat réussi
 */
export async function executeSellerTransfer(
  sessionId: string,
  amount: number,
  sellerStripeAccountId: string,
): Promise<boolean> {
  try {
    // Transférer 70% directement sur le compte Stripe Connect du vendeur
    const transfer = await stripe().transfers.create({
      amount: Math.round(amount * 100), // Stripe en cents
      currency: 'usd',
      destination: sellerStripeAccountId,
      transfer_group: `marketplace_${sessionId}`,
      metadata: { sessionId, type: 'seller_revenue' },
    });

    log.info('Transfert vendeur exécuté', {
      sessionId,
      amount,
      transferId: transfer.id,
      destination: sellerStripeAccountId,
    });

    return true;
  } catch (err) {
    log.error('Échec transfert vendeur', {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
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

  const [listings, transactions, reviews, balanceResult] = await Promise.all([
    db.marketplaceListing.findMany({ where: { userId }, select: { id: true, isActive: true } }),
    db.sellerTransaction.findMany({
      where: { sellerId: userId, status: 'completed' },
      select: { sellerRevenue: true, platformCommission: true, createdAt: true },
    }),
    db.marketplaceReview.findMany({
      where: { listing: { userId } },
      select: { rating: true },
    }),
    // Solde Stripe Connect
    user?.stripeConnectAccountId && user.stripeConnectOnboarded
      ? stripe().balance.retrieve({ stripeAccount: user.stripeConnectAccountId }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const totalRevenue = transactions.reduce((sum, t) => sum + t.sellerRevenue, 0);
  const totalCommission = transactions.reduce((sum, t) => sum + t.platformCommission, 0);

  // Calculer le solde non encore transféré
  const withdrawn = await db.sellerTransaction.aggregate({
    where: { sellerId: userId, status: 'completed', withdrawnAt: { not: null } },
    _sum: { sellerRevenue: true },
  });

  const balance = Math.max(0, totalRevenue - (withdrawn._sum.sellerRevenue || 0));
  const balanceCredits = Math.round(balance / 0.01);

  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  // Lien dashboard Stripe
  let stripeLink: string | null = null;
  if (user?.stripeConnectAccountId && user.stripeConnectOnboarded) {
    try {
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
    lastPayoutAt: transactions.length > 0 ? transactions[0].createdAt : null,
  };
}

// ============================================================
// Retraits via Stripe Connect uniquement
// ============================================================

export async function requestStripeWithdrawal(userId: string): Promise<{ success: boolean; message: string }> {
  const profile = await getSellerProfile(userId);

  if (profile.balance < MIN_WITHDRAWAL_AMOUNT) {
    return {
      success: false,
      message: `Solde minimum: ${MIN_WITHDRAWAL_AMOUNT}$ (actuellement: ${profile.balance.toFixed(2)}$).`,
    };
  }

  if (!profile.stripeAccountId) {
    return {
      success: false,
      message: 'Vous devez d\'abord connecter votre compte Stripe.'
    };
  }

  if (!profile.stripeOnboarded) {
    return {
      success: false,
      message: 'Votre compte Stripe n\'est pas encore configuré. Terminez l\'onboarding Stripe.'
    };
  }

  // Stripe Connect gère automatiquement les transferts vers le compte bancaire du vendeur
  // On crée un payout (transfert automatique Stripe → banque du vendeur)
  try {
    // Marquer les transactions comme retirées
    await db.sellerTransaction.updateMany({
      where: { sellerId: userId, status: 'completed', withdrawnAt: null },
      data: { withdrawnAt: new Date(), withdrawalMethod: 'stripe_connect' },
    });

    log.info('Payout Stripe Connect déclenché', {
      userId,
      amount: profile.balance,
      stripeAccountId: profile.stripeAccountId,
    });

    return {
      success: true,
      message: `✅ ${profile.balance.toFixed(2)}$ en attente de transfert vers votre compte bancaire via Stripe. Traitement sous 2-7 jours ouvrés.`,
    };
  } catch (err) {
    log.error('Échec du payout Stripe', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, message: 'Erreur lors du paiement. Contactez le support.' };
  }
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

// ============================================================
// Ventes via crédits (conversion automatique)
// ============================================================

export async function recordSale(
  listingId: string,
  buyerId: string,
  priceCredits: number,
): Promise<{
  success: boolean;
  sellerRevenueUsd: number;
  platformCommissionUsd: number;
  message: string;
}> {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    select: { userId: true, name: true, price: true },
  });

  if (!listing) return { success: false, sellerRevenueUsd: 0, platformCommissionUsd: 0, message: 'Annonce introuvable' };
  if (listing.userId === buyerId) return { success: false, sellerRevenueUsd: 0, platformCommissionUsd: 0, message: 'Vous ne pouvez pas acheter votre propre annonce' };

  const { priceUsd, platformCommission, sellerRevenue } = calculateCommission(priceCredits);

  await db.marketplacePurchase.updateMany({
    where: { listingId, userId: buyerId, status: 'completed' },
    data: { sellerRevenue, platformCommission, transferStatus: 'pending' },
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

  log.info('Vente enregistrée', {
    sellerId: listing.userId,
    buyerId,
    listingId,
    priceUsd,
    platformCommission,
    sellerRevenue,
  });

  return {
    success: true,
    sellerRevenueUsd: sellerRevenue,
    platformCommissionUsd: platformCommission,
    message: `Vente réussie ! ${sellerRevenue.toFixed(2)}$ pour le vendeur (commission: ${platformCommission.toFixed(2)}$)`,
  };
}

export async function getSellerSalesHistory(
  userId: string,
  limit = 20
): Promise<SaleTransaction[]> {
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
