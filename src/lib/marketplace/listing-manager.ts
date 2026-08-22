/**
 * Listing Manager — CRUD for marketplace listings
 *
 * Hardened rules:
 * - Draft / archived / suspended listings are only visible to their owner
 * - Published listings are visible to authenticated viewers
 * - Runtime validation for create / update
 *
 * Notes façade Firestore :
 * - Les documents n'ont PAS de champ `id` en données (l'id est injecté
 *   côté client par la façade) : toute recherche par id passe par
 *   findUnique({ where: { id } }), JAMAIS par un filtre where sur 'id'.
 * - `include: { user: ... }` est accepté mais ignoré : la jointure auteur
 *   est faite explicitement en mémoire (fetchAuthor / fetchAuthors).
 * - Recherche texte / plages de prix / tags : appliqués en mémoire —
 *   Firestore n'a pas de LIKE, et combiner un filtre de plage avec un
 *   orderBy sur un autre champ exige un index composite (erreur runtime).
 *   Seuls les filtres d'ÉGALITÉ (status/type/category) partent au serveur.
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

/** Timestamp tolérant : Date, string ISO, ou valeur corrompue → 0. */
function toTime(value: unknown): number {
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isNaN(t) ? 0 : t
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const t = new Date(value).getTime()
    return Number.isNaN(t) ? 0 : t
  }
  return 0
}

interface AuthorInfo {
  name: string
  avatar: string | null
}

/** Jointure mémoire : auteur d'un listing (include ignoré par la façade). */
async function fetchAuthor(userId: string): Promise<AuthorInfo | undefined> {
  if (!userId) return undefined
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: ['name', 'avatar'],
    })
    if (!user) return undefined
    const u = user as Record<string, unknown>
    return { name: String(u.name ?? ''), avatar: (u.avatar as string | null) ?? null }
  } catch {
    return undefined
  }
}

/** Jointure mémoire en parallèle pour une page de listings. */
async function fetchAuthors(userIds: string[]): Promise<Map<string, AuthorInfo>> {
  const map = new Map<string, AuthorInfo>()
  const unique = [...new Set(userIds.filter(Boolean))]
  const results = await Promise.all(
    unique.map(async (id) => [id, await fetchAuthor(id)] as const),
  )
  for (const [id, author] of results) {
    if (author) map.set(id, author)
  }
  return map
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
    tags: Array.isArray(listing.tags)
      ? (listing.tags as unknown as string[])
      : safeParse<string[]>(String(listing.tags ?? '[]'), []),
    price: listing.price,
    currency: listing.currency,
    config:
      typeof listing.config === 'string'
        ? safeParse<Record<string, unknown>>(listing.config, {})
        : ((listing.config as unknown as Record<string, unknown>) ?? {}),
    previewUrl: listing.previewUrl,
    downloads: listing.downloads,
    installCount: listing.installCount,
    rating: listing.rating,
    reviewCount: listing.reviewCount,
    status: listing.status,
    metadata:
      typeof listing.metadata === 'string'
        ? safeParse<Record<string, unknown>>(listing.metadata, {})
        : ((listing.metadata as unknown as Record<string, unknown>) ?? {}),
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

/** Forme brute d'un document listing en base (telle que lue par la façade). */
type StoredListing = Parameters<typeof serializeListing>[0]

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
  })

  // include ignoré par la façade → jointure auteur explicite
  const author = await fetchAuthor(userId)
  return serializeListing({ ...(listing as StoredListing), user: author })
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

  // Correctif : findFirst({ where: { id, userId } }) interrogeait le champ
  // de données 'id' — inexistant (l'id est l'identifiant du document) —
  // donc retournait TOUJOURS null. On lit par id puis on vérifie le owner.
  const existing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
  })

  if (!existing || (existing as Record<string, unknown>).userId !== userId) {
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
    const existingMeta = (existing as Record<string, unknown>).metadata
    const currentMeta =
      typeof existingMeta === 'string'
        ? safeParse<Record<string, unknown>>(existingMeta, {})
        : ((existingMeta as Record<string, unknown> | undefined) ?? {})
    data.metadata = JSON.stringify({
      ...currentMeta,
      ...options.metadata,
    })
  }

  if (options.status === 'published' && (existing as Record<string, unknown>).status !== 'published') {
    data.publishedAt = new Date()
  }

  const listing = await db.marketplaceListing.update({
    where: { id: listingId },
    data,
  })

  const author = await fetchAuthor(userId)
  return serializeListing({ ...(listing as StoredListing), user: author })
}

// ---------------------------------------------------------------------------
// Core: Publish Listing
// ---------------------------------------------------------------------------

