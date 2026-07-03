/**
 * Purchase System — Marketplace purchases
 *
 * Business rules:
 * - The seller chooses the listing price
 * - The platform takes 25% commission on each sale
 * - The seller receives 75%
 * - Free listings are still allowed if the seller sets price = 0
 * - Access is granted only after a completed purchase/claim record exists
 */

import { db } from '@/lib/db'

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

// ---------------------------------------------------------------------------
// Core: Purchase Listing
// ---------------------------------------------------------------------------

export async function purchaseListing(
  options: PurchaseOptions
): Promise<PurchaseResult> {
  const { listingId, userId } = options

  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
  })

  if (!listing) {
    throw new Error('Listing not found')
  }

  if (listing.status !== 'published') {
    throw new Error('Listing is not available for purchase')
  }

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
    }
  }

  const salePrice = roundMoney(Number(listing.price || 0))
  const platformCommission = roundMoney(salePrice * 0.25)
  const sellerRevenue = roundMoney(salePrice - platformCommission)

  const metadata = {
    type: salePrice > 0 ? 'paid' : 'free',
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
      price: salePrice,
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
  }
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

  // Owner always has access
  if (listing.userId === userId) return true

  // Buyer must have a completed purchase / claim record
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
