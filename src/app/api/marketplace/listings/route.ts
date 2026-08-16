import { NextRequest, NextResponse } from 'next/server'
import { applySecurity, secureResponse } from '@/lib/security'
import { searchListings, createListing } from '@/lib/marketplace/listing-manager'

export const dynamic = "force-dynamic";

const VALID_TYPES = ['agent', 'workflow', 'template', 'plugin'] as const
const VALID_CATEGORIES = [
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
] as const

function isValidUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request)
  if (error) return error
  return new NextResponse(null, { status: 204 })
}

export async function GET(request: NextRequest) {
  const { error } = await applySecurity(request)
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)

    const query = searchParams.get('q') || undefined
    const rawType = searchParams.get('type') || undefined
    const rawCategory = searchParams.get('category') || undefined
    const rawSort = searchParams.get('sort') || 'newest'
    const rawTags = searchParams.getAll('tag')



    const page = parsePositiveInt(searchParams.get('page'), 1, 100000)
    const limit = parsePositiveInt(searchParams.get('limit'), 20, 100)
    const minPriceRaw = searchParams.get('minPrice')
    const maxPriceRaw = searchParams.get('maxPrice')

    const type = rawType && VALID_TYPES.includes(rawType as any) ? rawType : undefined
    const category =
      rawCategory && VALID_CATEGORIES.includes(rawCategory as any)
        ? rawCategory
        : undefined

    const sortBy =
      rawSort === 'popular' ||
      rawSort === 'rating' ||
      rawSort === 'price_asc' ||
      rawSort === 'price_desc' ||
      rawSort === 'newest'
        ? rawSort
        : 'newest'

    const minPrice =
      minPriceRaw !== null && minPriceRaw !== ''
        ? Number(minPriceRaw)
        : undefined
    const maxPrice =
      maxPriceRaw !== null && maxPriceRaw !== ''
        ? Number(maxPriceRaw)
        : undefined

    if (minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) {
      return secureResponse(
        NextResponse.json({ error: 'minPrice must be a number >= 0' }, { status: 400 }),
        request
      )
    }

    if (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
      return secureResponse(
        NextResponse.json({ error: 'maxPrice must be a number >= 0' }, { status: 400 }),
        request
      )
    }

    const result = await searchListings({
      query,
      type: type as any,
      category: category as any,
      tags: rawTags.length > 0 ? rawTags : undefined,
      minPrice,
      maxPrice,
      sortBy: sortBy as any,
      page,
      limit,
      status: 'published',
    })

    return secureResponse(NextResponse.json(result), request)
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to search listings' },
      { status: 500 }
    )
    return secureResponse(res, request)
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  })

  if (secError || !auth) {
    return (
      secError || NextResponse.json({ error: 'Auth required' }, { status: 401 })
    )
  }

  try {
    const body = await request.json()

    const {
      type,
      name,
      description,
      category,
      tags,
      price,
      currency,
      config,
      previewUrl,
      metadata,
    } = body

    if (!type || !name || !description) {
      return secureResponse(
        NextResponse.json(
          { error: 'Type, name, and description are required' },
          { status: 400 }
        ),
        request
      )
    }

    if (!VALID_TYPES.includes(type)) {
      return secureResponse(
        NextResponse.json(
          { error: `Invalid type. Allowed: ${VALID_TYPES.join(', ')}` },
          { status: 400 }
        ),
        request
      )
    }

    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      return secureResponse(
        NextResponse.json(
          { error: `Invalid category. Allowed: ${VALID_CATEGORIES.join(', ')}` },
          { status: 400 }
        ),
        request
      )
    }

    if (typeof name !== 'string' || name.trim().length < 3 || name.length > 120) {
      return secureResponse(
        NextResponse.json(
          { error: 'Name must be between 3 and 120 characters' },
          { status: 400 }
        ),
        request
      )
    }

    if (
      typeof description !== 'string' ||
      description.trim().length < 10 ||
      description.length > 5000
    ) {
      return secureResponse(
        NextResponse.json(
          { error: 'Description must be between 10 and 5000 characters' },
          { status: 400 }
        ),
        request
      )
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags) || tags.length > 20) {
        return secureResponse(
          NextResponse.json(
            { error: 'Tags must be an array with at most 20 items' },
            { status: 400 }
          ),
          request
        )
      }

      const invalidTag = tags.find(
        (tag) => typeof tag !== 'string' || tag.length > 40
      )

      if (invalidTag !== undefined) {
        return secureResponse(
          NextResponse.json(
            { error: 'Each tag must be a string of at most 40 characters' },
            { status: 400 }
          ),
          request
        )
      }
    }

    if (
      price !== undefined &&
      (!Number.isFinite(price) || typeof price !== 'number' || price < 0)
    ) {
      return secureResponse(
        NextResponse.json(
          { error: 'Price must be a number greater than or equal to 0' },
          { status: 400 }
        ),
        request
      )
    }

    if (previewUrl !== undefined && previewUrl !== null && previewUrl !== '') {
      if (typeof previewUrl !== 'string' || !isValidUrl(previewUrl)) {
        return secureResponse(
          NextResponse.json(
            { error: 'previewUrl must be a valid URL' },
            { status: 400 }
          ),
          request
        )
      }
    }

    if (config !== undefined && !isPlainObject(config)) {
      return secureResponse(
        NextResponse.json(
          { error: 'config must be a JSON object' },
          { status: 400 }
        ),
        request
      )
    }

    if (metadata !== undefined && !isPlainObject(metadata)) {
      return secureResponse(
        NextResponse.json(
          { error: 'metadata must be a JSON object' },
          { status: 400 }
        ),
        request
      )
    }

    const listing = await createListing(auth.userId, {
      type,
      name,
      description,
      category,
      tags,
      price,
      currency,
      config,
      previewUrl,
      metadata,
    })

    return secureResponse(NextResponse.json(listing, { status: 201 }), request)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create listing'

    const status =
      message.includes('Invalid') ||
      message.includes('must be') ||
      message.includes('required')
        ? 400
        : 500

    const res = NextResponse.json({ error: message }, { status })
    return secureResponse(res, request)
  }
            }
