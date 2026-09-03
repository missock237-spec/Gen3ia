import { db } from "@/lib/db"
import { grantCredits } from "@/lib/credits/ledger"
import { creditAdWallet } from "@/lib/ads/ledger"
import { audit } from "@/lib/engines/audit"
import { activateSubscription, type SubscriptionInterval } from "./subscriptions"

/**
 * Fulfillment partagé des paiements (v3.6 — business).
 *
 * Un SEUL chemin de créditation pour les DEUX processeurs (Chariow et
 * Stripe) : à la confirmation d'un paiement, selon son plan :
 *  - « sub:<planKey>:<interval> » → ACTIVATION D'ABONNEMENT (période,
 *    crédits inclus, plan du compte) ;
 *  - « ads_recharge » → portefeuille publicitaire ;
 *  - packs/one-shot → upgrade de plan (comportement historique) + crédits.
 * Toute écriture passe par le Credit Ledger (jamais de solde direct).
 */

export interface FulfillablePayment {
  id: string
  userId: string
  plan: string
  credits: number
  amount: number
}

/** Parse un plan « sub:<planKey>:<interval> ». */
export function parseSubscriptionPlan(plan: string): { planKey: string; interval: SubscriptionInterval } | null {
  if (!plan.startsWith("sub:")) return null
  const [, planKey, interval] = plan.split(":")
  if (!planKey || (interval !== "monthly" && interval !== "yearly")) return null
  return { planKey, interval }
}

/**
 * Applique le succès d'un paiement (idempotence gérée par l'appelant :
 * statut SUCCEEDED vérifié AVANT l'appel).
 */
export async function fulfillPayment(
  payment: FulfillablePayment,
  checkoutId: string,
  rawBody: string,
  provider: "chariow" | "stripe"
): Promise<void> {
  const subscriptionPlan = parseSubscriptionPlan(payment.plan)

  if (subscriptionPlan) {
    // v3.6 — abonnement SaaS : période + crédits inclus + plan du compte.
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "SUCCEEDED", raw: rawBody.slice(0, 5000) },
    })
    const activated = await activateSubscription({
      userId: payment.userId,
      planKey: subscriptionPlan.planKey,
      interval: subscriptionPlan.interval,
      provider,
      providerRef: checkoutId,
    })
    await audit(null, {
      userId: payment.userId,
      action: "SUBSCRIPTION_ACTIVATED",
      entityType: "subscription",
      entityId: activated.subscriptionId,
      detail: { plan: subscriptionPlan.planKey, interval: subscriptionPlan.interval, credits: activated.creditsGranted, provider },
    })
    return
  }

  // Comportement historique (packs + crédits à la carte + pub).
  const isPlanPurchase = payment.plan === "starter" || payment.plan === "pro" || payment.plan === "business"
  await db.$transaction([
    db.payment.update({
      where: { id: payment.id },
      data: { status: "SUCCEEDED", raw: rawBody.slice(0, 5000) },
    }),
    ...(isPlanPurchase
      ? [
          db.user.update({
            where: { id: payment.userId },
            data: { plan: payment.plan === "business" ? "ENTERPRISE" : payment.plan === "pro" ? "PRO" : "FREE" },
          }),
        ]
      : []),
  ])

  if (payment.plan === "ads_recharge") {
    await creditAdWallet(payment.userId, payment.amount, {
      type: "RECHARGE",
      description: `Recharge publicitaire (${provider}) — ${payment.amount.toLocaleString("fr-FR")} FCFA`,
      paymentId: payment.id,
    })
  } else {
    await grantCredits(payment.userId, payment.credits, {
      type: "TOPUP",
      description: `Recharge ${provider} — pack ${payment.plan ?? "custom"} (${payment.credits} crédits)`,
      refType: "payment",
      refId: payment.id,
    })
  }
  await audit(null, {
    userId: payment.userId,
    action: "PAYMENT_SUCCEEDED",
    entityType: "payment",
    entityId: payment.id,
    detail: { credits: payment.credits, checkoutId, provider },
  })
}
