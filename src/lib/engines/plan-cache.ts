import crypto from "crypto"
import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { bumpPlanCache } from "@/lib/observability/metrics"
import { embedText, cosineSimilarity } from "@/lib/rag/embeddings"
import type { Plan } from "./types"

/**
 * Cache de plans (amélioration « Mettre en Cache les Plans Fréquents »).
 *
 * Évite de régénérer 5 plans (appel LLM coûteux ~4500 tokens) pour des
 * demandes similaires :
 *  - recherche exacte par hachage SHA-256 du prompt normalisé ;
 *  - recherche sémantique : similarité cosinus ≥ 0.92 entre l'embedding
 *    de la demande et ceux des prompts mis en cache (même utilisateur) ;
 *  - TTL 7 jours, compteur de hits, invalidation paresseuse à l'accès.
 *
 * Contrôles :
 *  - variable PLAN_CACHE=off pour désactiver ;
 *  - un échec de cache n'interrompt JAMAIS la génération (fail-open) ;
 *  - les plans mis en cache sont ré-évalués par l'Evaluator avec les
 *    poids courants de l'utilisateur (seule la génération LLM est
 *    contournée — jamais la décision).
 */

const TTL_DAYS = Number(process.env.PLAN_CACHE_TTL_DAYS ?? 7)
const SEMANTIC_THRESHOLD = 0.92

export function cacheEnabled(): boolean {
  return (process.env.PLAN_CACHE ?? "on").toLowerCase() !== "off"
}

export function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function promptHash(prompt: string): string {
  return crypto.createHash("sha256").update(normalizePrompt(prompt)).digest("hex")
}

export interface CachedPlans {
  plans: Plan[]
  planScores: unknown
  selectedPlanId: string
  hitType: "exact" | "semantic"
  similarity: number
}

/** Recherche un jeu de plans en cache (exact puis sémantique). */
export async function lookupPlanCache(userId: string, prompt: string): Promise<CachedPlans | null> {
  if (!cacheEnabled()) return null
  try {
    const hash = promptHash(prompt)
    const now = new Date()

    // 1. Correspondance exacte.
    const exact = await db.planCache.findFirst({
      where: { userId, promptHash: hash, expiresAt: { gt: now } },
    })
    if (exact) {
      await registerCacheHit(exact.id)
      bumpPlanCache(true)
      return {
        plans: JSON.parse(exact.plans) as Plan[],
        planScores: JSON.parse(exact.planScores),
        selectedPlanId: exact.selectedPlanId,
        hitType: "exact",
        similarity: 1,
      }
    }

    // 2. Correspondance sémantique.
    const candidates = await db.planCache.findMany({
      where: { userId, expiresAt: { gt: now }, embedding: { not: null } },
      select: { id: true, embedding: true, plans: true, planScores: true, selectedPlanId: true, prompt: true },
      take: 200,
      orderBy: { lastUsedAt: "desc" },
    })
    if (candidates.length === 0) return null

    const queryVec = await embedText(prompt)
    let best: { id: string; similarity: number; candidate: (typeof candidates)[number] } | null = null
    for (const candidate of candidates) {
      let stored: number[]
      try {
        stored = JSON.parse(candidate.embedding ?? "[]") as number[]
      } catch {
        continue
      }
      const similarity = cosineSimilarity(queryVec.vector, queryVec.norm, stored, Math.hypot(...stored))
      if (similarity >= SEMANTIC_THRESHOLD && (!best || similarity > best.similarity)) {
        best = { id: candidate.id, similarity, candidate }
      }
    }
    if (best) {
      await registerCacheHit(best.id)
      bumpPlanCache(true)
      logger.info("plan-cache: hit sémantique", {
        userId,
        similarity: Math.round(best.similarity * 1000) / 1000,
      })
      return {
        plans: JSON.parse(best.candidate.plans) as Plan[],
        planScores: JSON.parse(best.candidate.planScores),
        selectedPlanId: best.candidate.selectedPlanId,
        hitType: "semantic",
        similarity: Math.round(best.similarity * 1000) / 1000,
      }
    }

    bumpPlanCache(false)
    return null
  } catch (err) {
    // Fail-open : le cache ne doit jamais bloquer la planification.
    logger.warn("plan-cache: erreur de consultation (fail-open)", {
      error: err instanceof Error ? err.message : String(err),
    })
    bumpPlanCache(false)
    return null
  }
}

async function registerCacheHit(id: string) {
  await db.planCache.update({
    where: { id },
    data: { hitCount: { increment: 1 }, lastUsedAt: new Date() },
  }).catch(() => undefined)
}

export interface StorePlanCacheInput {
  userId: string
  prompt: string
  plans: Plan[]
  planScores: unknown
  selectedPlanId: string
}

/** Enregistre un jeu de plans généré (best-effort). */
export async function storePlanCache(input: StorePlanCacheInput): Promise<void> {
  if (!cacheEnabled() || input.plans.length === 0) return
  try {
    const hash = promptHash(input.prompt)
    const embedding = await embedText(input.prompt)
    const expiresAt = new Date(Date.now() + TTL_DAYS * 86_400_000)

    // Remplacement simple (pas d'index unique composite userId+hash : delete + create).
    await db.planCache.deleteMany({ where: { userId: input.userId, promptHash: hash } })
    await db.planCache.create({
      data: {
        userId: input.userId,
        promptHash: hash,
        prompt: input.prompt.slice(0, 3000),
        embedding: JSON.stringify(embedding.vector.map((x) => Math.round(x * 10000) / 10000)),
        plans: JSON.stringify(input.plans),
        planScores: JSON.stringify(input.planScores ?? {}),
        selectedPlanId: input.selectedPlanId,
        expiresAt,
      },
    })

    // Purge paresseuse : max 200 entrées par utilisateur (LRU par lastUsedAt).
    const stale = await db.planCache.findMany({
      where: { userId: input.userId },
      orderBy: { lastUsedAt: "desc" },
      skip: 200,
      select: { id: true },
    })
    if (stale.length > 0) {
      await db.planCache.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } })
    }
  } catch (err) {
    logger.warn("plan-cache: échec d'enregistrement (non bloquant)", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export async function purgePlanCache(userId?: string): Promise<number> {
  const result = await db.planCache.deleteMany(userId ? { where: { userId } } : undefined)
  return result.count
}

export async function planCacheStats() {
  const [entries, hits, avg] = await Promise.all([
    db.planCache.count(),
    db.planCache.aggregate({ _sum: { hitCount: true } }),
    db.planCache.aggregate({ _avg: { hitCount: true } }),
  ])
  return {
    entries,
    totalHits: hits._sum.hitCount ?? 0,
    avgHitsPerEntry: avg._avg.hitCount ? Math.round(avg._avg.hitCount * 10) / 10 : 0,
    enabled: cacheEnabled(),
    semanticThreshold: SEMANTIC_THRESHOLD,
    ttlDays: TTL_DAYS,
  }
}
