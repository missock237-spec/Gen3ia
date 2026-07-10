/**
 * Listing Manager - CRUD, visibility and moderation for marketplace listings.
 *
 * Hardened rules:
 * - Public marketplace responses never expose installable config.
 * - Owners and verified buyers can access full config.
 * - Owners can submit listings for review, but cannot self-publish.
 * - Admins moderate submitted listings into approved/published/rejected/suspended states.
 */

import { db } from '@/lib/db'

export type ListingType = 'agent' | 'workflow' | 'template' | 'plugin'
export type ListingStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'archived'
  | 'suspended'
export type OwnerListingStatus = 'draft' | 'submitted' | 'archived'
export type ModerationStatus = 'approved' | 'published' | 'rejected' | 'suspended'
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
  hasConfigAccess: boolean
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

const VALID_TYPES: ListingType[] = ['agent', 'workflow', 'template', 'plugin']
const VALID_STATUSES: ListingStatus[] = [
  'draft',
  'submitted',
  'approved',
  'published',
  'rejected',
  'archived',
  'suspended',
]
const OWNER_ALLOWED_STATUSES: OwnerListingStatus[] = ['draft', 'submitted', 'archived']
const MODERATION_STATUSES: ModerationStatus[] = [
  'approved',
  'published',
  'rejected',
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

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80)

  return `${base}-${Math.random().toString(36).substring(2, 8)}`
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

