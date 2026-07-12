/**
 * Listing Manager — CRUD for marketplace listings
 *
 * Hardened rules:
 * - Draft / archived / suspended listings are only visible to their owner
 * - Published listings are visible to authenticated viewers
 * - Runtime validation for create / update
 */

import { db } from '@/lib/db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ListingType = 'agent' | 'workflow' | 'template' | 'plugin'
export type ListingStatus = 'draft' | 'published' | 'archived' | 'suspended'
export type ListingCategory =
  | 'general'
  | 'productivity'
  | 'development'
  | 'marketing'
  | 'sales'
  | 'support'
  | 'research'
  | 'finance'
  | 'hr'
  | 'creative'

export interface CreateListingOptions {
  type: ListingType
  name: string
  description: string
  category?: ListingCategory
  tags?: string[]
  price?: number
  currency?: string
  config?: Record<string, unknown>
  previewUrl?: string
  metadata?: Record<string, unknown>
}

export interface UpdateListingOptions {
  name?: string
  description?: string
  category?: ListingCategory
  tags?: string[]
  price?: number
  currency?: string
  config?: Record<string, unknown>
  previewUrl?: string | null
  status?: ListingStatus
  metadata?: Record<string, unknown>
}

export interface SearchListingsOptions {
  query?: string
  type?: ListingType
  category?: ListingCategory
  tags?: string[]
  minPrice?: number
  maxPrice?: number
  status?: ListingStatus
  sortBy?: 'newest' | 'popular' | 'rating' | 'price_asc' | 'price_desc'
  page?: number
  limit?: number
}

