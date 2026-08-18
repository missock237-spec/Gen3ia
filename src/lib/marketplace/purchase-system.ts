/**
 * Purchase System — Marketplace purchases (SEBPAY)
 *
 * RÈGLES BUSINESS (T28 — Migration Stripe → Sebpay):
 *   - Le vendeur choisit son prix
 *   - Commission plateforme = 20% (constante MARKETPLACE_COMMISSION_RATE)
 *   - Part vendeur        = 80% (constante MARKETPLACE_SELLER_RATE)
 *   - Listings gratuits (price = 0) sont permis → pas de commission
 *   - Les achats payants passent par Sebpay Mobile Money
 *   - Sur confirmation webhook Sebpay → AUTO-PAYOUT 80% au créateur
 *
 *  Compatibilité API historique :
 *   - purchaseListing(opts)            — conserve la même signature
 *   - finalizeMarketplaceStripePurchase — RENOMMÉE en finalizeMarketplaceSebpayPurchase
 *     (l'ancien nom est conservé comme alias pour compat)
 *   - verifyAccess                     — inchangé
 *   - getPurchaseHistory               — inchangé
 */

import { db } from '@/lib/db';
import {
  sebpayMarketplace,
  MARKETPLACE_COMMISSION_RATE,
  MARKETPLACE_SELLER_RATE,
  type SebpayCurrency,
} from '@/lib/payment/sebpay';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PurchaseOptions {
  listingId: string;
  userId: string;
  /** Phone MoMo du buyer (requis si listing payant) */
  phone?: string;
  /** Provider MoMo préféré (mtn, orange, wave, ...) */
  provider?: string;
  customerEmail?: string;
  customerName?: string;
}

export interface PurchaseResult {
  id: string;
  listingId: string;
  userId: string;
  price: number;
  currency: string;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  listing?: {
    name: string;
    type: string;
    config: Record<string, unknown>;
  };
}

export interface MarketplaceCheckoutResult {
  /** 'free' pour listings gratuits, 'sebpay' sinon */
  mode: 'free' | 'sebpay';
  purchase?: PurchaseResult;
  checkoutUrl?: string;
  transactionId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

function normalizeCurrency(value: string): SebpayCurrency {
  const c = value.trim().toUpperCase();
  if (['XAF', 'XOF', 'CDF', 'EUR', 'USD'].includes(c)) return c as SebpayCurrency;
  return 'XAF';
}

async function getListingOrThrow(listingId: string) {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
  });
  if (!listing) {
    throw new Error('Listing not found');
  }
  if (listing.status !== 'published') {
    throw new Error('Listing is not available for purchase');
  }
  return listing;
}

// ---------------------------------------------------------------------------
// Core: Create marketplace checkout / claim
// ---------------------------------------------------------------------------

