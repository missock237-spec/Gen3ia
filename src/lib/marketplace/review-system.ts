/**
 * Review System — Star ratings, text reviews, helpful votes
 *
 * Hardened rules:
 * - User cannot review their own listing
 * - User must have a completed purchase record before reviewing
 * - Rating must be an integer between 1 and 5
 */

import { db } from '@/lib/db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AddReviewOptions {
  listingId: string
  userId: string
  rating: number
  title?: string
  content?: string
}

export interface ReviewResult {
  id: string
  listingId: string
  userId: string
  rating: number
  title: string
  content: string
  status: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
  author?: {
    name: string
    avatar: string | null
  }
}

export interface AverageRatingResult {
  average: number
  count: number
  distribution: Record<number, number>
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

function serializeReview(review: {
  id: string
  listingId: string
  userId: string
  rating: number
  title: string
  content: string
  status: string
  metadata: string
  createdAt: Date
  updatedAt: Date
  user?: { name: string; avatar: string | null }
}): ReviewResult {
  return {
    id: review.id,
    listingId: review.listingId,
    userId: review.userId,
    rating: review.rating,
    title: review.title,
    content: review.content,
    status: review.status,
    metadata: safeParse<Record<string, unknown>>(review.metadata, {}),
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    author: review.user
      ? {
          name: review.user.name,
          avatar: review.user.avatar,
        }
      : undefined,
  }
}

async function ensureUserCanReviewListing(
  userId: string,
  listingId: string
): Promise<void> {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      userId: true,
      status: true,
    },
  })

  if (!listing) {
    throw new Error('Listing not found')
  }

  if (listing.userId === userId) {
    throw new Error('Cannot review your own listing')
  }

  if (listing.status !== 'published') {
    throw new Error('Listing is not available for review')
  }

  const purchase = await db.marketplacePurchase.findUnique({
    where: {
      userId_listingId: {
        userId,
        listingId,
      },
    },
    select: {
      status: true,
    },
  })

  if (!purchase || purchase.status !== 'completed') {
    throw new Error('You must obtain this listing before leaving a review')
  }
}

// ---------------------------------------------------------------------------
// Core: Add Review
// ---------------------------------------------------------------------------

export async function addReview(
  options: AddReviewOptions
): Promise<ReviewResult> {
  const { listingId, userId, rating, title = '', content = '' } = options

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('Rating must be an integer between 1 and 5')
  }

  if (title.length > 120) {
    throw new Error('Title must be at most 120 characters')
  }

  if (content.length > 5000) {
    throw new Error('Content must be at most 5000 characters')
  }

  await ensureUserCanReviewListing(userId, listingId)

  const existing = await db.marketplaceReview.findUnique({
    where: {
      userId_listingId: {
        listingId,
        userId,
      },
    },
  })

  if (existing) {
    const updated = await db.marketplaceReview.update({
      where: { id: existing.id },
      data: {
        rating,
        title,
        content,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: {
            name: true,
            avatar: true,
          },
        },
      },
    })

    await recalculateListingRating(listingId)
    return serializeReview(updated)
  }

  const review = await db.marketplaceReview.create({
    data: {
      listingId,
      userId,
      rating,
      title,
      content,
      metadata: JSON.stringify({ helpfulVotes: 0 }),
    },
    include: {
      user: {
        select: {
          name: true,
          avatar: true,
        },
      },
    },
  })

  await recalculateListingRating(listingId)
  return serializeReview(review)
}

// ---------------------------------------------------------------------------
// Core: Get Reviews for a listing
// ---------------------------------------------------------------------------

export async function getReviews(
  listingId: string,
  options: {
    page?: number
    limit?: number
    sortBy?: 'newest' | 'highest' | 'lowest' | 'helpful'
  } = {}
): Promise<{
  reviews: ReviewResult[]
  total: number
  page: number
  totalPages: number
}> {
  const { page = 1, limit = 20, sortBy = 'newest' } = options

  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    select: { status: true },
  })

  if (!listing || listing.status !== 'published') {
    return {
      reviews: [],
      total: 0,
      page,
      totalPages: 0,
    }
  }

  let orderBy:
    | Array<Record<string, 'asc' | 'desc'>>
    | Record<string, 'asc' | 'desc'>

  switch (sortBy) {
    case 'highest':
      orderBy = [{ rating: 'desc' }, { createdAt: 'desc' }]
      break
    case 'lowest':
      orderBy = [{ rating: 'asc' }, { createdAt: 'desc' }]
      break
    case 'helpful':
      orderBy = [{ createdAt: 'desc' }]
      break
    case 'newest':
    default:
      orderBy = [{ createdAt: 'desc' }]
  }

  const [reviews, total] = await Promise.all([
    db.marketplaceReview.findMany({
      where: {
        listingId,
        status: 'published',
      },
// @ts-ignore — type narrowing pending, see refactor ticket
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: {
          select: {
            name: true,
            avatar: true,
          },
        },
      },
    }),
    db.marketplaceReview.count({
      where: {
        listingId,
        status: 'published',
      },
    }),
  ])

  return {
    reviews: reviews.map(serializeReview),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }
}

// ---------------------------------------------------------------------------
// Core: Get Average Rating
// ---------------------------------------------------------------------------

export async function getAverageRating(
  listingId: string
): Promise<AverageRatingResult> {
  const reviews = await db.marketplaceReview.findMany({
    where: {
      listingId,
      status: 'published',
    },
    select: {
      rating: true,
    },
  })

  if (reviews.length === 0) {
    return {
      average: 0,
      count: 0,
      distribution: {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      },
    }
  }

  const total = reviews.reduce((sum, r) => sum + r.rating, 0)
  const average = Math.round((total / reviews.length) * 100) / 100

  const distribution: Record<number, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  }

  for (const review of reviews) {
    distribution[review.rating] = (distribution[review.rating] || 0) + 1
  }

  return {
    average,
    count: reviews.length,
    distribution,
  }
}

// ---------------------------------------------------------------------------
// Core: Mark Helpful
// ---------------------------------------------------------------------------

export async function markHelpful(reviewId: string): Promise<boolean> {
  const review = await db.marketplaceReview.findUnique({
    where: { id: reviewId },
  })

  if (!review) return false

  const metadata = safeParse<Record<string, unknown>>(review.metadata, {})
  const helpfulVotes = (Number(metadata.helpfulVotes) || 0) + 1

  await db.marketplaceReview.update({
    where: { id: reviewId },
    data: {
      metadata: JSON.stringify({
        ...metadata,
        helpfulVotes,
      }),
    },
  })

  return true
}

// ---------------------------------------------------------------------------
// Internal: Recalculate listing rating
// ---------------------------------------------------------------------------

async function recalculateListingRating(listingId: string): Promise<void> {
  const result = await getAverageRating(listingId)

  await db.marketplaceListing.update({
    where: { id: listingId },
    data: {
      rating: result.average,
      reviewCount: result.count,
    },
  })
  }
