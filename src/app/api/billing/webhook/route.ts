/**
 * Billing Webhook API — POST: Stripe webhook handler
 *
 * Handles:
 * - subscription lifecycle (existing)
 * - marketplace purchases (added)
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { handleWebhook } from '@/lib/billing/stripe-client'
import { finalizeMarketplaceStripePurchase } from '@/lib/marketplace/purchase-system'

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set')
  }

  return new Stripe(key, { typescript: true })
}

function verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set')
  }

  return getStripe().webhooks.constructEvent(payload, signature, webhookSecret)
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 })
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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

    // Marketplace one-time payments
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

    // Fallback to existing billing/subscription logic
    const result = await handleWebhook(payload, signature)

    return NextResponse.json({
      received: result.received,
      event: result.event,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    if (message.includes('signature') || message.includes('Invalid')) {
      return NextResponse.json(
        { error: 'Webhook signature verification failed' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Webhook processing failed', details: message },
      { status: 500 }
    )
  }
}
