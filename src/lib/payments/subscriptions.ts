import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { grantCredits } from "@/lib/credits/ledger"
import { PLAN_OFFERS } from "./chariow"

/**
 * Abonnements SaaS (v3.6 — business).
 *
 * Modèle PRÉPAYÉ, exclusivement via le processeur Chariow (ADR-0007 —
 * unique processeur de paiement) : l'utilisateur paie une période (mensuelle
 * ou annuelle), la période est activée à la confirmation du paiement, les
 * crédits inclus sont crédités immédiatement via le Credit Ledger. À
 * l'échéance :
 *  - renouvellement payant volontaire (nouveau checkout) ;
 *  - sinon EXPIRATION paresseuse (settlement à la lecture, cf. ads) ;
 *  - annulation à l'échéance (cancelAtPeriodEnd) honorée.
 *
 * Différenciation des plans : crédits inclus par période + quotas
 * fonctionnels (nombre d'agents) appliqués À LA CRÉATION d'agent.
 */

export type SubscriptionInterval = "monthly" | "yearly"

export interface SubscriptionPlan {
  key: string
  name: string
  /** Crédits inclus par période. */
  creditsPerPeriod: number
  monthlyPrice: number
  /** Annuel = 10 × mensuel (2 mois offerts). */
  yearlyPrice: number
  currency: string
  /** Quotas différenciés. */
  maxAgents: number
  features: string[]
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = PLAN_OFFERS.map((offer) => ({
  key: offer.key,
  name: offer.name,
  creditsPerPeriod: offer.credits,
  monthlyPrice: offer.price,
  yearlyPrice: offer.price * 10,
  currency: offer.currency,
  maxAgents: offer.key === "starter" ? 10 : offer.key === "plus" ? 25 : offer.key === "pro" ? 50 : 200,
  features: offer.features,
}))

export function findSubscriptionPlan(key: string): SubscriptionPlan | undefined {
  return SUBSCRIPTION_PLANS.find((p) => p.key === key)
}

export function subscriptionPrice(plan: SubscriptionPlan, interval: SubscriptionInterval): number {
  return interval === "monthly" ? plan.monthlyPrice : plan.yearlyPrice
}

/** Période en millisecondes. */
export function intervalMs(interval: SubscriptionInterval): number {
  return interval === "monthly" ? 30 * 86_400_000 : 365 * 86_400_000
}

/**
 * Abonnement ACTIF de l'utilisateur (après settlement paresseux :
 * expiration/annulation appliquée à la volée).
 */
export async function activeSubscription(userId: string) {
  await settleSubscriptions(userId).catch(() => undefined)
  return db.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { currentPeriodEnd: "desc" },
  })
}

/**
 * Active (ou renouvelle) un abonnement après paiement confirmé :
 * crédits inclus crédités via le ledger, ancien abonnement actif clos.
 */
export async function activateSubscription(params: {
  userId: string
  planKey: string
  interval: SubscriptionInterval
  provider: string
  providerRef?: string
}): Promise<{ subscriptionId: string; creditsGranted: number }> {
  const plan = findSubscriptionPlan(params.planKey)
  if (!plan) throw new Error(`Plan d'abonnement inconnu : ${params.planKey}`)
  const price = subscriptionPrice(plan, params.interval)
  const now = new Date()

  // Clôture des abonnements actifs précédents (un seul actif à la fois).
  await db.subscription.updateMany({
    where: { userId: params.userId, status: "ACTIVE" },
    data: { status: "EXPIRED", updatedAt: now },
  })

  const subscription = await db.subscription.create({
    data: {
      userId: params.userId,
      planKey: plan.key,
      interval: params.interval,
      status: "ACTIVE",
      price,
      currency: plan.currency,
      creditsPerPeriod: plan.creditsPerPeriod,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + intervalMs(params.interval)),
      lastGrantAt: now,
      provider: params.provider,
      providerRef: params.providerRef,
    },
  })

  // Crédits de période via le Credit Ledger (jamais de crédit direct).
  await grantCredits(params.userId, plan.creditsPerPeriod, {
    type: "SUBSCRIPTION",
    description: `Abonnement ${plan.name} (${params.interval === "monthly" ? "mensuel" : "annuel"}) — ${plan.creditsPerPeriod} crédits inclus`,
    refType: "subscription",
    refId: subscription.id,
  })

  // Le plan du compte suit l'abonnement actif (bonus fonctionnels : priorité
  // de file, couloir critique du pool de workers — cf. v3.6 performance).
  const planKey =
    params.planKey === "business"
      ? "ENTERPRISE"
      : params.planKey === "pro" || params.planKey === "plus"
        ? "PRO"
        : "FREE"
  await db.user.update({
    where: { id: params.userId },
    data: { plan: planKey },
  }).catch(() => undefined)

  logger.info("subscriptions: abonnement activé", {
    subscriptionId: subscription.id,
    userId: params.userId,
    plan: plan.key,
    interval: params.interval,
    credits: plan.creditsPerPeriod,
  })
  return { subscriptionId: subscription.id, creditsGranted: plan.creditsPerPeriod }
}

