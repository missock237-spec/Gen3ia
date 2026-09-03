import { describe, test, expect, beforeAll, afterAll } from "bun:test"

/**
 * Tests du portefeuille publicitaire (page /ads) :
 * recharges, dépenses de campagne, règlement paresseux des budgets,
 * pause automatique quand le solde est épuisé.
 */

import { db } from "@/lib/db"
import {
  ensureAdWallet,
  creditAdWallet,
  debitAdWallet,
  settleCampaignSpends,
  AD_RECHARGE_MIN_FCFA,
} from "@/lib/ads/ledger"

let userId: string

beforeAll(async () => {
  const user = await db.user.create({
    data: {
      email: `ads-test-${Date.now()}@test.local`,
      name: "Ads Test",
      passwordHash: "x",
    },
  })
  userId = user.id
})

afterAll(async () => {
  await db.adCampaign.deleteMany({ where: { userId } })
  await db.adWallet.deleteMany({ where: { userId } })
  await db.user.deleteMany({ where: { id: userId } })
})

describe("Portefeuille publicitaire", () => {
  test("minimum de recharge : 1 000 FCFA", () => {
    expect(AD_RECHARGE_MIN_FCFA).toBe(1000)
  })

  test("le portefeuille est créé à la demande et reste unique", async () => {
    const w1 = await ensureAdWallet(userId)
    const w2 = await ensureAdWallet(userId)
    expect(w1.id).toBe(w2.id)
    expect(w1.balance).toBe(0)
  })

  test("recharge : crédit + transaction enregistrée", async () => {
    const { balanceAfter } = await creditAdWallet(userId, 5000, {
      type: "RECHARGE",
      description: "Recharge test",
    })
    expect(balanceAfter).toBe(5000)
    const txs = await db.adTransaction.findMany({ where: { wallet: { userId } } })
    expect(txs).toHaveLength(1)
    expect(txs[0].amount).toBe(5000)
    expect(txs[0].type).toBe("RECHARGE")
  })

  test("dépense : débit + solde après exact", async () => {
    const { balanceAfter } = await debitAdWallet(userId, 1500, {
      type: "SPEND",
      description: "Budget campagne test",
      campaignId: "fake-campaign",
    })
    expect(balanceAfter).toBe(3500)
  })

  test("débit refusé au-delà du solde (jamais négatif)", async () => {
    let refused = false
    try {
      await debitAdWallet(userId, 100000, { type: "SPEND", description: "Trop" })
    } catch (err) {
      refused = err instanceof Error && err.message.includes("insuffisant")
    }
    expect(refused).toBe(true)
    const w = await db.adWallet.findUniqueOrThrow({ where: { userId } })
    expect(w.balance).toBe(3500)
  })

  test("règlement paresseux : budget journalier débité, pause si épuisé", async () => {
    await db.adCampaign.deleteMany({ where: { userId } })
    // Campagne ACTIVE avec lastChargeAt ~2 jours entamés → 2 jours dus.
    const campaign = await db.adCampaign.create({
      data: {
        userId,
        name: "Campagne test",
        platform: "googleads",
        status: "ACTIVE",
        budgetPerDay: 1000,
        startDate: new Date(Date.now() - 3 * 86_400_000),
        // 2 jours − 1 h : exactement 2 jours entamés (marge anti-ε).
        lastChargeAt: new Date(Date.now() - 2 * 86_400_000 + 3_600_000),
      },
    })
    const result = await settleCampaignSpends(userId)
    expect(result.totalDebited).toBe(2000) // 2 jours × 1000 FCFA
    const w = await db.adWallet.findUniqueOrThrow({ where: { userId } })
    expect(w.balance).toBe(1500) // 3500 - 2000
    const updated = await db.adCampaign.findUniqueOrThrow({ where: { id: campaign.id } })
    expect(updated.totalSpent).toBe(2000)
    expect(updated.status).toBe("ACTIVE") // solde toujours positif
    await db.adCampaign.deleteMany({ where: { id: campaign.id } })
  })

  test("solde épuisé → campagne mise en pause automatiquement", async () => {
    await db.adCampaign.deleteMany({ where: { userId } })
    // Budget journalier supérieur au solde restant (1500).
    const campaign = await db.adCampaign.create({
      data: {
        userId,
        name: "Campagne épuisée",
        platform: "metaads",
        status: "ACTIVE",
        budgetPerDay: 5000,
        startDate: new Date(Date.now() - 2 * 86_400_000),
        // 1 jour entamé (marge anti-ε).
        lastChargeAt: new Date(Date.now() - 86_400_000 + 3_600_000),
      },
    })
    await settleCampaignSpends(userId)
    const w = await db.adWallet.findUniqueOrThrow({ where: { userId } })
    expect(w.balance).toBe(0) // débit borné au solde disponible
    const updated = await db.adCampaign.findUniqueOrThrow({ where: { id: campaign.id } })
    expect(updated.status).toBe("PAUSED")
    expect(updated.totalSpent).toBe(1500) // a payé ce qui restait
    await db.adCampaign.deleteMany({ where: { id: campaign.id } })
  })
})
