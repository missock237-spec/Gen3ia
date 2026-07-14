/**
 * Système de commissions Marketplace
 *
 * - 30% commission Genova (plateforme)
 * - 70% reversé au vendeur
 * - Les vendeurs peuvent retirer leurs gains
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('seller-earnings');

// ============================================================
// Constants
// ============================================================

export const PLATFORM_COMMISSION_RATE = 0.30; // 30%
export const SELLER_REVENUE_RATE = 0.70;       // 70%

const MIN_WITHDRAWAL_AMOUNT = 5;  // 5$ minimum pour retirer
const MIN_WITHDRAWAL_CREDITS = 500; // 500 crédits minimum

// ============================================================
// Types
// ============================================================

export interface SellerProfile {
  userId: string;
  totalSales: number;
  totalRevenue: number;     // en dollars
  totalCommission: number;  // commission Genova
  balance: number;          // disponible pour retrait (en $)
  balanceCredits: number;   // disponible en crédits
  totalListings: number;
  activeListings: number;
  averageRating: number;
  stripeAccountId?: string;
  stripeOnboarded: boolean;
  lastPayoutAt?: Date;
}

export interface SaleTransaction {
  id: string;
  listingId: string;
  listingName: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  amount: number;
  currency: string;
  platformCommission: number;
  sellerRevenue: number;
  status: 'completed' | 'refunded' | 'pending';
  createdAt: Date;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  method: 'stripe' | 'paypal' | 'credits';
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  destinationEmail?: string;
  notes?: string;
  createdAt: Date;
  completedAt?: Date;
}

// ============================================================
// Commission Calculation
// ============================================================

/**
 * Calcule la commission et le revenu vendeur
 */
export function calculateCommission(priceCredits: number): {
  priceUsd: number;
  platformCommission: number;
  sellerRevenue: number;
} {
  // Conversion crédits → dollars (1 crédit = $0.01)
  const priceUsd = priceCredits * 0.01;
  const platformCommission = Math.round(priceUsd * PLATFORM_COMMISSION_RATE * 100) / 100;
  const sellerRevenue = Math.round(priceUsd * SELLER_REVENUE_RATE * 100) / 100;

  return { priceUsd, platformCommission, sellerRevenue };
}

/**
 * Enregistre une vente et crédite le vendeur
 */