export async function purchaseListing(
  options: PurchaseOptions,
): Promise<MarketplaceCheckoutResult> {
  const { listingId, userId } = options;

  const listing = await getListingOrThrow(listingId);

  if (listing.userId === userId) {
    throw new Error('Cannot purchase your own listing');
  }

  // Si l'utilisateur a déjà acheté → retourne l'achat existant
  const existingPurchase = await db.marketplacePurchase.findUnique({
    where: {
      userId_listingId: {
        listingId,
        userId,
      },
    },
  });

  if (existingPurchase) {
    return {
      mode: 'free',
      purchase: {
        id: existingPurchase.id,
        listingId: existingPurchase.listingId,
        userId: existingPurchase.userId,
        price: existingPurchase.price,
        currency: (listing.currency as string) || 'XAF',
        status: existingPurchase.status,
        metadata: safeParse<Record<string, unknown>>(existingPurchase.metadata as string, {}),
        createdAt: existingPurchase.createdAt,
        listing: {
          name: listing.name,
          type: listing.type,
          config: safeParse<Record<string, unknown>>(listing.config as string, {}),
        },
      },
    };
  }

  const salePrice = roundMoney(Number(listing.price || 0));
  const platformCommission = roundMoney(salePrice * MARKETPLACE_COMMISSION_RATE);
  const sellerRevenue = roundMoney(salePrice * MARKETPLACE_SELLER_RATE);
  const currency = normalizeCurrency((listing.currency as string) || 'XAF');

  // ─── Free claim (price = 0) ─────────────────────────────────────────
  if (salePrice <= 0) {
    const metadata = {
      type: 'free',
      commissionRate: MARKETPLACE_COMMISSION_RATE,
      sellerRate: MARKETPLACE_SELLER_RATE,
      sellerUserId: listing.userId,
      sellerRevenue: 0,
      platformCommission: 0,
      claimedAt: new Date().toISOString(),
    };

    const purchase = await db.marketplacePurchase.create({
      data: {
        listingId,
        userId,
        price: 0,
        currency,
        status: 'completed',
        metadata: JSON.stringify(metadata),
      },
    });

    await db.marketplaceListing.update({
      where: { id: listingId },
      data: {
        downloads: { increment: 1 },
        installCount: { increment: 1 },
      },
    });

    return {
      mode: 'free',
      purchase: {
        id: purchase.id,
        listingId: purchase.listingId,
        userId: purchase.userId,
        price: 0,
        currency,
        status: 'completed',
        metadata,
        createdAt: purchase.createdAt,
        listing: {
          name: listing.name,
          type: listing.type,
          config: safeParse<Record<string, unknown>>(listing.config as string, {}),
        },
      },
    };
  }

  // ─── Paid checkout (SEBPAY) ─────────────────────────────────────────
  if (!sebpayMarketplace.isConfigured()) {
    throw new Error(
      'SEBPAY_API_KEY non configuré — impossible de traiter les paiements marketplace. ' +
      'Définissez SEBPAY_API_KEY dans les variables d\'environnement.',
    );
  }

  if (!options.phone) {
    throw new Error('Téléphone Mobile Money requis pour un achat marketplace payant.');
  }

  const purchase = await db.marketplacePurchase.create({
    data: {
      listingId,
      userId,
      price: salePrice,
      currency,
      status: 'pending',
      metadata: JSON.stringify({
        type: 'pending_sebpay',
        commissionRate: MARKETPLACE_COMMISSION_RATE,
        sellerRate: MARKETPLACE_SELLER_RATE,
        sellerUserId: listing.userId,
        sellerRevenue,
        platformCommission,
        buyerPhone: options.phone,
        buyerProvider: options.provider || 'orange',
      }),
    },
  });

  const reference = `mkt_${purchase.id}`;
  const callbackUrl = `${getAppUrl()}/api/marketplace/webhook`;
  const redirectUrl = `${getAppUrl()}/marketplace/success?purchaseId=${purchase.id}`;
  const description = `Achat Gen3ia: ${listing.name} (listing ${listingId.slice(0, 8)})`;

  const result = await sebpayMarketplace.initiatePayment({
    amount: salePrice,
    currency,
    phone: options.phone,
    provider: (options.provider || 'orange') as never,
    reference,
    description,
    callbackUrl,
    redirectUrl,
    customerEmail: options.customerEmail,
    customerName: options.customerName,
    metadata: {
      type: 'marketplace_purchase',
      listingId,
      purchaseId: purchase.id,
      buyerId: userId,
      sellerId: listing.userId,
      salePrice: String(salePrice),
      currency,
      platformCommission: String(platformCommission),
      sellerRevenue: String(sellerRevenue),
      commissionRate: String(MARKETPLACE_COMMISSION_RATE),
      sellerRate: String(MARKETPLACE_SELLER_RATE),
    },
  });

  if (!result.success) {
    // Marquer l'achat comme failed
    await db.marketplacePurchase.update({
      where: { id: purchase.id },
      data: {
        status: 'failed',
        metadata: JSON.stringify({
          ...(safeParse<Record<string, unknown>>(purchase.metadata as string, {})),
          sebpayError: result.message || 'unknown',
        }),
      },
    });
    throw new Error(`Échec d'initiation du paiement Sebpay: ${result.message || 'unknown'}`);
  }

  // Mettre à jour l'achat avec l'ID de transaction Sebpay
  await db.marketplacePurchase.update({
    where: { id: purchase.id },
    data: {
      metadata: JSON.stringify({
        ...(safeParse<Record<string, unknown>>(purchase.metadata as string, {})),
        sebpayTransactionId: result.transactionId,
        sebpayPaymentUrl: result.paymentUrl,
      }),
    },
  });

  return {
    mode: 'sebpay',
    checkoutUrl: result.paymentUrl || '',
    transactionId: result.transactionId,
  };
}

// ---------------------------------------------------------------------------
// Core: Finalize marketplace Sebpay purchase from webhook
// ---------------------------------------------------------------------------

