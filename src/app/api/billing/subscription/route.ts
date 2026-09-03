import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { audit } from "@/lib/engines/audit"
import { getAppUrl } from "@/lib/config"
import { createChariowCheckout, chariowConfigured } from "@/lib/payments/chariow"
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
 * POST   /api/billing/subscription — { planKey, interval } : ouvre un
 *          checkout Chariow (UNIQUE processeur, ADR-0007) ; le plan interne
 *          est « sub:<planKey>:<interval> » activé par le webhook Chariow.
 * DELETE /api/billing/subscription — annulation à l'échéance (crédits
 *          conservés jusqu'au bout de la période payée).
 */
const subscribeSchema = z.object({
  planKey: z.enum(["starter", "pro", "business"]),
  interval: z.enum(["monthly", "yearly"]),
})

export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const overview = await subscriptionOverview(user.id)
    return Response.json({
      ok: true,
      ...overview,
      processor: { chariow: chariowConfigured() },
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

    if (!chariowConfigured()) {
      throw new ApiError(
        503,
        "Paiements non activés : la clé CHARIOW_API_KEY n'est pas configurée sur ce serveur.",
        "CHARIOW_NOT_CONFIGURED"
      )
    }

    const planKey = `sub:${plan.key}:${interval}`
    const appUrl = getAppUrl()

    const payment = await db.payment.create({
      data: {
        userId: user.id,
        provider: "chariow",
        checkoutId: "pending",
        plan: planKey,
        amount,
        currency: plan.currency,
        credits: plan.creditsPerPeriod,
        status: "PENDING",
      },
    })

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