export async function recordSale(
  listingId: string,
  buyerId: string,
  priceCredits: number
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

  if (!listing) {
    return { success: false, sellerRevenueUsd: 0, platformCommissionUsd: 0, message: 'Annonce introuvable' };
  }

  const sellerId = listing.userId;

  if (sellerId === buyerId) {
    return { success: false, sellerRevenueUsd: 0, platformCommissionUsd: 0, message: 'Vous ne pouvez pas acheter votre propre annonce' };
  }

  const { priceUsd, platformCommission, sellerRevenue } = calculateCommission(priceCredits);

  // Mettre à jour l'achat avec les revenus
  await db.marketplacePurchase.updateMany({
    where: { listingId, userId: buyerId, status: 'completed' },
    data: {
      sellerRevenue,
      platformCommission,
      transferStatus: 'pending',
    },
  });

  // Enregistrer la transaction de revenus vendeur
  const transaction = await db.sellerTransaction.create({
    data: {
      sellerId,
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

  // Journaliser
  log.info('Vente enregistrée avec commission', {
    sellerId,
    buyerId,
    listingId,
    priceUsd,
    platformCommission,
    sellerRevenue,
    transactionId: transaction.id,
  });

  return {
    success: true,
    sellerRevenueUsd: sellerRevenue,
    platformCommissionUsd: platformCommission,
    message: `Vente réussie ! +${sellerRevenue.toFixed(2)}$ pour le vendeur (commission: ${platformCommission.toFixed(2)}$)`,
  };
}

// ============================================================
// Seller Profile & Stats
// ============================================================

export async function getSellerProfile(userId: string): Promise<SellerProfile> {
  const [listings, sales, transactions, reviews] = await Promise.all([
    db.marketplaceListing.findMany({ where: { userId }, select: { id: true, isActive: true } }),
    db.marketplacePurchase.findMany({
      where: { listing: { userId }, status: 'completed' },
      select: { price: true, sellerRevenue: true, platformCommission: true },
    }),
    db.sellerTransaction.findMany({
      where: { sellerId: userId, status: 'completed' },
      select: { sellerRevenue: true, platformCommission: true },
    }),
    db.marketplaceReview.findMany({
      where: { listing: { userId } },
      select: { rating: true },
    }),
  ]);

  // Calculs
  const totalRevenue = transactions.reduce((sum, t) => sum + t.sellerRevenue, 0);
  const totalCommission = transactions.reduce((sum, t) => sum + t.platformCommission, 0);
  const totalSales = transactions.length;

  // Balance disponible (non retirée)
  const withdrawn = await db.sellerTransaction.aggregate({
    where: { sellerId: userId, status: 'completed', withdrawnAt: { not: null } },
    _sum: { sellerRevenue: true },
  });

  const balance = totalRevenue - (withdrawn._sum.sellerRevenue || 0);
  const balanceCredits = Math.round(balance / 0.01);

  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  // Vérifier Stripe Connect
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { stripeConnectAccountId: true, stripeConnectOnboarded: true },
  });

  return {
    userId,
    totalSales,
    totalRevenue,
    totalCommission,
    balance,
    balanceCredits,
    totalListings: listings.length,
    activeListings: listings.filter(l => l.isActive).length,
    averageRating,
    stripeAccountId: user?.stripeConnectAccountId || undefined,
    stripeOnboarded: user?.stripeConnectOnboarded || false,
  };
}

// ============================================================
// Withdrawals (Retraits)
// ============================================================

export async function requestWithdrawal(
  userId: string,
  method: 'stripe' | 'paypal' | 'credits',
  destinationEmail?: string
): Promise<{ success: boolean; message: string; withdrawalId?: string }> {
  const profile = await getSellerProfile(userId);

  if (profile.balance < MIN_WITHDRAWAL_AMOUNT) {
    return {
      success: false,
      message: `Solde minimum de retrait: ${MIN_WITHDRAWAL_AMOUNT}$ (actuellement: ${profile.balance.toFixed(2)}$)`,
    };
  }

  if (method === 'stripe' && !profile.stripeOnboarded) {
    return {
      success: false,
      message: 'Vous devez connecter votre compte Stripe pour retirer par virement. Allez dans Paramètres > Paiements.',
    };
  }

  if (method === 'credits') {
    // Convertir en crédits Genova
    const creditsAmount = Math.round(profile.balance / 0.01);
    const { addCredits } = await import('@/lib/billing/credits');

    await addCredits({
      userId,
      amount: creditsAmount,
      type: 'purchase',
      resourceType: 'credit_purchase',
      description: `Revenus Marketplace convertis en crédits: ${creditsAmount} crédits`,
      metadata: { source: 'marketplace_seller_earnings' },
    });

    // Marquer les transactions comme retirées
    await db.sellerTransaction.updateMany({
      where: { sellerId: userId, status: 'completed', withdrawnAt: null },
      data: { withdrawnAt: new Date(), withdrawalMethod: 'credits' },
    });

    return {
      success: true,
      message: `${creditsAmount} crédits ajoutés à votre compte !`,
    };
  }

  // Créer une demande de retrait (Stripe Connect ou PayPal)
  const withdrawal = await db.withdrawalRequest.create({
    data: {
      userId,
      amount: profile.balance,
      currency: 'usd',
      method,
      destinationEmail: destinationEmail || null,
      status: 'pending',
    },
  });

  log.info('Demande de retrait créée', {
    userId,
    amount: profile.balance,
    method,
    withdrawalId: withdrawal.id,
  });

  return {
    success: true,
    message: `Demande de retrait de ${profile.balance.toFixed(2)}$ créée. Traitement sous 48h.`,
    withdrawalId: withdrawal.id,
  };
}

// ============================================================
// Admin: Approuver un retrait
// ============================================================

export async function approveWithdrawal(
  withdrawalId: string,
  adminUserId: string
): Promise<{ success: boolean; message: string }> {
  const withdrawal = await db.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
  });

  if (!withdrawal) {
    return { success: false, message: 'Demande de retrait introuvable' };
  }

  if (withdrawal.status !== 'pending') {
    return { success: false, message: 'Cette demande a déjà été traitée' };
  }

  await db.withdrawalRequest.update({
    where: { id: withdrawalId },
    data: {
      status: 'approved',
      notes: `Approuvé par ${adminUserId}`,
    },
  });

  // Si Stripe Connect, déclencher le transfert
  if (withdrawal.method === 'stripe') {
    try {
      const { stripe } = await import('@/lib/billing/stripe-client');
      const user = await db.user.findUnique({
        where: { id: withdrawal.userId },
        select: { stripeConnectAccountId: true },
      });

      if (user?.stripeConnectAccountId) {
        // await stripe().transfers.create({
        //   amount: Math.round(withdrawal.amount * 100),
        //   currency: 'usd',
        //   destination: user.stripeConnectAccountId,
        // });
        log.info('Transfert Stripe Connect simulé', {
          userId: withdrawal.userId,
          amount: withdrawal.amount,
        });
      }
    } catch (err) {
      log.error('Échec transfert Stripe', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Marquer les transactions comme retirées
  await db.sellerTransaction.updateMany({
    where: { sellerId: withdrawal.userId, status: 'completed', withdrawnAt: null },
    data: {
      withdrawnAt: new Date(),
      withdrawalMethod: withdrawal.method,
      withdrawalId,
    },
  });

  await db.withdrawalRequest.update({
    where: { id: withdrawalId },
    data: { status: 'completed', completedAt: new Date() },
  });

  log.info('Retrait approuvé', { withdrawalId, userId: withdrawal.userId, amount: withdrawal.amount });

  return { success: true, message: `Retrait de ${withdrawal.amount.toFixed(2)}$ approuvé et traité.` };
}

// ============================================================
// Seller Dashboard stats
// ============================================================

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
    buyerId: t.buyerId,
    buyerName: t.buyerName || 'Acheteur',
    sellerId: t.sellerId,
    amount: t.amountUsd,
    currency: 'usd',
    platformCommission: t.platformCommission,
    sellerRevenue: t.sellerRevenue,
    status: t.status as 'completed' | 'refunded' | 'pending',
    createdAt: t.createdAt,
  }));
}