export interface MarketplaceListingResult {
  id: string
  userId: string
  type: string
  name: string
  slug: string
  description: string
  category: string
  tags: string[]
  price: number
  currency: string
  config: Record<string, unknown>
  previewUrl: string | null
  downloads: number
  installCount: number
  rating: number
  reviewCount: number
  status: string
  metadata: Record<string, unknown>
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  author?: {
    name: string
    avatar: string | null
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_TYPES: ListingType[] = ['agent', 'workflow', 'template', 'plugin']
const VALID_STATUSES: ListingStatus[] = [
  'draft',
  'published',
  'archived',
  'suspended',
]
const VALID_CATEGORIES: ListingCategory[] = [
  'general',
  'productivity',
  'development',
  'marketing',
  'sales',
  'support',
  'research',
  'finance',
  'hr',
  'creative',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 80) +
    '-' +
    Math.random().toString(36).substring(2, 8)
  )
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

function normalizeCurrency(value?: string): string {
  return (value || 'USD').trim().toUpperCase()
}

function assertValidPreviewUrl(value?: string | null): void {
  if (value === undefined || value === null || value === '') return
  try {
    new URL(value)
  } catch {
    throw new Error('previewUrl must be a valid URL')
  }
}

function assertValidCreateInput(options: CreateListingOptions): void {
  if (!VALID_TYPES.includes(options.type)) {
    throw new Error(`Invalid listing type: ${options.type}`)
  }
  if (!options.name || options.name.trim().length < 3) {
    throw new Error('Name must be at least 3 characters')
  }
  if (options.name.length > 120) {
    throw new Error('Name must be at most 120 characters')
  }
  if (!options.description || options.description.trim().length < 10) {
    throw new Error('Description must be at least 10 characters')
  }
  if (options.description.length > 5000) {
    throw new Error('Description must be at most 5000 characters')
  }
  if (options.category && !VALID_CATEGORIES.includes(options.category)) {
    throw new Error(`Invalid listing category: ${options.category}`)
  }
  if (options.tags && (!Array.isArray(options.tags) || options.tags.length > 20)) {
    throw new Error('Tags must be an array with at most 20 items')
  }
  if (options.tags?.some((tag) => typeof tag !== 'string' || tag.length > 40)) {
    throw new Error('Each tag must be a string up to 40 characters')
  }
  if (options.price !== undefined && (Number.isNaN(options.price) || options.price < 0)) {
    throw new Error('Price must be a number greater than or equal to 0')
  }
  assertValidPreviewUrl(options.previewUrl)
}

function assertValidUpdateInput(options: UpdateListingOptions): void {
  if (options.name !== undefined) {
    if (!options.name.trim() || options.name.length < 3 || options.name.length > 120) {
      throw new Error('Name must be between 3 and 120 characters')
    }
  }
  if (options.description !== undefined) {
    if (
      !options.description.trim() ||
      options.description.length < 10 ||
      options.description.length > 5000
    ) {
      throw new Error('Description must be between 10 and 5000 characters')
    }
  }
  if (options.category !== undefined && !VALID_CATEGORIES.includes(options.category)) {
    throw new Error(`Invalid listing category: ${options.category}`)
  }
  if (options.tags !== undefined) {
    if (!Array.isArray(options.tags) || options.tags.length > 20) {
      throw new Error('Tags must be an array with at most 20 items')
    }
    if (options.tags.some((tag) => typeof tag !== 'string' || tag.length > 40)) {
      throw new Error('Each tag must be a string up to 40 characters')
    }
  }
  if (options.price !== undefined && (Number.isNaN(options.price) || options.price < 0)) {
    throw new Error('Price must be a number greater than or equal to 0')
  }
  if (options.status !== undefined && !VALID_STATUSES.includes(options.status)) {
    throw new Error(`Invalid listing status: ${options.status}`)
  }
  assertValidPreviewUrl(options.previewUrl)
}

function serializeListing(listing: {
  id: string
  userId: string
  type: string
  name: string
  slug: string
  description: string
  category: string
  tags: string
  price: number
  currency: string
  config: string
  previewUrl: string | null
  downloads: number
  installCount: number
  rating: number
  reviewCount: number
  status: string
  metadata: string
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  user?: { name: string; avatar: string | null }
}): MarketplaceListingResult {
  return {
    id: listing.id,
    userId: listing.userId,
    type: listing.type,
    name: listing.name,
    slug: listing.slug,
    description: listing.description,
    category: listing.category,
    tags: safeParse<string[]>(listing.tags, []),
    price: listing.price,
    currency: listing.currency,
    config: safeParse<Record<string, unknown>>(listing.config, {}),
    previewUrl: listing.previewUrl,
    downloads: listing.downloads,
    installCount: listing.installCount,
    rating: listing.rating,
    reviewCount: listing.reviewCount,
    status: listing.status,
    metadata: safeParse<Record<string, unknown>>(listing.metadata, {}),
    publishedAt: listing.publishedAt,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    author: listing.user
      ? {
          name: listing.user.name,
          avatar: listing.user.avatar,
        }
      : undefined,
  }
}

// ---------------------------------------------------------------------------
// Core: Create Listing
// ---------------------------------------------------------------------------

export async function createListing(
  userId: string,
  options: CreateListingOptions
): Promise<MarketplaceListingResult> {
  assertValidCreateInput(options)

  const slug = generateSlug(options.name)

  const listing = await db.marketplaceListing.create({
    data: {
      userId,
      type: options.type,
      name: options.name.trim(),
      slug,
      description: options.description.trim(),
      category: options.category || 'general',
      tags: JSON.stringify(options.tags || []),
      price: options.price ?? 0,
      currency: normalizeCurrency(options.currency),
      config: JSON.stringify(options.config || {}),
      previewUrl: options.previewUrl || null,
      metadata: JSON.stringify({
        ...(options.metadata || {}),
        version: '1.0.0',
        changelog: [],
      }),
      status: 'draft',
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

  return serializeListing(listing)
}

// ---------------------------------------------------------------------------
// Core: Update Listing
// ---------------------------------------------------------------------------

export async function updateListing(
  userId: string,
  listingId: string,
  options: UpdateListingOptions
): Promise<MarketplaceListingResult> {
  assertValidUpdateInput(options)

  const existing = await db.marketplaceListing.findFirst({
    where: { id: listingId, userId },
  })

  if (!existing) {
    throw new Error('Listing not found or not authorized')
  }

  const data: Record<string, unknown> = {}

  if (options.name !== undefined) data.name = options.name.trim()
  if (options.description !== undefined) data.description = options.description.trim()
  if (options.category !== undefined) data.category = options.category
  if (options.tags !== undefined) data.tags = JSON.stringify(options.tags)
  if (options.price !== undefined) data.price = options.price
  if (options.currency !== undefined) data.currency = normalizeCurrency(options.currency)
  if (options.config !== undefined) data.config = JSON.stringify(options.config)
  if (options.previewUrl !== undefined) data.previewUrl = options.previewUrl
  if (options.status !== undefined) data.status = options.status

  if (options.metadata !== undefined) {
    const currentMeta = safeParse<Record<string, unknown>>(existing.metadata, {})
    data.metadata = JSON.stringify({ ...currentMeta, ...options.metadata })
  }

  // Set publishedAt timestamp the first time a listing goes live
  if (options.status === 'published' && existing.status !== 'published') {
    data.publishedAt = new Date()
  }

  const updated = await db.marketplaceListing.update({
    where: { id: listingId },
    data,
    include: {
      user: {
        select: {
          name: true,
          avatar: true,
        },
      },
    },
  })

  return serializeListing(updated)
}

// ---------------------------------------------------------------------------
// Core: Get Single Listing
// ---------------------------------------------------------------------------

export async function getListing(
  listingId: string,
  requestingUserId?: string
): Promise<MarketplaceListingResult | null> {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    include: {
      user: {
        select: { name: true, avatar: true },
      },
    },
  })

  if (!listing) return null

  // Non-published listings are only visible to their owner
  if (listing.status !== 'published' && listing.userId !== requestingUserId) {
    return null
  }

  return serializeListing(listing)
}

// ---------------------------------------------------------------------------
// Core: Get Listings by User
// ---------------------------------------------------------------------------

export async function getListingsByUser(
  userId: string,
  options: { page?: number; limit?: number } = {}
): Promise<{ listings: MarketplaceListingResult[]; total: number; page: number; totalPages: number }> {
  const page = Math.max(1, options.page || 1)
  const limit = Math.min(100, Math.max(1, options.limit || 20))

  const [listings, total] = await Promise.all([
    db.marketplaceListing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { name: true, avatar: true } },
      },
    }),
    db.marketplaceListing.count({ where: { userId } }),
  ])

  return {
    listings: listings.map(serializeListing),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }
}

