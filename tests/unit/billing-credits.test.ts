import { describe, test, expect } from "bun:test"

/**
 * Tests de la vente de crédits à la carte (v3.5) :
 * exigence produit — 50 crédits minimum par achat, prix par paliers.
 */

import {
  priceForCredits,
  creditPricingInfo,
  CREDIT_TIERS,
  MIN_CREDITS_PURCHASE,
  MAX_CREDITS_PURCHASE,
} from "@/lib/payments/chariow"

describe("Vente de crédits — 50 minimum, paliers dégressifs", () => {
  test("constantes produit : minimum 50, plafond 100 000", () => {
    expect(MIN_CREDITS_PURCHASE).toBe(50)
    expect(MAX_CREDITS_PURCHASE).toBe(100000)
  })

  test("exactement 50 crédits acceptés (limite incluse) au 1er palier", () => {
    expect(priceForCredits(50)).toBe(500) // 50 × 10 FCFA
  })

  test("paliers dégressifs appliqués correctement", () => {
    expect(priceForCredits(100)).toBe(1000) // palier 1 (10/crédit)
    expect(priceForCredits(499)).toBe(4990) // fin palier 1
    expect(priceForCredits(500)).toBe(4000) // palier 2 (8/crédit) — dégressif
    expect(priceForCredits(1499)).toBe(11992)
    expect(priceForCredits(1500)).toBe(9000) // palier 3 (6/crédit)
    expect(priceForCredits(10000)).toBe(60000)
  })

  test("rejette tout achat inférieur au minimum de 50 crédits", () => {
    expect(priceForCredits(0)).toBeNull()
    expect(priceForCredits(1)).toBeNull()
    expect(priceForCredits(49)).toBeNull()
  })

  test("rejette les montants invalides (décimaux, NaN, hors plafond)", () => {
    expect(priceForCredits(50.5)).toBeNull()
    expect(priceForCredits(NaN)).toBeNull()
    expect(priceForCredits(Infinity)).toBeNull()
    expect(priceForCredits(100001)).toBeNull()
    expect(priceForCredits(-50)).toBeNull()
  })

  test("métadonnées UI complètes et cohérentes", () => {
    const info = creditPricingInfo()
    expect(info.min).toBe(50)
    expect(info.currency).toBe("XOF")
    expect(info.tiers).toEqual(CREDIT_TIERS)
    expect(info.tiers[0].min).toBe(50)
    // Paliers contigus sans trou.
    for (let i = 1; i < info.tiers.length; i++) {
      expect(info.tiers[i].min).toBe(info.tiers[i - 1].max + 1)
    }
  })
})
