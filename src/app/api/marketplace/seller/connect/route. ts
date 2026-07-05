import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { applySecurity, secureResponse } from '@/lib/security'
import { db } from '@/lib/db'

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

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request)
  if (error) return error
  return new NextResponse(null, { status: 204 })
}

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true })

  if (error || !auth) {
    return error || NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const user = await db.user.findUnique({
    where: { id: auth.userId },
    select: {
      stripeConnectAccountId: true,
      stripeConnectOnboarded: true,
      stripeConnectDetailsSubmitted: true,
      stripeConnectChargesEnabled: true,
      stripeConnectPayoutsEnabled: true,
      stripeConnectCountry: true,
      stripeConnectCurrency: true,
      stripeConnectLastSyncedAt: true,
    },
  })

  return secureResponse(
    NextResponse.json({
      connected: !!user?.stripeConnectAccountId,
      accountId: user?.stripeConnectAccountId || null,
      onboarded: !!user?.stripeConnectOnboarded,
      detailsSubmitted: !!user?.stripeConnectDetailsSubmitted,
      chargesEnabled: !!user?.stripeConnectChargesEnabled,
      payoutsEnabled: !!user?.stripeConnectPayoutsEnabled,
      country: user?.stripeConnectCountry || null,
      currency: user?.stripeConnectCurrency || null,
      lastSyncedAt: user?.stripeConnectLastSyncedAt || null,
    }),
    request
  )
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true })

  if (error || !auth) {
    return error || NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const stripe = getStripe()
  const appUrl = getAppUrl()

  const user = await db.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      email: true,
      name: true,
      stripeConnectAccountId: true,
      stripeConnectOnboarded: true,
      stripeConnectChargesEnabled: true,
    },
  })

  if (!user) {
    return secureResponse(
      NextResponse.json({ error: 'User not found' }, { status: 404 }),
      request
    )
  }

  let body: { country?: string } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const country = body.country?.trim()?.toUpperCase() || 'FR'

  let accountId = user.stripeConnectAccountId

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country,
      email: user.email,
      business_type: 'individual',
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        userId: user.id,
      },
    })

    accountId = account.id

    await db.user.update({
      where: { id: user.id },
      data: {
        stripeConnectAccountId: account.id,
        stripeConnectOnboarded: false,
        stripeConnectDetailsSubmitted: !!account.details_submitted,
        stripeConnectChargesEnabled: !!account.charges_enabled,
        stripeConnectPayoutsEnabled: !!account.payouts_enabled,
        stripeConnectCountry: account.country || country,
        stripeConnectCurrency: account.default_currency || null,
        stripeConnectLastSyncedAt: new Date(),
      },
    })
  }

  const refreshedUser = await db.user.findUnique({
    where: { id: user.id },
    select: {
      stripeConnectAccountId: true,
      stripeConnectOnboarded: true,
      stripeConnectChargesEnabled: true,
    },
  })

  if (
    refreshedUser?.stripeConnectAccountId &&
    refreshedUser.stripeConnectOnboarded &&
    refreshedUser.stripeConnectChargesEnabled
  ) {
    const loginLink = await stripe.accounts.createLoginLink(
      refreshedUser.stripeConnectAccountId
    )

    return secureResponse(
      NextResponse.json({
        connected: true,
        onboarded: true,
        accountId: refreshedUser.stripeConnectAccountId,
        dashboardUrl: loginLink.url,
      }),
      request
    )
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId!,
    refresh_url: `${appUrl}/marketplace/seller?stripe=refresh`,
    return_url: `${appUrl}/marketplace/seller?stripe=return`,
    type: 'account_onboarding',
  })

  return secureResponse(
    NextResponse.json({
      connected: true,
      onboarded: false,
      accountId,
      onboardingUrl: accountLink.url,
      expiresAt: accountLink.expires_at,
    }),
    request
  )
}