function assertPlainObject(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (value === undefined) return
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be a JSON object`)
  }
}

function assertValidPreviewUrl(value?: string | null): void {
  if (value === undefined || value === null || value === '') return

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('invalid protocol')
    }
  } catch {
    throw new Error('previewUrl must be a valid HTTP(S) URL')
  }
}

function assertValidTags(tags?: string[]): void {
  if (tags === undefined) return

  if (!Array.isArray(tags) || tags.length > 20) {
    throw new Error('Tags must be an array with at most 20 items')
  }

  if (tags.some((tag) => typeof tag !== 'string' || tag.trim().length === 0 || tag.length > 40)) {
    throw new Error('Each tag must be a non-empty string up to 40 characters')
  }
}

function assertSafeMarketplaceConfig(config?: Record<string, unknown>): void {
  if (!config) return

  const serialized = JSON.stringify(config).toLowerCase()
  const forbiddenTerms = [
    'apikey',
    'api_key',
    'secret',
    'password',
    'token',
    'private_key',
    'authorization',
  ]

  const leakedTerm = forbiddenTerms.find((term) => serialized.includes(term))
  if (leakedTerm) {
    throw new Error(`Config appears to contain sensitive data: ${leakedTerm}`)
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

  assertValidTags(options.tags)

  if (options.price !== undefined && (Number.isNaN(options.price) || options.price < 0)) {
    throw new Error('Price must be a number greater than or equal to 0')
  }

  assertPlainObject(options.config, 'config')
  assertPlainObject(options.metadata, 'metadata')
  assertSafeMarketplaceConfig(options.config)
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

  assertValidTags(options.tags)

  if (options.price !== undefined && (Number.isNaN(options.price) || options.price < 0)) {
    throw new Error('Price must be a number greater than or equal to 0')
  }

  if (options.status !== undefined && !VALID_STATUSES.includes(options.status)) {
    throw new Error(`Invalid listing status: ${options.status}`)
  }

  if (options.status !== undefined && !OWNER_ALLOWED_STATUSES.includes(options.status as OwnerListingStatus)) {
    throw new Error('This status can only be changed by marketplace moderation')
  }

  assertPlainObject(options.config, 'config')
  assertPlainObject(options.metadata, 'metadata')
  assertSafeMarketplaceConfig(options.config)
  assertValidPreviewUrl(options.previewUrl)
}

function serializeListing(
  listing: {
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
  },
  options: { includeConfig?: boolean } = {}
): MarketplaceListingResult {
  const includeConfig = Boolean(options.includeConfig)

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
    config: includeConfig ? safeParse<Record<string, unknown>>(listing.config, {}) : {},
    hasConfigAccess: includeConfig,
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

async function hasCompletedPurchase(userId: string, listingId: string): Promise<boolean> {
  const purchase = await db.marketplacePurchase.findUnique({
    where: {
      userId_listingId: {
        userId,
        listingId,
      },
    },
    select: { status: true },
  })

  return purchase?.status === 'completed'
}

async function assertMarketplaceAdmin(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  if (!user || user.role !== 'admin') {
    throw new Error('Marketplace moderation requires an admin account')
  }
}

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
        version: String(options.metadata?.version || '1.0.0'),
        changelog: Array.isArray(options.metadata?.changelog) ? options.metadata.changelog : [],
        moderation: {
          status: 'draft',
          notes: [],
        },
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

  return serializeListing(listing, { includeConfig: true })
}

export async function updateListing(
  userId: string,
  listingId: string,
  options: UpdateListingOptions
): Promise<MarketplaceListingResult> {
  assertValidUpdateInput(options)

  const existing = await db.marketplaceListing.findFirst({
    where: {
      id: listingId,
      userId,
    },
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

  if (options.metadata !== undefined || options.status !== undefined) {
    const currentMeta = safeParse<Record<string, unknown>>(existing.metadata, {})
    const moderation = safeParse<Record<string, unknown>>(
      JSON.stringify(currentMeta.moderation || {}),
      {}
    )

    data.metadata = JSON.stringify({
      ...currentMeta,
      ...(options.metadata || {}),
      moderation: {
        ...moderation,
        status: options.status || moderation.status || existing.status,
        submittedAt:
          options.status === 'submitted'
            ? new Date().toISOString()
            : moderation.submittedAt,
      },
    })
  }

  const listing = await db.marketplaceListing.update({
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

  return serializeListing(listing, { includeConfig: true })
}

export async function submitListingForReview(
  userId: string,
  listingId: string
): Promise<MarketplaceListingResult> {
  return updateListing(userId, listingId, { status: 'submitted' })
}

export async function publishListing(
  userId: string,
  listingId: string
): Promise<MarketplaceListingResult> {
  return submitListingForReview(userId, listingId)
}

export async function moderateListing(
  adminUserId: string,
  listingId: string,
  status: ModerationStatus,
  notes?: string
): Promise<MarketplaceListingResult> {
  await assertMarketplaceAdmin(adminUserId)

  if (!MODERATION_STATUSES.includes(status)) {
    throw new Error(`Invalid moderation status: ${status}`)
  }

  const existing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
  })

  if (!existing) {
    throw new Error('Listing not found')
  }

  const currentMeta = safeParse<Record<string, unknown>>(existing.metadata, {})
  const moderation = safeParse<Record<string, unknown>>(
    JSON.stringify(currentMeta.moderation || {}),
    {}
  )
  const moderationNotes = Array.isArray(moderation.notes) ? moderation.notes : []
  const now = new Date()

  const listing = await db.marketplaceListing.update({
    where: { id: listingId },
    data: {
      status,
      publishedAt: status === 'published' && !existing.publishedAt ? now : existing.publishedAt,
      metadata: JSON.stringify({
        ...currentMeta,
        moderation: {
          ...moderation,
          status,
          moderatedBy: adminUserId,
          moderatedAt: now.toISOString(),
          notes: notes
            ? [
                ...moderationNotes,
                {
                  status,
                  note: notes,
                  createdAt: now.toISOString(),
                  createdBy: adminUserId,
                },
              ]
            : moderationNotes,
        },
      }),
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

  return serializeListing(listing, { includeConfig: true })
}

export async function searchListings(
  options: SearchListingsOptions = {}
): Promise<{
  listings: MarketplaceListingResult[]
  total: number
  page: number
  totalPages: number
}> {
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

  const safePage = Math.max(1, page)
  const safeLimit = Math.min(100, Math.max(1, limit))
  const where: Record<string, unknown> = { status, isActive: true }

  if (type) where.type = type
  if (category) where.category = category

  if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
    ]
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceFilter: Record<string, number> = {}
    if (minPrice !== undefined) priceFilter.gte = minPrice
    if (maxPrice !== undefined) priceFilter.lte = maxPrice
    where.price = priceFilter
  }

  if (tags && tags.length > 0) {
    where.AND = tags.map((tag) => ({
      tags: {
        contains: JSON.stringify(tag).slice(1, -1),
      },
    }))
  }

  let orderBy:
    | Array<Record<string, 'asc' | 'desc'>>
    | Record<string, 'asc' | 'desc'>

  switch (sortBy) {
    case 'popular':
      orderBy = [{ downloads: 'desc' }, { rating: 'desc' }]
      break
    case 'rating':
      orderBy = [{ rating: 'desc' }, { reviewCount: 'desc' }]
      break
    case 'price_asc':
      orderBy = [{ price: 'asc' }]
      break
    case 'price_desc':
      orderBy = [{ price: 'desc' }]
      break
    case 'newest':
    default:
      orderBy = [{ publishedAt: 'desc' }, { createdAt: 'desc' }]
  }

  const [listings, total] = await Promise.all([
    db.marketplaceListing.findMany({
      where,
      orderBy,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      include: {
        user: {
          select: {
            name: true,
            avatar: true,
          },
        },
      },
    }),
    db.marketplaceListing.count({ where }),
  ])

  return {
    listings: listings.map((listing) => serializeListing(listing, { includeConfig: false })),
    total,
    page: safePage,
    totalPages: Math.ceil(total / safeLimit),
  }
}

export async function getListing(
  listingId: string
): Promise<MarketplaceListingResult | null> {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    include: {
      user: {
        select: {
          name: true,
          avatar: true,
        },
      },
    },
  })

  return listing ? serializeListing(listing, { includeConfig: false }) : null
}

export async function getListingForViewer(
  viewerUserId: string,
  listingId: string
): Promise<MarketplaceListingResult | null> {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
    include: {
      user: {
        select: {
          name: true,
          avatar: true,
        },
      },
    },
  })

  if (!listing || !listing.isActive) return null

  const isOwner = listing.userId === viewerUserId
  const isPublished = listing.status === 'published'
  const purchased = isOwner ? false : await hasCompletedPurchase(viewerUserId, listingId)

  if (!isOwner && !isPublished) {
    return null
  }

  return serializeListing(listing, { includeConfig: isOwner || purchased })
}

export async function getListingConfigForAccess(
  userId: string,
  listingId: string
): Promise<MarketplaceListingResult> {
  const listing = await getListingForViewer(userId, listingId)

  if (!listing || !listing.hasConfigAccess) {
    throw new Error('Listing access not found or not purchased')
  }

  return listing
}

export async function deleteListing(userId: string, listingId: string): Promise<boolean> {
  const listing = await db.marketplaceListing.findFirst({
    where: {
      id: listingId,
      userId,
    },
  })

  if (!listing) return false

  await db.marketplaceListing.update({
    where: { id: listingId },
    data: {
      isActive: false,
      status: 'archived',
    },
  })

  return true
}

export async function incrementDownloads(listingId: string): Promise<void> {
  await db.marketplaceListing.update({
    where: { id: listingId },
    data: {
      downloads: {
        increment: 1,
      },
    },
  })
}

export async function incrementInstallCount(listingId: string): Promise<void> {
  await db.marketplaceListing.update({
    where: { id: listingId },
    data: {
      installCount: {
        increment: 1,
      },
    },
  })
}
