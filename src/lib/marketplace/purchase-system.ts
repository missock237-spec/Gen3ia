cat > src/lib/marketplace/purchase-system.ts << 'FILEEOF'
/**
 * Purchase System — Marketplace purchases
 *
 * Business rules:
 * - Seller chooses the price
 * - Platform commission = 25%
 * - Seller revenue = 75%
 * - Free listings are allowed when price = 0
 * - Paid listings are completed after Stripe webhook confirmation
 */

import { db } from '@/lib/db'
import Stripe from 'stripe'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PurchaseOptions {
  listingId: string
  userId: string
}

export interface PurchaseResult {
  id: string
  listingId: string
  userId: string
  price: number
  currency: string
  status: string
  metadata: Record<string, unknown>
  createdAt: Date
  listing?: {
    name: string
    type: string
    config: Record<string, unknown>
  }
}

export interface MarketplaceCheckoutResult {
  mode: 'free' | 'stripe'
  purchase?: PurchaseResult
  checkoutUrl?: string
  sessionId?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function toStripeAmount(value: number): number {
  return Math.round(value * 100)
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set')
  }

  return new Stripe(key, {
    typescript: true,
  })
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

function normalizeCurrency(value: string): string {
  return value.trim().toLowerCase()
}

async function getOrCreateStripeCustomerForMarketplace(userId: string): Promise<string> {
  const existingSubscription = await db.subscription.findFirst({
    where: {
      userId,
      stripeCustomerId: { not: null },
    },
    select: {
      stripeCustomerId: true,
    },
  })

  if (existingSubscription?.stripeCustomerId) {
    return existingSubscription.stripeCustomerId
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
    },
  })

  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  const customer = await getStripe().customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId },
  })

  return customer.id
}

async function getListingOrThrow(listingId: string) {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
  })

  if (!listing) {
    throw new Error('Listing not found')
  }

  if (listing.status !== 'published') {
    throw new Error('Listing is not available for purchase')
  }

  return listing
}

// ---------------------------------------------------------------------------
// Core: Create marketplace checkout / claim
// ---------------------------------------------------------------------------

export async function purchaseListing(
  options: PurchaseOptions
): Promise<MarketplaceCheckoutResult> {
  const { listingId, userId } = options

  const listing = await getListingOrThrow(listingId)

  if (listing.userId === userId) {
    throw new Error('Cannot purchase your own listing')
  }

  const existingPurchase = await db.marketplacePurchase.findUnique({
    where: {
      userId_listingId: {
        listingId,
        userId,
      },
    },
  })

  if (existingPurchase) {
    return {
      mode: 'free',
      purchase: {
        id: existingPurchase.id,
        listingId: existingPurchase.listingId,
        userId: existingPurchase.userId,
        price: existingPurchase.price,
        currency: existingPurchase.currency,
        status: existingPurchase.status,
        metadata: safeParse<Record<string, unknown>>(existingPurchase.metadata, {}),
        createdAt: existingPurchase.createdAt,
        listing: {
          name: listing.name,
          type: listing.type,
          config: safeParse<Record<string, unknown>>(listing.config, {}),
        },
      },
    }
  }

  const salePrice = roundMoney(Number(listing.price || 0))
  const platformCommission = roundMoney(salePrice * 0.25)
  const sellerRevenue = roundMoney(salePrice - platformCommission)

  // Free claim
  if (salePrice <= 0) {
    const metadata = {
      type: 'free',
      commissionRate: 0.25,
      sellerRate: 0.75,
      sellerUserId: listing.userId,
      sellerRevenue,
      platformCommission,
      claimedAt: new Date().toISOString(),
    }

    const purchase = await db.marketplacePurchase.create({
      data: {
        listingId,
        userId,
        price: 0,
        currency: listing.currency,
        status: 'completed',
        metadata: JSON.stringify(metadata),
      },
    })

    await db.marketplaceListing.update({
      where: { id: listingId },
      data: {
        downloads: { increment: 1 },
        installCount: { increment: 1 },
      },
    })

    return {
      mode: 'free',
      purchase: {
        id: purchase.id,
        listingId: purchase.listingId,
        userId: purchase.userId,
        price: purchase.price,
        currency: purchase.currency,
        status: purchase.status,
        metadata,
        createdAt: purchase.createdAt,
        listing: {
          name: listing.name,
          type: listing.type,
          config: safeParse<Record<string, unknown>>(listing.config, {}),
        },
      },
    }
  }

  // Paid checkout
  const stripe = getStripe()
  const customerId = await getOrCreateStripeCustomerForMarketplace(userId)

  // Récupérer le compte Stripe Connect du vendeur
  const seller = await db.user.findUnique({
    where: { id: listing.userId },
    select: { stripeConnectAccountId: true, stripeConnectOnboarded: true },
  })

  const hasConnectedSeller = !!(
    seller?.stripeConnectAccountId && seller.stripeConnectOnboarded
  )

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: normalizeCurrency(listing.currency),
          product_data: {
            name: listing.name,
            description: listing.description,
          },
          unit_amount: toStripeAmount(salePrice),
        },
        quantity: 1,
      },
    ],
    // Destination charge : Stripe route automatiquement 75% vers le vendeur
    // et garde 25% (application_fee_amount) sur le compte plateforme.
    // Ne s'applique que si le vendeur a terminé l'onboarding Connect.
    ...(hasConnectedSeller
      ? {
          payment_intent_data: {
            application_fee_amount: toStripeAmount(platformCommission),
            transfer_data: {
              destination: seller!.stripeConnectAccountId!,
            },
          },
        }
      : {}),
    success_url: `${getAppUrl()}?marketplace=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getAppUrl()}?marketplace=cancel`,
    metadata: {
      type: 'marketplace_purchase',
      listingId,
      buyerUserId: userId,
      sellerUserId: listing.userId,
      listingPrice: String(salePrice),
      currency: listing.currency,
      platformCommission: String(platformCommission),
      sellerRevenue: String(sellerRevenue),
      commissionRate: '0.25',
      sellerRate: '0.75',
      sellerConnected: String(hasConnectedSeller),
    },
  })

  return {
    mode: 'stripe',
    checkoutUrl: session.url || '',
    sessionId: session.id,
  }
}

