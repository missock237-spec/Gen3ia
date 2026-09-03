import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { audit } from "@/lib/engines/audit"
import { getAppUrl } from "@/lib/config"
import { createChariowCheckout, chariowConfigured } from "@/lib/payments/chariow"
import { createStripeCheckout, stripeConfigured } from "@/lib/payments/stripe"
import {
  findSubscriptionPlan,
  subscriptionPrice,
  subscriptionOverview,
  cancelAtPeriodEnd,
  type SubscriptionInterval,
} from "@/lib/payments/subscriptions"

/**
 * Abonnements SaaS (v3.6 — business).
 *
 * GET    /api/billing/subscription — abonnement actif, historique, catalogues.
 * POST   /api/billing/subscription — { planKey, interval, method? } : ouvre
 *          un checkout (Chariow par défaut, Stripe au choix — les DEUX
 *          processeurs sont supportés) ; le plan interne est
 *          « sub:<planKey>:<interval> » activé par le webhook de paiement.
 * DELETE /api/billing/subscription — annulation à l'échéance (crédits
 *          conservés jusqu'au bout de la période payée).
 */
const subscribeSchema = z.object({
  planKey: z.enum(["starter", "pro", "business"]),
  interval: z.enum(["monthly", "yearly"]),
  method: z.enum(["chariow", "stripe"]).optional(),
})

export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const overview = await subscriptionOverview(user.id)
    return Response.json({
      ok: true,
      ...overview,
      processors: { chariow: chariowConfigured(), stripe: stripeConfigured() },
    })
  })
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, subscribeSchema)

    const plan = findSubscriptionPlan(body.planKey)
    if (!plan) throw new ApiError(400, "Plan d'abonnement inconnu.", "BAD_PLAN")
    const interval: SubscriptionInterval = body.interval
    const amount = subscriptionPrice(plan, interval)
    const description =
      `GEN3IA — Abonnement ${plan.name} ` +
      `${interval === "monthly" ? "mensuel" : "annuel"} (${plan.creditsPerPeriod} crédits/période)`

    // Choix du processeur : explicite, sinon le premier configuré.
    const method = body.method ?? (chariowConfigured() ? "chariow" : stripeConfigured() ? "stripe" : null)
    if (!method) {
      throw new ApiError(
        503,
        "Paiements non activés : ni CHARIOW_API_KEY ni STRIPE_SECRET_KEY configurées sur ce serveur.",
        "NO_PROCESSOR"
      )
    }
    if (method === "stripe" && !stripeConfigured()) {
      throw new ApiError(503, "Stripe non configuré (STRIPE_SECRET_KEY absente).", "STRIPE_NOT_CONFIGURED")
    }

    const planKey = `sub:${plan.key}:${interval}`
    const appUrl = getAppUrl()

    const payment = await db.payment.create({
      data: {
        userId: user.id,
        provider: method,
        checkoutId: "pending",
        plan: planKey,
        amount,
        currency: plan.currency,
        credits: plan.creditsPerPeriod,
        status: "PENDING",
      },
    })

    if (method === "stripe") {
      const session = await createStripeCheckout({
        amount,
        currency: plan.currency,
        customerEmail: user.email,
        description,
        successUrl: `${appUrl}/billing?payment=pending`,
        cancelUrl: `${appUrl}/billing?payment=cancelled`,
        metadata: { userId: user.id, planKey, credits: plan.creditsPerPeriod },
      })
      await db.payment.update({ where: { id: payment.id }, data: { checkoutId: session.sessionId } })
      await audit(req, {
        userId: user.id, action: "CHECKOUT_CREATED", entityType: "payment", entityId: payment.id,
        detail: { plan: planKey, amount, interval, method: "stripe" },
      })
      return Response.json({ ok: true, paymentUrl: session.checkoutUrl, paymentId: payment.id, method: "stripe" })
    }

    const checkout = await createChariowCheckout({
      amount,
      currency: plan.currency,
      customerEmail: user.email,
      description,
      callbackUrl: `${appUrl}/billing?payment=pending`,
      metadata: { userId: user.id, planKey, credits: plan.creditsPerPeriod },
    })
    await db.payment.update({ where: { id: payment.id }, data: { checkoutId: checkout.checkoutId } })
    await audit(req, {
      userId: user.id, action: "CHECKOUT_CREATED", entityType: "payment", entityId: payment.id,
      detail: { plan: planKey, amount, interval, method: "chariow" },
    })
    return Response.json({ ok: true, paymentUrl: checkout.paymentUrl, paymentId: payment.id, method: "chariow" })
  })
}

export async function DELETE(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const cancelled = await cancelAtPeriodEnd(user.id)
    if (!cancelled) {
      throw new ApiError(404, "Aucun abonnement actif à annuler.", "NO_SUBSCRIPTION")
    }
    await audit(req, {
      userId: user.id, action: "SUBSCRIPTION_CANCEL_AT_END", entityType: "subscription",
    })
    return Response.json({ ok: true, message: "Abonnement annulé à l'échéance — vos crédits restent disponibles jusqu'à la fin de la période." })
  })
}
