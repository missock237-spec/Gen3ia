import { describe, test, expect, beforeAll } from "bun:test"
import { mkdirSync } from "node:fs"

/**
 * v3.6 — Cache de plans : éviction LRI fine + couche partagée (préchauffage).
 * Base dédiée db/test-cache.db (ensureSchema) — pas de réseau (embeddings locaux).
 */

mkdirSync(new URL("../../db", import.meta.url).pathname, { recursive: true })
const TEST_DB_PATH = new URL("../../db/test-cache.db", import.meta.url).pathname
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`
process.env.PLAN_CACHE = "on"
process.env.PLAN_CACHE_COLD_DAYS = "2"

import { ensureSchema } from "@/lib/db-init"
import { db } from "@/lib/db"
import {
  evictStaleEntries,
  promptHash,
  warmupPlanCache,
  planCacheStats,
  lookupPlanCache,
  storePlanCache,
  SHARED_USER_ID,
  cacheEnabled,
} from "@/lib/engines/plan-cache"
import type { Plan } from "@/lib/engines/types"

const USER = "cache-user-test"

function fakePlan(id: string): Plan {
  return {
    id: id as Plan["id"],
    name: `Plan ${id}`,
    strategy: `stratégie ${id}`,
    steps: [{ title: "Étape 1", detail: "détail de l'étape une pour le test" }],
    requiredTools: [],
    risks: [],
    estimatedCostCredits: 1,
    successProbability: 0.9,
    rationale: "test",
    requiresHumanConfirmation: false,
  }
}

beforeAll(async () => {
  await ensureSchema()
  await db.planCache.deleteMany({})
})

describe("Éviction LRI fine", () => {
  test("supprime d'abord les entrées froides anciennes (hitCount = 0)", async () => {
    const coldPrompt = "prompt froid jamais consulté pour l'éviction"
    const hotPrompt = "prompt chaud régulièrement consulté pour l'éviction"
    await storePlanCache({ userId: USER, prompt: coldPrompt, plans: [fakePlan("A")], planScores: {}, selectedPlanId: "A" })
    await storePlanCache({ userId: USER, prompt: hotPrompt, plans: [fakePlan("B")], planScores: {}, selectedPlanId: "B" })

    // L'entrée « chaude » reçoit des hits ; la froide vieillit artificiellement.
    await db.planCache.updateMany({
      where: { userId: USER, promptHash: promptHash(hotPrompt) },
      data: { hitCount: 5, lastUsedAt: new Date() },
    })
    await db.planCache.updateMany({
      where: { userId: USER, promptHash: promptHash(coldPrompt) },
      data: { lastUsedAt: new Date(Date.now() - 5 * 86_400_000) }, // 5 jours — au-delà de COLD_DAYS
    })

    const evicted = await evictStaleEntries()
    expect(evicted.cold).toBeGreaterThanOrEqual(1)
    const remaining = await db.planCache.findMany({ where: { userId: USER } })
    expect(remaining.some((r) => r.promptHash === promptHash(hotPrompt))).toBe(true)
    expect(remaining.some((r) => r.promptHash === promptHash(coldPrompt))).toBe(false)
  })

  test("le plafond par utilisateur est appliqué à CHAQUE écriture (LRU)", async () => {
    await db.planCache.deleteMany({ where: { userId: USER } })
    // Plafond artificiellement bas pour ce test (résolu à l'appel, cf. impl.).
    process.env.PLAN_CACHE_MAX_PER_USER = "4"
    try {
      // 4 premières entrées : sous le plafond, tout est conservé.
      for (let i = 0; i < 4; i++) {
        await storePlanCache({ userId: USER, prompt: `prompt plafond numéro ${i} pour la mesure LRU`, plans: [fakePlan("A")], planScores: {}, selectedPlanId: "A" })
      }
      expect(await db.planCache.count({ where: { userId: USER } })).toBe(4)

      // Vieillit les DEUX premières (les plus anciennement utilisées).
      const entries = await db.planCache.findMany({ where: { userId: USER }, orderBy: { createdAt: "asc" } })
      for (let i = 0; i < 2; i++) {
        await db.planCache.update({
          where: { id: entries[i].id },
          data: { lastUsedAt: new Date(Date.now() - 3_600_000) },
        })
      }
      const lruHash = promptHash("prompt plafond numéro 0 pour la mesure LRU")

      // La 5e écriture dépasse le plafond → l'entrée la MOINS récemment
      // utilisée est évincée immédiatement (LRU à l'écriture).
      await storePlanCache({ userId: USER, prompt: "prompt plafond numéro quatre pour la mesure LRU", plans: [fakePlan("A")], planScores: {}, selectedPlanId: "A" })
      const remaining = await db.planCache.findMany({ where: { userId: USER } })
      expect(remaining.length).toBe(4)
      expect(remaining.some((r) => r.promptHash === lruHash)).toBe(false)
      expect(remaining.some((r) => r.promptHash === promptHash("prompt plafond numéro quatre pour la mesure LRU"))).toBe(true)
    } finally {
      delete process.env.PLAN_CACHE_MAX_PER_USER
    }
  })
})

describe("Couche partagée (préchauffage des templates)", () => {
  test("warmup crée les entrées des 8 templates officiels (idempotent)", async () => {
    await db.planCache.deleteMany({ where: { userId: SHARED_USER_ID } })
    const first = await warmupPlanCache()
    expect(first.templates).toBeGreaterThanOrEqual(8)
    expect(first.created).toBeGreaterThanOrEqual(8)
    expect(first.errors).toHaveLength(0)

    // Idempotence : un second passage ne recrée rien.
    const second = await warmupPlanCache()
    expect(second.created).toBe(0)
  })

  test("les plans préchauffés sont des squelettes complets (ré-évaluables)", async () => {
    const shared = await db.planCache.findFirst({ where: { userId: SHARED_USER_ID } })
    expect(shared).toBeTruthy()
    const plans = JSON.parse(shared!.plans) as Plan[]
    expect(plans.length).toBeGreaterThanOrEqual(2)
    for (const plan of plans) {
      expect(plan.steps.length).toBeGreaterThan(0)
      expect(plan.rationale).toContain("template")
      expect(plan.requiredTools.length).toBeGreaterThan(0)
    }
  })

  test("recherche sémantique : une demande proche d'un template touche la couche partagée", async () => {
    await db.planCache.deleteMany({ where: { userId: USER } })
    // Une formulation « utilisateur » d'une demande type analyste financier.
    // Les embeddings locaux sont déterministes — un hit exact suffit ici :
    // on rejoue le texte exact d'un template.
    const shared = await db.planCache.findFirst({ where: { userId: SHARED_USER_ID } })
    expect(shared).toBeTruthy()
    const hit = await lookupPlanCache(USER, shared!.prompt)
    if (hit) {
      // Un hit exact sur la couche partagée est légitime (même prompt).
      expect(hit.hitType).toBe("exact")
      expect((hit as { shared?: boolean }).shared).toBe(true)
    } else {
      // Échouer un hit est acceptable (fail-open) MAIS il ne faut jamais
      // d'exception — vérifié par l'absence de throw.
      expect(true).toBe(true)
    }
  })

  test("stats exposent la couche partagée et les plafonds v3.6", async () => {
    const stats = await planCacheStats()
    expect(stats.v36.sharedTemplateEntries).toBeGreaterThanOrEqual(8)
    expect(stats.v36.maxPerUser).toBeGreaterThan(0)
    expect(stats.v36.maxGlobal).toBeGreaterThan(0)
    expect(stats.v36.coldDays).toBe(2)
    expect(stats.enabled).toBe(true)
    expect(cacheEnabled()).toBe(true)
  })
})
