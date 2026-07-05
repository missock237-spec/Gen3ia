import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { handleWebhook, verifyWebhookSignature } from '@/lib/billing/stripe-client'
import { finalizeMarketplaceStripePurchase } from '@/lib/marketplace/purchase-system'
import { db } from '@/lib/db'
import { createLogger } from '@/lib/logger'

const log = createLogger('billing-webhook')

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 })
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, stripe-signature')
  return response
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      )
    }

    const event = verifyWebhookSignature(payload, signature)

    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account

      await db.user.updateMany({
        where: {
          stripeConnectAccountId: account.id,
        },
        data: {
          stripeConnectOnboarded: !!(account.details_submitted && account.charges_enabled),
          stripeConnectDetailsSubmitted: !!account.details_submitted,
          stripeConnectChargesEnabled: !!account.charges_enabled,
          stripeConnectPayoutsEnabled: !!account.payouts_enabled,
          stripeConnectCountry: account.country || null,
          stripeConnectCurrency: account.default_currency || null,
          stripeConnectLastSyncedAt: new Date(),
        },
      })

      return NextResponse.json({
        received: true,
        event: event.type,
        connect: true,
      })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session

      if (session.metadata?.type === 'marketplace_purchase') {
        await finalizeMarketplaceStripePurchase(session)

        return NextResponse.json({
          received: true,
          event: event.type,
          marketplace: true,
        })
      }
    }

    const result = await handleWebhook(payload, signature)

    return NextResponse.json({
      received: result.received,
      event: result.event,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    log.error('Stripe webhook processing failed', { message })

    if (message.toLowerCase().includes('signature') || message.toLowerCase().includes('invalid')) {
      return NextResponse.json(
        { error: 'Webhook signature verification failed' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        error: 'Webhook processing failed',
        details: message,
      },
      { status: 500 }
    )
  }
}
