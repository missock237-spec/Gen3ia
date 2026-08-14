import { NextRequest, NextResponse } from 'next/server'
import { applySecurity, secureResponse } from '@/lib/security'
import {
  purchaseListing,
  verifyAccess,
  getPurchaseHistory,
} from '@/lib/marketplace/purchase-system'

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request)
  if (error) return error
  return new NextResponse(null, { status: 204 })
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  })

  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'history'

    if (action === 'verify') {
      const listingId = searchParams.get('listingId')



      if (!listingId) {
        return secureResponse(
          NextResponse.json({ error: 'listingId required' }, { status: 400 }),
          request
        )
      }

      const hasAccess = await verifyAccess(auth.userId, listingId)
      return secureResponse(NextResponse.json({ hasAccess }), request)
    }

    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const result = await getPurchaseHistory(auth.userId, { page, limit })
    return secureResponse(NextResponse.json(result), request)
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to get purchase history' },
      { status: 500 }
    )
    return secureResponse(res, request)
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 10, windowMs: 60000 },
  })

  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { listingId } = body

    if (!listingId) {
      return secureResponse(
        NextResponse.json({ error: 'listingId is required' }, { status: 400 }),
        request
      )
    }

    const result = await purchaseListing({
      listingId,
      userId: auth.userId,
    })

    if (result.mode === 'stripe') {
      return secureResponse(
        NextResponse.json(
          {
            mode: 'stripe',
            sessionId: result.sessionId,
            checkoutUrl: result.checkoutUrl,
          },
          { status: 200 }
        ),
        request
      )
    }

    return secureResponse(
      NextResponse.json(
        {
          mode: 'free',
          purchase: result.purchase,
        },
        { status: 201 }
      ),
      request
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to complete purchase'
    const status =
      message.includes('not found') ||
      message.includes('own listing') ||
      message.includes('available')
        ? 400
        : 500

    const res = NextResponse.json({ error: message }, { status })
    return secureResponse(res, request)
  }
}