// ---------------------------------------------------------------------------
// Core: Search Listings
// ---------------------------------------------------------------------------

export async function searchListings(
  options: SearchListingsOptions
): Promise<{ listings: MarketplaceListingResult[]; total: number; page: number; totalPages: number }> {
  const {
    query,
    type,
    category,
    tags,
    minPrice,
    maxPrice,
    status = 'published',
    sortBy = 'newest',
    page = 1,
    limit = 20,
  } = options

  // Build the where clause progressively to keep TypeScript happy
  const where: Parameters<typeof db.marketplaceListing.findMany>[0]['where'] = { status }

  if (type) (where as Record<string, unknown>).type = type
  if (category) (where as Record<string, unknown>).category = category

  if (query) {
    (where as Record<string, unknown>).OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
    ]
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceFilter: Record<string, number> = {}
    if (minPrice !== undefined) priceFilter.gte = minPrice
    if (maxPrice !== undefined) priceFilter.lte = maxPrice
    ;(where as Record<string, unknown>).price = priceFilter
  }

  // Tags are stored as a JSON string — use a simple contains check per tag
  if (tags && tags.length > 0) {
    const tagFilters = tags.map((tag) => ({
      tags: { contains: tag },
    }))
    ;(where as Record<string, unknown>).AND = tagFilters
  }

  const orderBy: Record<string, 'asc' | 'desc'> =
    sortBy === 'popular' ? { downloads: 'desc' }
    : sortBy === 'rating' ? { rating: 'desc' }
    : sortBy === 'price_asc' ? { price: 'asc' }
    : sortBy === 'price_desc' ? { price: 'desc' }
    : { createdAt: 'desc' }

  const safePage = Math.max(1, page)
  const safeLimit = Math.min(100, Math.max(1, limit))

  const [listings, total] = await Promise.all([
    db.marketplaceListing.findMany({
      where,
      orderBy,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      include: {
        user: { select: { name: true, avatar: true } },
      },
    }),
    db.marketplaceListing.count({ where }),
  ])

  return {
    listings: listings.map(serializeListing),
    total,
    page: safePage,
    totalPages: Math.ceil(total / safeLimit),
  }
}
