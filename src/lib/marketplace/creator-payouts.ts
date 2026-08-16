// ============================================================
// CREATOR PAYOUTS — Monétisation des créateurs marketplace
// Commissions, reversements automatiques, historique
// ============================================================

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { sebpay } from '@/lib/sebpay';

const log = createLogger('creator-payouts');
const PLATFORM_COMMISSION = 0.15; // 15% plateforme

export class CreatorPayoutService {
  async registerCreator(userId: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { isCreator: true } });
    log.info('creator_registered', { userId: userId.slice(0, 8) });
  }

  async recordSale(listingId: string, buyerId: string, amount: number): Promise<{ creatorEarns: number; platformFees: number }> {
    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId }, select: { userId: true, price: true, commissionRate: true, revenue: true } });
    if (!listing) throw new Error('Listing not found');

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
    };
  }

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

  async processPayout(payoutId: string) {
    const payout = await prisma.creatorPayout.findUnique({ where: { id: payoutId } });
    if (!payout || payout.status !== 'pending') return;

    await prisma.creatorPayout.update({
      where: { id: payoutId },
      data: { status: 'processing' },
    });

    try {
      const result = await sebpay.initiatePayment({
        amount: payout.amount,
        currency: 'XAF',
        phone: payout.phone || '',
        operator: payout.operator || 'ORANGE_MONEY',
        description: `Paiement créateur: ${payout.amount} FCFA`,
        reference: `payout_${payout.id}`,
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/marketplace/webhook`,
      });

      await prisma.creatorPayout.update({
        where: { id: payoutId },
        data: { status: result.success ? 'paid' : 'failed', transactionId: result.transactionId || undefined, processedAt: new Date() },
      });

      log.info('payout_processed', { payoutId, success: result.success });
    } catch (_error) {
      await prisma.creatorPayout.update({
        where: { id: payoutId },
        data: { status: 'failed' },
      });
    }
  }
}

export const creatorPayouts = new CreatorPayoutService();
export default creatorPayouts;
