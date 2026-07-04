/**
 * Marketplace Seller Connect API — POST: start/continue onboarding, GET: check status
 *
 * Crée (ou récupère) le compte Stripe Connect Express du vendeur et renvoie
 * un lien d'onboarding hébergé par Stripe. Une fois l'onboarding terminé,
 * stripeConnectOnboarded passe à true et les prochains achats sur les
 * listings de ce vendeur déclenchent automatiquement le split 75/25
 * (voir src/lib/marketplace/purchase-system.ts).
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { applySecurity, secureResponse } from '@/lib/security'
import { db } from '@/lib/db'

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set')
  }
  return new Stripe(key, { typescript: true })
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request)
  if (error) return error
  return new NextResponse(null, { status: 204 })
}

// GET → statut de l'onboarding vendeur (à afficher dans le dashboard vendeur)
export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  })

  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 })
  }

  try {
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: {
        stripeConnectAccountId: true,
        stripeConnectOnboarded: true,
      },
    })

    return secureResponse(
      NextResponse.json({
        connected: !!user?.stripeConnectAccountId,
        onboarded: !!user?.stripeConnectOnboarded,
      }),
      request
    )
  } catch {
    return secureResponse(
      NextResponse.json({ error: 'Failed to fetch Connect status' }, { status: 500 }),
      request
    )
  }
}

// POST → crée le compte Connect si besoin + retourne le lien d'onboarding Stripe
export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 5, windowMs: 60000 },
  })

  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 })
  }

  try {
    const stripe = getStripe()

    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, email: true, name: true, stripeConnectAccountId: true },
    })

    if (!user) {
      return secureResponse(
        NextResponse.json({ error: 'User not found' }, { status: 404 }),
        request
      )
    }

    let accountId = user.stripeConnectAccountId

    // 1. Créer le compte Express seulement s'il n'existe pas déjà
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        business_type: 'individual',
        metadata: { userId: user.id },
      })

      accountId = account.id

      await db.user.update({
        where: { id: user.id },
        data: { stripeConnectAccountId: accountId },
      })
    }

    // 2. Générer le lien d'onboarding hébergé (à ouvrir dans un navigateur/WebView)
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${getAppUrl()}/dashboard/seller/connect?refresh=true`,
      return_url: `${getAppUrl()}/dashboard/seller/connect?success=true`,
      type: 'account_onboarding',
    })

    return secureResponse(
      NextResponse.json({
        accountId,
        onboardingUrl: accountLink.url,
      }),
      request
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to start Connect onboarding'
    return secureResponse(NextResponse.json({ error: message }, { status: 500 }), request)
  }
}