/**
 * Settlement paresseux : applique les échéances dépassées.
 * - cancelAtPeriodEnd → CANCELLED ;
 * - période dépassée sans renouvellement → EXPIRED (modèle prépayé).
 */
export async function settleSubscriptions(userId?: string): Promise<{ settled: number }> {
  const now = new Date()
  const due = await db.subscription.findMany({
    where: {
      status: "ACTIVE",
      currentPeriodEnd: { lt: now },
      ...(userId ? { userId } : {}),
    },
    select: { id: true, userId: true, cancelAtPeriodEnd: true },
  })
  for (const sub of due) {
    await db.subscription.update({
      where: { id: sub.id },
      data: { status: sub.cancelAtPeriodEnd ? "CANCELLED" : "EXPIRED" },
    })
    // Sans abonnement actif, le compte repasse FREE.
    const stillActive = await db.subscription.findFirst({
      where: { userId: sub.userId, status: "ACTIVE" },
      select: { id: true },
    })
    if (!stillActive) {
      await db.user.update({ where: { id: sub.userId }, data: { plan: "FREE" } }).catch(() => undefined)
    }
  }
  if (due.length > 0) logger.info("subscriptions: échéances appliquées", { settled: due.length })
  return { settled: due.length }
}

/** Annulation à l'échéance (l'utilisateur garde ses crédits jusqu'au bout). */
export async function cancelAtPeriodEnd(userId: string): Promise<boolean> {
  const active = await db.subscription.findFirst({ where: { userId, status: "ACTIVE" } })
  if (!active) return false
  await db.subscription.update({
    where: { id: active.id },
    data: { cancelAtPeriodEnd: true },
  })
  return true
}

// ─── Quotas différenciés ──────────────────────────────────────

/** Quota d'agents du compte (abonnement actif ou défaut FREE). */
export async function agentQuota(userId: string): Promise<{ maxAgents: number; plan: string; subscription: boolean }> {
  const active = await activeSubscription(userId)
  if (active) {
    const plan = findSubscriptionPlan(active.planKey)
    return { maxAgents: plan?.maxAgents ?? 3, plan: active.planKey, subscription: true }
  }
  return { maxAgents: 3, plan: "FREE", subscription: false }
}

/** Vérifie que l'utilisateur peut créer un agent supplémentaire. */
export async function enforceAgentQuota(userId: string): Promise<void> {
  const quota = await agentQuota(userId)
  const count = await db.agent.count({ where: { userId, status: { not: "ARCHIVED" } } })
  if (count >= quota.maxAgents) {
    const { ApiError } = await import("@/lib/api")
    throw new ApiError(
      402,
      `Limite d'agents atteinte pour votre plan (${quota.maxAgents}). ${
        quota.subscription
          ? "Passez à un plan supérieur pour agrandir votre parc."
          : "Souscrivez un abonnement (Starter/Pro/Business) pour créer plus d'agents."
      }`,
      "AGENT_QUOTA_EXCEEDED"
    )
  }
}

/** Statistiques d'abonnement du compte (UI facturation). */
export async function subscriptionOverview(userId: string) {
  const [active, history] = await Promise.all([
    db.subscription.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { currentPeriodEnd: "desc" },
    }),
    db.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, planKey: true, interval: true, status: true, price: true,
        currency: true, creditsPerPeriod: true, currentPeriodStart: true,
        currentPeriodEnd: true, cancelAtPeriodEnd: true, provider: true, createdAt: true,
      },
    }),
  ])
  return {
    active: active
      ? {
          id: active.id,
          planKey: active.planKey,
          planName: findSubscriptionPlan(active.planKey)?.name ?? active.planKey,
          interval: active.interval,
          status: active.status,
          price: active.price,
          currency: active.currency,
          creditsPerPeriod: active.creditsPerPeriod,
          currentPeriodStart: active.currentPeriodStart.toISOString(),
          currentPeriodEnd: active.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: active.cancelAtPeriodEnd,
        }
      : null,
    history: history.map((h) => ({ ...h, currentPeriodStart: h.currentPeriodStart.toISOString(), currentPeriodEnd: h.currentPeriodEnd.toISOString(), createdAt: h.createdAt.toISOString() })),
    plans: SUBSCRIPTION_PLANS.map((p) => ({
      key: p.key,
      name: p.name,
      creditsPerPeriod: p.creditsPerPeriod,
      monthlyPrice: p.monthlyPrice,
      yearlyPrice: p.yearlyPrice,
      currency: p.currency,
      maxAgents: p.maxAgents,
      features: p.features,
    })),
  }
}
