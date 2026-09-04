import { describe, test, expect } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * v3.6 — Pilier business (abonnements + marketplace) et contrainte produit
 * « Chariow UNIQUE processeur de paiement » (ADR-0007, réaffirmée) :
 *  1. aucun module/route de paiement autre que Chariow dans le code ;
 *  2. abonnements prépayés : plans, prix mensuel/annuel, intervalles ;
 *  3. fulfillment : parsing du plan « sub:<planKey>:<interval> » ;
 *  4. marketplace : commission plateforme 20 %, payout vendeur 80 % ;
 *  5. i18n : clés billing.sub.* présentes en fr ET en (parité).
 */

const ROOT = join(import.meta.dir, "../..")

import {
  SUBSCRIPTION_PLANS,
  findSubscriptionPlan,
  subscriptionPrice,
  intervalMs,
  type SubscriptionInterval,
} from "@/lib/payments/subscriptions"
import { parseSubscriptionPlan } from "@/lib/payments/fulfillment"
import { calculateCommission, PLATFORM_COMMISSION } from "@/lib/marketplace/listing"
import { PLAN_OFFERS } from "@/lib/payments/chariow"

describe("Chariow unique processeur (ADR-0007)", () => {
  test("aucun module de paiement hors chariow/fulfillment/subscriptions", () => {
    const files = readdirSync(join(ROOT, "src/lib/payments")).sort()
    expect(files).toEqual(["chariow.ts", "fulfillment.ts", "subscriptions.ts"])
  })

  test("aucune route webhook de paiement hors Chariow", () => {
    expect(existsSync(join(ROOT, "src/app/api/billing/webhook/route.ts"))).toBe(true)
    expect(existsSync(join(ROOT, "src/app/api/webhooks/stripe"))).toBe(false)
  })

  test("checkout et abonnement n'exposent plus de choix de processeur", () => {
    const checkout = readFileSync(join(ROOT, "src/app/api/billing/checkout/route.ts"), "utf8")
    expect(checkout.includes('method: z.enum(["chariow", "stripe"])')).toBe(false)
    expect(checkout.includes("stripeConfigured")).toBe(false)
    expect(checkout.includes('provider: "stripe"')).toBe(false)

    const subscription = readFileSync(join(ROOT, "src/app/api/billing/subscription/route.ts"), "utf8")
    expect(subscription.includes('method: z.enum(["chariow", "stripe"])')).toBe(false)
    expect(subscription.includes("stripeConfigured")).toBe(false)
    // Le processeur déclaré à l'UI est Chariow, uniquement.
    expect(subscription.includes("processor: { chariow: chariowConfigured() }")).toBe(true)
  })

  test("aucune clé STRIPE_* dans la configuration d'exemple", () => {
    const env = readFileSync(join(ROOT, ".env.example"), "utf8")
    expect(env.includes("STRIPE_SECRET_KEY")).toBe(false)
    expect(env.includes("STRIPE_WEBHOOK_SECRET")).toBe(false)
  })
})

describe("Abonnements SaaS prépayés", () => {
  test("quatre plans alignés sur les offres Chariow (palier 5000 FCFA inclus)", () => {
    expect(SUBSCRIPTION_PLANS).toHaveLength(4)
    expect(SUBSCRIPTION_PLANS.map((p) => p.key)).toEqual(["starter", "plus", "pro", "business"])
    expect(SUBSCRIPTION_PLANS).toHaveLength(PLAN_OFFERS.length)
    for (const plan of SUBSCRIPTION_PLANS) {
      const offer = PLAN_OFFERS.find((o) => o.key === plan.key)
      expect(offer).toBeTruthy()
      expect(plan.creditsPerPeriod).toBe(offer!.credits)
      expect(plan.monthlyPrice).toBe(offer!.price)
      expect(plan.currency).toBe(offer!.currency)
    }
  })

  test("annuel = 10 × mensuel (2 mois offerts)", () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(plan.yearlyPrice).toBe(plan.monthlyPrice * 10)
    }
  })

  test("quotas différenciés croissants : Starter < Pro < Business", () => {
    const starter = findSubscriptionPlan("starter")!
    const pro = findSubscriptionPlan("pro")!
    const business = findSubscriptionPlan("business")!
    expect(starter.maxAgents).toBe(10)
    expect(pro.maxAgents).toBe(50)
    expect(business.maxAgents).toBe(200)
    expect(starter.maxAgents).toBeLessThan(pro.maxAgents)
    expect(pro.maxAgents).toBeLessThan(business.maxAgents)
  })

  test("prix par intervalle et durées de période", () => {
    const pro = findSubscriptionPlan("pro")!
    const monthly: SubscriptionInterval = "monthly"
    const yearly: SubscriptionInterval = "yearly"
    expect(subscriptionPrice(pro, monthly)).toBe(pro.monthlyPrice)
    expect(subscriptionPrice(pro, yearly)).toBe(pro.yearlyPrice)
    expect(intervalMs(monthly)).toBe(30 * 86_400_000)
    expect(intervalMs(yearly)).toBe(365 * 86_400_000)
  })

  test("plan inconnu rejeté", () => {
    expect(findSubscriptionPlan("gold")).toBeUndefined()
  })
})

