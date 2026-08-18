// ============================================================
// CREATOR PAYOUTS — Monétisation des créateurs marketplace
// Commissions, reversements automatiques, historique
// ------------------------------------------------------------
// T28 — Migration 15% → 20% commission, 85% → 80% vendeur.
// Les payouts marketplace utilisent désormais le client Sebpay
// marketplace dédié (src/lib/payment/sebpay.ts), distinct de Chariow
// (qui reste utilisé pour les abonnements et crédits).
// ============================================================

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { sebpay } from '@/lib/sebpay';
import {
  sebpayMarketplace,
  MARKETPLACE_COMMISSION_RATE,
  MARKETPLACE_SELLER_RATE,
} from '@/lib/payment/sebpay';

const log = createLogger('creator-payouts');
/** Commission plateforme (20%) — alignée avec purchase-system.ts */
const PLATFORM_COMMISSION = MARKETPLACE_COMMISSION_RATE;
/** Part vendeur (80%) — alignée avec purchase-system.ts */
const SELLER_REVENUE_RATE = MARKETPLACE_SELLER_RATE;

export class CreatorPayoutService {
  async registerCreator(userId: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { isCreator: true } });
    log.info('creator_registered', { userId: userId.slice(0, 8) });
  }

  /**
   * Enregistre une vente marketplace (post-paiement buyer).
   * Calcule la part vendeur (80%) et la commission plateforme (20%).
   */
  async recordSale(listingId: string, buyerId: string, amount: number): Promise<{ creatorEarns: number; platformFees: number }> {
    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId }, select: { userId: true, price: true, commissionRate: true, revenue: true } });
    if (!listing) throw new Error('Listing not found');

    // Commission du listing peut surcharger le défaut (0.20) si l'admin l'a défini
    const commission = listing.commissionRate || PLATFORM_COMMISSION;
    const platformFees = Math.round(amount * commission);
    const creatorEarns = amount - platformFees;

    await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { revenue: (listing.revenue || 0) + creatorEarns, installCount: { increment: 1 } },
    });

    await prisma.user.update({
      where: { id: listing.userId },
      data: { creatorEarnings: { increment: creatorEarns } },
    });

    log.info('sale_recorded', { listingId: listingId.slice(0, 8), amount, creatorEarns, platformFees });
    return { creatorEarns, platformFees };
  }

  async getCreatorDashboard(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isCreator: true, creatorEarnings: true, creatorWithdrawn: true },
    });

    const listings = await prisma.marketplaceListing.findMany({
      where: { userId },
      select: { id: true, name: true, price: true, revenue: true, installCount: true, downloads: true, status: true },
      orderBy: { updatedAt: 'desc' },
    });

    const payouts = await prisma.creatorPayout.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const earnings = user?.creatorEarnings || 0;
    const withdrawn = user?.creatorWithdrawn || 0;

    return {
      isCreator: user?.isCreator || false,
      earnings,
      withdrawn,
      available: earnings - withdrawn,
      listings,
      payouts,
      commissionRate: PLATFORM_COMMISSION,
      sellerRate: SELLER_REVENUE_RATE,
    };
  }

  /**
   * Demande de retrait manuel créateur (le cas échéant — l'auto-payout
   * est déjà déclenché par Sebpay sur chaque achat). Sert pour les
   * montants accumulés ou les listings antérieurs à la T28.
   */
  async requestPayout(params: { userId: string; amount: number; phone: string; operator: string }) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { creatorEarnings: true, creatorWithdrawn: true },
    });

    const available = (user?.creatorEarnings || 0) - (user?.creatorWithdrawn || 0);
    if (params.amount > available) throw new Error('Solde insuffisant');
    if (params.amount < 2000) throw new Error('Montant minimum: 2 000 FCFA');

    const payout = await prisma.creatorPayout.create({
      data: {
        userId: params.userId,
        amount: params.amount,
        status: 'pending',
        method: 'sebpay',
        phone: params.phone,
        operator: params.operator,
        periodStart: new Date(Date.now() - 30 * 86400000),
        periodEnd: new Date(),
      },
    });

    await prisma.user.update({
      where: { id: params.userId },
      data: { creatorWithdrawn: { increment: params.amount } },
    });

    log.info('payout_requested', { userId: params.userId.slice(0, 8), amount: params.amount });
    return payout;
  }

  /**
   * Traite un payout créateur via le client Sebpay marketplace dédié.
   * (Avant T28, utilisait l'adapter Chariow via src/lib/sebpay.ts)
   */
  async processPayout(payoutId: string) {
    const payout = await prisma.creatorPayout.findUnique({ where: { id: payoutId } });
    if (!payout || payout.status !== 'pending') return;

    await prisma.creatorPayout.update({
      where: { id: payoutId },
      data: { status: 'processing' },
    });

    try {
      // Tenter le client marketplace Sebpay en premier (auto-payout).
      const result = await sebpayMarketplace.initiatePayout({
        amount: payout.amount,
        currency: 'XAF',
        phone: payout.phone || '',
        provider: (payout.operator || 'orange') as never,
        reference: `creator_payout_${payoutId}`,
        description: `Retrait créateur Gen3ia: ${payout.amount} FCFA`,
        metadata: {
          userId: payout.userId,
          payoutId,
          type: 'creator_payout',
        },
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/marketplace/webhook`,
      });

      await prisma.creatorPayout.update({
        where: { id: payoutId },
        data: {
          status: result.success ? 'paid' : 'failed',
          transactionId: result.transactionId || undefined,
          processedAt: new Date(),
        },
      });

      log.info('payout_processed', {
        payoutId,
        success: result.success,
        transactionId: result.transactionId,
      });
    } catch (error) {
      // Fallback: legacy adapter (Chariow via src/lib/sebpay.ts) — utilisé si
      // le client marketplace Sebpay n'est pas configuré (SEBPAY_API_KEY absent).
      log.warn('marketplace_sebpay_unavailable_fallback_legacy', {
        error: error instanceof Error ? error.message : '',
      });
      try {
        const legacy = await sebpay.initiatePayment({
          amount: payout.amount,
          currency: 'XAF',
          phone: payout.phone || '',
          operator: payout.operator || 'ORANGE_MONEY',
          description: `Retrait créateur Gen3ia: ${payout.amount} FCFA`,
          reference: `payout_${payout.id}`,
          callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/marketplace/webhook`,
        });
        await prisma.creatorPayout.update({
          where: { id: payoutId },
          data: {
            status: legacy.success ? 'paid' : 'failed',
            transactionId: legacy.transactionId || undefined,
            processedAt: new Date(),
          },
        });
        log.info('payout_processed_legacy', { payoutId, success: legacy.success });
      } catch (_e) {
        await prisma.creatorPayout.update({
          where: { id: payoutId },
          data: { status: 'failed' },
        });
      }
    }
  }
}

export const creatorPayouts = new CreatorPayoutService();
export default creatorPayouts;