export async function finalizeMarketplaceSebpayPurchase(payload: {
  reference: string;
  transactionId: string;
  status: string;
  amount?: number;
}): Promise<void> {
  // La référence Gen3ia est "mkt_<purchaseId>"
  const refMatch = payload.reference.match(/^mkt_(.+)$/);
  if (!refMatch) {
    return; // Not a marketplace purchase
  }
  const purchaseId = refMatch[1];

  const purchase = await db.marketplacePurchase.findUnique({
    where: { id: purchaseId },
  });
  if (!purchase) {
    throw new Error(`Marketplace purchase not found: ${purchaseId}`);
  }
  if (purchase.status === 'completed') {
    return; // Already finalized
  }

  const listing = await getListingOrThrow(purchase.listingId);
  const salePrice = roundMoney(Number(payload.amount ?? purchase.price ?? 0));
  const sellerRevenue = roundMoney(salePrice * MARKETPLACE_SELLER_RATE);
  const platformCommission = roundMoney(salePrice * MARKETPLACE_COMMISSION_RATE);

  const existingMetadata = safeParse<Record<string, unknown>>(purchase.metadata as string, {});
  const metadata = {
    ...existingMetadata,
    type: 'paid',
    sebpayTransactionId: payload.transactionId,
    sebpayReference: payload.reference,
    commissionRate: MARKETPLACE_COMMISSION_RATE,
    sellerRate: MARKETPLACE_SELLER_RATE,
    sellerUserId: listing.userId,
    sellerRevenue,
    platformCommission,
    paidAt: new Date().toISOString(),
  };

  // Marquer l'achat comme completed + montant net + commission
  await db.marketplacePurchase.update({
    where: { id: purchaseId },
    data: {
      status: 'completed',
      price: salePrice,
      sellerRevenue,
      platformCommission,
      transferStatus: 'pending_payout',
      metadata: JSON.stringify(metadata),
    },
  });

  // Incrémenter le compteur d'installations
  await db.marketplaceListing.update({
    where: { id: purchase.listingId },
    data: {
      downloads: { increment: 1 },
      installCount: { increment: 1 },
      revenue: { increment: sellerRevenue },
    },
  });

  // Incrémenter les earnings du créateur
  await db.user.update({
    where: { id: listing.userId },
    data: { creatorEarnings: { increment: sellerRevenue } },
  });

  // Déclencher AUTO-PAYOUT 80% au créateur via Sebpay
  await sebpayMarketplace.triggerSellerPayout({
    sellerId: listing.userId,
    purchaseId,
    listingId: purchase.listingId,
    amount: sellerRevenue,
    currency: normalizeCurrency((purchase.currency as string) || 'XAF'),
  });
}

// Compat: ancien nom utilisé par d'anciens webhooks Stripe.
// Redirige vers finalizeMarketplaceSebpayPurchase en ignorants les fields Stripe-spécifiques.
export async function finalizeMarketplaceStripePurchase(
  sessionLike: { metadata?: Record<string, unknown> | null; payment_intent?: unknown; id?: string },
): Promise<void> {
  const meta = sessionLike?.metadata ?? null;
  if (!meta) return;
  if (meta.type !== 'marketplace_purchase') return;

  const purchaseId = String(meta.purchaseId || '');
  const reference = String(meta.reference || `mkt_${purchaseId}`);
  const transactionId = String(sessionLike?.id || sessionLike?.payment_intent || reference);
  const status = 'completed';

  return finalizeMarketplaceSebpayPurchase({
    reference,
    transactionId,
    status,
    amount: meta.salePrice ? Number(meta.salePrice) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Core: Verify Access
// ---------------------------------------------------------------------------

export async function verifyAccess(
  userId: string,
  listingId: string,
): Promise<boolean> {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    select: {
      userId: true,
      status: true,
    },
  });

  if (!listing) return false;
  if (listing.status !== 'published') return false;
  if (listing.userId === userId) return true;

  const purchase = await db.marketplacePurchase.findUnique({
    where: {
      userId_listingId: {
        listingId,
        userId,
      },
    },
    select: {
      status: true,
    },
  });

  return !!purchase && purchase.status === 'completed';
}

// ---------------------------------------------------------------------------
// Core: Get Purchase History
// ---------------------------------------------------------------------------

export async function getPurchaseHistory(
  userId: string,
  options: { page?: number; limit?: number } = {},
): Promise<{
  purchases: PurchaseResult[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));

  const [purchases, total] = await Promise.all([
    db.marketplacePurchase.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        listing: {
          select: {
            name: true,
            type: true,
            config: true,
          },
        },
      },
    }),
    db.marketplacePurchase.count({
      where: { userId },
    }),
  ]);

  return {
    purchases: purchases.map((p) => ({
      id: p.id,
      listingId: p.listingId,
      userId: p.userId,
      price: p.price,
      currency: p.currency,
      status: p.status,
      metadata: safeParse<Record<string, unknown>>(p.metadata as string, {}),
      createdAt: p.createdAt,
      listing: p.listing
        ? {
            name: (p.listing as { name: string }).name,
            type: (p.listing as { type: string }).type,
            config: safeParse<Record<string, unknown>>(
              (p.listing as { config: string }).config,
              {},
            ),
          }
        : undefined,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