describe("Fulfillment — plan d'abonnement encodé", () => {
  test("parse « sub:<planKey>:<interval> »", () => {
    expect(parseSubscriptionPlan("sub:pro:monthly")).toEqual({ planKey: "pro", interval: "monthly" })
    expect(parseSubscriptionPlan("sub:starter:yearly")).toEqual({ planKey: "starter", interval: "yearly" })
  })

  test("rejette plans non-abonnement (packs, crédits, pub)", () => {
    expect(parseSubscriptionPlan("starter")).toBeNull()
    expect(parseSubscriptionPlan("credits")).toBeNull()
    expect(parseSubscriptionPlan("ads_recharge")).toBeNull()
    expect(parseSubscriptionPlan("sub:pro")).toBeNull()
    expect(parseSubscriptionPlan("sub:pro:weekly")).toBeNull()
    expect(parseSubscriptionPlan("sub::monthly")).toBeNull()
  })
})

describe("Marketplace — commission 20 %", () => {
  test("constante produit", () => {
    expect(PLATFORM_COMMISSION).toBe(0.2)
  })

  test("payout = 80 %, commission = 20 %, arrondi au millième", () => {
    expect(calculateCommission(100)).toEqual({ commission: 20, payout: 80 })
    expect(calculateCommission(150)).toEqual({ commission: 30, payout: 120 })
    // 33 crédits → commission 6.6, payout 26.4 (arrondi au millième).
    expect(calculateCommission(33)).toEqual({ commission: 6.6, payout: 26.4 })
    // Taux personnalisé conservé (compatibilité).
    expect(calculateCommission(100, 0.1)).toEqual({ commission: 10, payout: 90 })
    expect(calculateCommission(0)).toEqual({ commission: 0, payout: 0 })
  })

  test("prix gratuits (0 crédit) : installation libre, aucun frais caché", () => {
    const { commission, payout } = calculateCommission(0)
    expect(commission).toBe(0)
    expect(payout).toBe(0)
  })
})

describe("i18n — clés d'abonnement (billing.sub.*)", () => {
  const REQUIRED_KEYS = [
    "billing.sub.title", "billing.sub.monthly", "billing.sub.yearly",
    "billing.sub.active", "billing.sub.endsOn", "billing.sub.until",
    "billing.sub.creditsPerPeriod", "billing.sub.quota", "billing.sub.cancel",
    "billing.sub.cancelled.title", "billing.sub.cancelled.desc",
    "billing.sub.cancelFailed", "billing.sub.none", "billing.sub.popular",
    "billing.sub.perMonth", "billing.sub.perYear", "billing.sub.creditsIncluded",
    "billing.sub.agentsQuota", "billing.sub.renew", "billing.sub.subscribe",
    "billing.sub.redirecting", "billing.sub.redirectingDesc",
    "billing.sub.noProcessor", "billing.sub.chariowOnly",
  ]

  test("les 24 clés existent en fr et en avec les interpolations requises", async () => {
    const mod = await import("@/lib/i18n/dict/billing")
    const dict = mod.billing as Record<string, Record<string, string>>
    for (const key of REQUIRED_KEYS) {
      expect(dict.fr[key], `fr:${key} manquante`).toBeTruthy()
      expect(dict.en[key], `en:${key} manquante`).toBeTruthy()
    }
    // Interpolations attendues sur les clés paramétrées.
    expect(dict.fr["billing.sub.until"]).toContain("{date}")
    expect(dict.en["billing.sub.until"]).toContain("{date}")
    expect(dict.fr["billing.sub.creditsPerPeriod"]).toContain("{credits}")
    expect(dict.fr["billing.sub.quota"]).toContain("{agents}")
    expect(dict.fr["billing.sub.agentsQuota"]).toContain("{count}")
    expect(dict.fr["billing.sub.chariowOnly"]).toContain("Chariow")
    expect(dict.en["billing.sub.chariowOnly"]).toContain("Chariow")
  })

  test("l'ancienne clé « twoProcessors » ( Stripe) a bien été retirée", async () => {
    const mod = await import("@/lib/i18n/dict/billing")
    const dict = mod.billing as Record<string, Record<string, string>>
    expect(dict.fr["billing.sub.twoProcessors"]).toBeUndefined()
    expect(dict.en["billing.sub.twoProcessors"]).toBeUndefined()
  })
})