export async function publishListing(
  userId: string,
  listingId: string
): Promise<MarketplaceListingResult> {
  return updateListing(userId, listingId, { status: 'published' })
}

// ---------------------------------------------------------------------------
// Core: Search Listings
// ---------------------------------------------------------------------------

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

  // 1. Filtres d'ÉGALITÉ côté serveur uniquement — pas d'index composite
  //    requis (l'ordre est appliqué en mémoire à l'étape 3).
  const where: Record<string, unknown> = { status }
  if (type) where.type = type
  if (category) where.category = category

  const all = (await db.marketplaceListing.findMany({
    where,
  })) as unknown as StoredListing[]

  // 2. Filtres mémoire : texte (Firestore n'a pas de LIKE), prix (plage),
  //    tags (stockés en JSON string — `contains` serveur ne matcherait
  //    jamais un tag isolé).
  let rows = all

  if (query) {
    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (l) =>
          String(l.name || '').toLowerCase().includes(q) ||
          String(l.description || '').toLowerCase().includes(q),
      )
    }
  }

  if (minPrice !== undefined) rows = rows.filter((l) => Number(l.price) >= minPrice)
  if (maxPrice !== undefined) rows = rows.filter((l) => Number(l.price) <= maxPrice)

  if (tags && tags.length > 0) {
    rows = rows.filter((l) => {
      const listingTags = Array.isArray(l.tags)
        ? (l.tags as unknown as string[])
        : safeParse<string[]>(String(l.tags ?? '[]'), [])
      return tags.every((tag) => listingTags.includes(tag))
    })
  }

  // 3. Tri mémoire (tolérant aux dates corrompues via toTime)
  switch (sortBy) {
    case 'popular':
      rows.sort(
        (a, b) =>
          Number(b.downloads || 0) - Number(a.downloads || 0) ||
          Number(b.rating || 0) - Number(a.rating || 0),
      )
      break
    case 'rating':
      rows.sort(
        (a, b) =>
          Number(b.rating || 0) - Number(a.rating || 0) ||
          Number(b.reviewCount || 0) - Number(a.reviewCount || 0),
      )
      break
    case 'price_asc':
      rows.sort((a, b) => Number(a.price || 0) - Number(b.price || 0))
      break
    case 'price_desc':
      rows.sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
      break
    case 'newest':
    default:
      rows.sort(
        (a, b) => toTime(b.publishedAt) - toTime(a.publishedAt) || toTime(b.createdAt) - toTime(a.createdAt),
      )
  }

  // 4. Pagination mémoire — totaux exacts sur l'ensemble filtré
  const total = rows.length
  const paged = rows.slice((page - 1) * limit, page * limit)

  // 5. Jointure auteur sur la page uniquement (include ignoré par la façade)
  const authors = await fetchAuthors(paged.map((l) => String(l.userId)))
  const listings = paged.map((l) =>
    serializeListing({ ...l, user: authors.get(String(l.userId)) }),
  )

  return {
    listings,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }
}

// ---------------------------------------------------------------------------
// Core: Get Listing by ID
// ---------------------------------------------------------------------------

export async function getListing(
  listingId: string
): Promise<MarketplaceListingResult | null> {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
  })

  if (!listing) return null
  const row = listing as StoredListing
  const author = await fetchAuthor(String(row.userId ?? ''))
  return serializeListing({ ...row, user: author })
}

export async function getListingForViewer(
  viewerUserId: string,
  listingId: string
): Promise<MarketplaceListingResult | null> {
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
  })

  if (!listing) return null
  const row = listing as StoredListing

  const isOwner = row.userId === viewerUserId
  const isPublished = row.status === 'published'

  if (!isOwner && !isPublished) {
    return null
  }

  const author = await fetchAuthor(String(row.userId ?? ''))
  return serializeListing({ ...row, user: author })
}

// ---------------------------------------------------------------------------
// Core: Delete Listing
// ---------------------------------------------------------------------------

export async function deleteListing(
  userId: string,
  listingId: string
): Promise<boolean> {
  // Correctif : même bug champ 'id' que updateListing (toujours null).
  const listing = await db.marketplaceListing.findUnique({
    where: { id: listingId },
  })

  if (!listing || (listing as Record<string, unknown>).userId !== userId) return false

  await db.marketplaceListing.delete({
    where: { id: listingId },
  })

  return true
}

// ---------------------------------------------------------------------------
// Core: Increment downloads / installs
// ---------------------------------------------------------------------------
// { increment: 1 } est converti en FieldValue.increment(1) par la façade
// (serializeUpdate) — incrément atomique côté serveur, sans race condition.

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