// ---------------------------------------------------------------------------
// Core: Finalize Stripe marketplace purchase from webhook
// ---------------------------------------------------------------------------

export async function finalizeMarketplaceStripePurchase(
  session: Stripe.Checkout.Session
): Promise<void> {
  if (session.metadata?.type !== 'marketplace_purchase') {
    return
  }

  const listingId = session.metadata.listingId
  const userId = session.metadata.buyerUserId
  const sellerUserId = session.metadata.sellerUserId

  if (!listingId || !userId || !sellerUserId) {
    throw new Error('Missing marketplace Stripe metadata')
  }

  const listing = await getListingOrThrow(listingId)

  const existingPurchase = await db.marketplacePurchase.findUnique({
    where: {
      userId_listingId: {
        listingId,
        userId,
      },
    },
  })

  if (existingPurchase) {
    return
  }

  const salePrice = roundMoney(Number(session.metadata.listingPrice || listing.price || 0))
  const platformCommission = roundMoney(
    Number(session.metadata.platformCommission || salePrice * 0.25)
  )
  const sellerRevenue = roundMoney(
    Number(session.metadata.sellerRevenue || salePrice - platformCommission)
  )

  const sellerConnected = session.metadata?.sellerConnected === 'true'

  const metadata = {
    type: 'paid',
    stripeSessionId: session.id,
    stripePaymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null,
    commissionRate: 0.25,
    sellerRate: 0.75,
    sellerUserId,
    sellerRevenue,
    platformCommission,
    sellerConnected,
    paidAt: new Date().toISOString(),
  }

  await db.marketplacePurchase.create({
    data: {
      listingId,
      userId,
      price: salePrice,
      currency: listing.currency,
      status: 'completed',
      metadata: JSON.stringify(metadata),
      sellerRevenue,
      platformCommission,
      // 'transferred' = Stripe a routé les fonds au vendeur via destination charge
      // 'platform_held' = vendeur pas encore onboardé, fonds restent sur la plateforme
      transferStatus: sellerConnected ? 'transferred' : 'platform_held',
    },
  })

  await db.marketplaceListing.update({
    where: { id: listingId },
    data: {
      downloads: { increment: 1 },
      installCount: { increment: 1 },
    },
  })
}

// ---------------------------------------------------------------------------
// Core: Verify Access
// ---------------------------------------------------------------------------

export async function verifyAccess(
  userId: string,
  listingId: string
): Promise<boolean> {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    select: {
      userId: true,
      status: true,
    },
  })

  if (!listing) return false
  if (listing.status !== 'published') return false
  if (listing.userId === userId) return true

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
  })

  return !!purchase && purchase.status === 'completed'
}

// ---------------------------------------------------------------------------
// Core: Get Purchase History
// ---------------------------------------------------------------------------

export async function getPurchaseHistory(
  userId: string,
  options: { page?: number; limit?: number } = {}
): Promise<{
  purchases: PurchaseResult[]
  total: number
  page: number
  totalPages: number
}> {
  const page = Math.max(1, options.page || 1)
  const limit = Math.min(100, Math.max(1, options.limit || 20))

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
  ])

  return {
    purchases: purchases.map((p) => ({
      id: p.id,
      listingId: p.listingId,
      userId: p.userId,
      price: p.price,
      currency: p.currency,
      status: p.status,
      metadata: safeParse<Record<string, unknown>>(p.metadata, {}),
      createdAt: p.createdAt,
      listing: {
        name: p.listing.name,
        type: p.listing.type,
        config: safeParse<Record<string, unknown>>(p.listing.config, {}),
      },
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }
}
FILEEOF
