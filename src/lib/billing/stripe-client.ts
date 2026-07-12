import Stripe from 'stripe'

import { db } from '@/lib/db'
import { createLogger } from '@/lib/logger'

const log = createLogger('stripe-client')

// Fixed: removed invalid `typescript: true` — not a valid Stripe SDK constructor option
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set')
  }
  return new Stripe(key)
}

let _stripe: Stripe | null = null

function stripe(): Stripe {
  if (!_stripe) {
    _stripe = getStripe()
  }
  return _stripe
}

function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL
  if (!url) {
    throw new Error('NEXT_PUBLIC_APP_URL environment variable is not set')
  }
  return url.replace(/\/$/, '')
}

export interface CheckoutSessionInput {
  userId: string
  priceId: string
  planId: string
  successUrl?: string
  cancelUrl?: string
  mode?: 'payment' | 'subscription'
}

export interface PortalSessionInput {
  userId: string
  returnUrl?: string
}

export interface SubscriptionInfo {
  id: string
  plan: string
  status: string
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

export async function createCheckoutSession(
  input: CheckoutSessionInput
): Promise<{ sessionId: string; url: string }> {
  const { userId, priceId, planId, successUrl, cancelUrl, mode } = input
  const customerId = await getOrCreateCustomer(userId)
  const appUrl = getAppUrl()

  const session = await stripe().checkout.sessions.create({
    customer: customerId,
    mode: mode || 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url:
      successUrl || `${appUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl || `${appUrl}?checkout=cancel`,
    metadata: { userId, planId },
    subscription_data:
      mode === 'subscription'
        ? { metadata: { userId, planId } }
        : undefined,
  })

  log.info('Checkout session created', {
    userId,
    sessionId: session.id,
    planId,
    mode: mode || 'subscription',
  })

  return { sessionId: session.id, url: session.url || '' }
}

export async function createPortalSession(
  input: PortalSessionInput
): Promise<{ url: string }> {
  const { userId, returnUrl } = input

  const subscription = await db.subscription.findFirst({
    where: { userId, status: 'active' },
    select: { stripeCustomerId: true },
  })

  if (!subscription?.stripeCustomerId) {
    throw new Error('No active Stripe customer found for this user')
  }

  const appUrl = getAppUrl()

  const session = await stripe().billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: returnUrl || `${appUrl}?portal=return`,
  })

  log.info('Portal session created', {
    userId,
    customerId: subscription.stripeCustomerId,
  })

  return { url: session.url }
}

export async function handleWebhook(
  payload: string | Buffer,
  signature: string
): Promise<{ received: boolean; event?: string }> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set')
  }

  let event: Stripe.Event

  try {
    event = stripe().webhooks.constructEvent(
      typeof payload === 'string' ? Buffer.from(payload) : payload,
      signature,
      webhookSecret
    )
  } catch (err) {
    log.error('Webhook signature verification failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    throw new Error('Invalid webhook signature')
  }

  log.info('Webhook received', { type: event.type, eventId: event.id })

  switch (event.type) {
    case 'checkout.session.completed': {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
      break
    }
    case 'customer.subscription.created': {
      await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
      break
    }
    case 'customer.subscription.updated': {
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
      break
    }
    case 'customer.subscription.deleted': {
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
      break
    }
    case 'invoice.paid': {
      await handleInvoicePaid(event.data.object as Stripe.Invoice)
      break
    }
    case 'invoice.payment_failed': {
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
      break
    }
    default: {
      log.info('Unhandled webhook event type', { type: event.type })
    }
  }

  return { received: true, event: event.type }
}

export async function getSubscription(
  userId: string
): Promise<SubscriptionInfo | null> {
  const subscription = await db.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  if (!subscription) return null

  return {
    id: subscription.id,
    plan: subscription.plan,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    stripeCustomerId: subscription.stripeCustomerId,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
  }
}

// ---------------------------------------------------------------------------
// Internal: Webhook Handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const userId = session.metadata?.userId
  const planId = session.metadata?.planId

  if (!userId || !planId) {
    log.error('Missing metadata in checkout session', { sessionId: session.id })
    return
  }

  if (session.mode === 'payment') {
    const { addCredits } = await import('./credits')
    const creditAmount = parseInt(session.metadata?.creditAmount || '0', 10)

    if (creditAmount > 0) {
      await addCredits({
        userId,
        amount: creditAmount,
        type: 'purchase',
        resourceType: 'credit_purchase',
        description: `Credit purchase: ${creditAmount} credits`,
        metadata: {
          stripeSessionId: session.id,
          paymentIntentId: session.payment_intent as string,
        },
      })
    }
  }

  log.info('Checkout completed', { userId, planId, mode: session.mode })
}

async function handleSubscriptionCreated(
  subscription: Stripe.Subscription
): Promise<void> {
  const userId = subscription.metadata?.userId
  const planId = subscription.metadata?.planId

  if (!userId) {
    log.error('Missing userId in subscription metadata', {
      subscriptionId: subscription.id,
    })
    return
  }

  const periodStart = (subscription as unknown as { current_period_start: number }).current_period_start
  const periodEnd = (subscription as unknown as { current_period_end: number }).current_period_end

  await db.subscription.upsert({
    where: { stripeCustomerId: subscription.customer as string },
    create: {
      userId,
      plan: planId || 'free',
      stripeCustomerId: subscription.customer as string,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price.id,
      status: subscription.status,
      currentPeriodStart: new Date(periodStart * 1000),
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialStart: subscription.trial_start
        ? new Date(subscription.trial_start * 1000)
        : null,
      trialEnd: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
    },
    update: {
      plan: planId || 'free',
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price.id,
      status: subscription.status,
      currentPeriodStart: new Date(periodStart * 1000),
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  })

  await db.user.update({
    where: { id: userId },
    data: { plan: planId || 'free' },
  })

  const { addCredits } = await import('./credits')
  const { PLAN_CREDITS } = await import('./plans')
  const credits = PLAN_CREDITS[planId as keyof typeof PLAN_CREDITS] || 0

  if (credits > 0) {
    await addCredits({
      userId,
      amount: credits,
      type: 'bonus',
      resourceType: 'plan_upgrade',
      description: `${planId} plan credits`,
      metadata: { subscriptionId: subscription.id },
    })
  }

  log.info('Subscription created', {
    userId,
    planId,
    subscriptionId: subscription.id,
  })
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const userId = subscription.metadata?.userId
  const periodStart = (subscription as unknown as { current_period_start: number }).current_period_start
  const periodEnd = (subscription as unknown as { current_period_end: number }).current_period_end

  await db.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: subscription.status,
      currentPeriodStart: new Date(periodStart * 1000),
      currentPeriodEnd: new Date(periodEnd * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      stripePriceId: subscription.items.data[0]?.price.id,
    },
  })

  if (userId) {
    await db.user.update({
      where: { id: userId },
      data: { plan: subscription.metadata?.planId || 'free' },
    })
  }

  log.info('Subscription updated', {
    subscriptionId: subscription.id,
    status: subscription.status,
  })
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const userId = subscription.metadata?.userId

  await db.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: { status: 'canceled', cancelAtPeriodEnd: false },
  })

  if (userId) {
    await db.user.update({
      where: { id: userId },
      data: { plan: 'free' },
    })
  }

  log.info('Subscription deleted', { subscriptionId: subscription.id })
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.customer) return

  await db.invoice.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      userId: invoice.metadata?.userId || '',
      stripeInvoiceId: invoice.id,
      subscriptionId: (invoice as unknown as { subscription: string | null }).subscription,
      amount: invoice.amount_paid / 100,
      currency: invoice.currency,
      status: 'paid',
      pdfUrl: invoice.invoice_pdf,
      hostedUrl: invoice.hosted_invoice_url,
      paidAt: new Date(),
      metadata: JSON.stringify({
        lines: invoice.lines.data.map((line) => ({
          description: line.description,
          amount: line.amount / 100,
        })),
        tax: (invoice as unknown as { tax?: number }).tax
          ? (invoice as unknown as { tax: number }).tax / 100
          : 0,
        total: invoice.total / 100,
      }),
    },
    update: {
      status: 'paid',
      paidAt: new Date(),
      pdfUrl: invoice.invoice_pdf,
      hostedUrl: invoice.hosted_invoice_url,
    },
  })

  log.info('Invoice paid', {
    invoiceId: invoice.id,
    customerId: invoice.customer as string,
    amount: invoice.amount_paid / 100,
  })
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  await db.invoice.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      userId: invoice.metadata?.userId || '',
      stripeInvoiceId: invoice.id,
      subscriptionId: (invoice as unknown as { subscription: string | null }).subscription,
      amount: invoice.amount_due / 100,
      currency: invoice.currency,
      status: 'failed',
      pdfUrl: null,
      hostedUrl: invoice.hosted_invoice_url,
      paidAt: null,
      metadata: JSON.stringify({ failedAt: new Date().toISOString() }),
    },
    update: { status: 'failed' },
  })

  log.warn('Invoice payment failed', {
    invoiceId: invoice.id,
    customerId: invoice.customer as string,
    amountDue: invoice.amount_due / 100,
  })
}

// ---------------------------------------------------------------------------
// Internal: Customer management
// ---------------------------------------------------------------------------

export async function getOrCreateCustomer(userId: string): Promise<string> {
  const existing = await db.subscription.findFirst({
    where: { userId, stripeCustomerId: { not: null } },
    select: { stripeCustomerId: true },
  })

  if (existing?.stripeCustomerId) {
    return existing.stripeCustomerId
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  })

  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  const customer = await stripe().customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId },
  })

  return customer.id
}
