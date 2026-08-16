import { NextRequest, NextResponse } from 'next/server'
import { applySecurity, secureResponse } from '@/lib/security'
import {
  addReview,
  getReviews,
  getAverageRating,
  markHelpful,
} from '@/lib/marketplace/review-system'

export const dynamic = "force-dynamic";

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
    const listingId = searchParams.get('listingId')

    if (!listingId) {
      return secureResponse(
        NextResponse.json({ error: 'listingId is required' }, { status: 400 }),
        request
      )
    }

// @ts-ignore — type narrowing pending, see refactor ticket
    if (action === 'average') {
      const rating = await getAverageRating(listingId)
      return secureResponse(NextResponse.json(rating), request)
    }

    const page = parsePositiveInt(searchParams.get('page'), 1, 100000)
    const limit = parsePositiveInt(searchParams.get('limit'), 20, 100)

    const rawSort = searchParams.get('sort') || 'newest'
    const sortBy =
      rawSort === 'newest' ||
      rawSort === 'highest' ||
      rawSort === 'lowest' ||
      rawSort === 'helpful'
        ? rawSort
        : 'newest'

    const result = await getReviews(listingId, {
      page,
      limit,
      sortBy,
    })

    return secureResponse(NextResponse.json(result), request)
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to get reviews' },
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
    const { action } = body

    if (action === 'helpful') {
      const { reviewId } = body

      if (!reviewId || typeof reviewId !== 'string') {
        return secureResponse(
          NextResponse.json({ error: 'reviewId required' }, { status: 400 }),
          request
        )
      }

      const success = await markHelpful(reviewId)

      if (!success) {
        return secureResponse(
          NextResponse.json({ error: 'Review not found' }, { status: 404 }),
          request
        )
      }

      return secureResponse(NextResponse.json({ success: true }), request)
    }

    const { listingId, rating, title, content } = body

    if (!listingId || rating === undefined || rating === null) {
      return secureResponse(
        NextResponse.json(
          { error: 'listingId and rating are required' },
          { status: 400 }
        ),
        request
      )
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return secureResponse(
        NextResponse.json(
          { error: 'rating must be an integer between 1 and 5' },
          { status: 400 }
        ),
        request
      )
    }

    if (title !== undefined && (typeof title !== 'string' || title.length > 120)) {
      return secureResponse(
        NextResponse.json(
          { error: 'title must be a string of at most 120 characters' },
          { status: 400 }
        ),
        request
      )
    }

    if (
      content !== undefined &&
      (typeof content !== 'string' || content.length > 5000)
    ) {
      return secureResponse(
        NextResponse.json(
          { error: 'content must be a string of at most 5000 characters' },
          { status: 400 }
        ),
        request
      )
    }

    const review = await addReview({
      listingId,
      userId: auth.userId,
      rating,
      title,
      content,
    })

    return secureResponse(NextResponse.json(review, { status: 201 }), request)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add review'

    const status =
      message.includes('not found') ? 404 :
      message.includes('must') ||
      message.includes('Cannot') ||
      message.includes('required') ||
      message.includes('available') ||
      message.includes('obtain') ? 400 :
      500

    const res = NextResponse.json({ error: message }, { status })
    return secureResponse(res, request)
  }
}
