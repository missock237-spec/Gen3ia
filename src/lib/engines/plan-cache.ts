import crypto from "crypto"
import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { bumpPlanCache } from "@/lib/observability/metrics"
import { embedText, cosineSimilarity } from "@/lib/rag/embeddings"
import type { Plan, PlanStep } from "./types"

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
 * v3.6 — performance :
 *  - ÉVICTION LRI FINE (cold-first puis LRU) : les entrées jamais touchées
 *    (hitCount = 0) de plus de PLAN_CACHE_COLD_DAYS jours partent en premier,
 *    puis plafond par utilisateur (PLAN_CACHE_MAX_PER_USER) et plafond global
 *    (PLAN_CACHE_MAX_GLOBAL) par lastUsedAt décroissant ;
 *  - COUCHE PARTAGÉE « templates » : préchauffage (warmup) des 8 templates
 *    d'agents officiels — plans squelettes DÉTERMINISTES construits depuis
 *    les métadonnées des templates (aucune donnée utilisateur n'y entre
 *    jamais : la couche partagée n'est alimentée QUE par warmup) ;
 *  - la génération LLM contournée est TOUJOURS ré-évaluée par l'Evaluator
 *    avec les poids courants de l'utilisateur (jamais la décision).
 *
 * Contrôles :
 *  - variable PLAN_CACHE=off pour désactiver ;
 *  - un échec de cache n'interrompt JAMAIS la génération (fail-open).
 */

import { AGENT_TEMPLATES } from "@/lib/agents/templates"

const SEMANTIC_THRESHOLD = 0.92

/** Plafonds/TTL résolus À L'APPEL (tests + ajustements sans rechargement). */
function ttlDays(): number {
  const v = Number(process.env.PLAN_CACHE_TTL_DAYS ?? 7)
  return Number.isFinite(v) && v > 0 ? v : 7
}
function maxPerUser(): number {
  const v = Number(process.env.PLAN_CACHE_MAX_PER_USER ?? 200)
  return Number.isFinite(v) && v >= 1 ? v : 200
}
function maxGlobal(): number {
  const v = Number(process.env.PLAN_CACHE_MAX_GLOBAL ?? 20_000)
  return Number.isFinite(v) && v >= 100 ? v : 20_000
}
function coldDays(): number {
  const v = Number(process.env.PLAN_CACHE_COLD_DAYS ?? 2)
  return Number.isFinite(v) && v >= 0 ? v : 2
}

/** Couche partagée (préchauffage des templates — JAMAIS de contenu utilisateur). */
export const SHARED_USER_ID = "__shared__"

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
  /** true si le hit provient de la couche partagée (préchauffage templates). */
  shared?: boolean
}

/** Recherche un jeu de plans en cache (exact puis sémantique). */
export async function lookupPlanCache(userId: string, prompt: string): Promise<CachedPlans | null> {
  if (!cacheEnabled()) return null
  try {
    const hash = promptHash(prompt)
    const now = new Date()

    // 1. Correspondance exacte — couche utilisateur, puis couche partagée.
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
    const sharedExact = await db.planCache.findFirst({
      where: { userId: SHARED_USER_ID, promptHash: hash, expiresAt: { gt: now } },
    })
    if (sharedExact) {
      await registerCacheHit(sharedExact.id)
      bumpPlanCache(true)
      return {
        plans: JSON.parse(sharedExact.plans) as Plan[],
        planScores: JSON.parse(sharedExact.planScores),
        selectedPlanId: sharedExact.selectedPlanId,
        hitType: "exact",
        similarity: 1,
        shared: true,
      }
    }

    // 2. Correspondance sémantique — couche utilisateur.
    const userHit = await semanticLookup(userId, prompt, now)
    if (userHit) {
      bumpPlanCache(true)
      logger.info("plan-cache: hit sémantique", {
        userId,
        similarity: userHit.similarity,
      })
      return { ...userHit, hitType: "semantic" as const }
    }

    // 3. v3.6 — couche partagée (préchauffage des templates officiels).
    const sharedHit = await semanticLookup(SHARED_USER_ID, prompt, now)
    if (sharedHit) {
      bumpPlanCache(true)
      logger.info("plan-cache: hit sémantique partagé (template préchauffé)", {
        userId,
        similarity: sharedHit.similarity,
      })
      return { ...sharedHit, hitType: "semantic" as const, shared: true }
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

/** Recherche sémantique dans une couche (userId donné). */
async function semanticLookup(
  userId: string,
  prompt: string,
  now: Date
): Promise<CachedPlans | null> {
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
  if (!best) return null
  await registerCacheHit(best.id)
  return {
    plans: JSON.parse(best.candidate.plans) as Plan[],
    planScores: JSON.parse(best.candidate.planScores),
    selectedPlanId: best.candidate.selectedPlanId,
    hitType: "semantic",
    similarity: Math.round(best.similarity * 1000) / 1000,
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
    const expiresAt = new Date(Date.now() + ttlDays() * 86_400_000)

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

    // v3.6 — éviction LRI fine (cold-first puis LRU), non bloquante.
    await evictStaleEntries(input.userId).catch(() => undefined)
  } catch (err) {
    logger.warn("plan-cache: échec d'enregistrement (non bloquant)", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * v3.6 — Éviction LRI fine :
 *  1. entrées FROIDES jamais consultées (hitCount = 0) plus vieilles que
 *     PLAN_CACHE_COLD_DAYS jours — supprimées en premier ;
 *  2. plafond par utilisateur (PLAN_CACHE_MAX_PER_USER) par LRU ;
 *  3. plafond global (PLAN_CACHE_MAX_GLOBAL) par LRU.
 * Appelée paresseusement à chaque écriture + exposée à l'admin.
 */
export async function evictStaleEntries(userId?: string): Promise<{ cold: number; perUser: number; global: number }> {
  const result = { cold: 0, perUser: 0, global: 0 }

  // 1. Entrées froides (jamais touchées, âgées).
  const coldCutoff = new Date(Date.now() - coldDays() * 86_400_000)
  const cold = await db.planCache.deleteMany({
    where: {
      ...(userId ? { userId } : {}),
      hitCount: 0,
      lastUsedAt: { lt: coldCutoff },
    },
  })
  result.cold = cold.count

  // 2. Plafond par utilisateur.
  if (userId) {
    const stale = await db.planCache.findMany({
      where: { userId },
      orderBy: { lastUsedAt: "desc" },
      skip: maxPerUser(),
      select: { id: true },
    })
    if (stale.length > 0) {
      const del = await db.planCache.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } })
      result.perUser = del.count
    }
  }

  // 3. Plafond global.
  const overflow = await db.planCache.findMany({
    orderBy: { lastUsedAt: "desc" },
    skip: maxGlobal(),
    select: { id: true },
  })
  if (overflow.length > 0) {
    const del = await db.planCache.deleteMany({ where: { id: { in: overflow.map((s) => s.id) } } })
    result.global = del.count
  }

  if (result.cold + result.perUser + result.global > 0) {
    logger.info("plan-cache: éviction LRI", result)
  }
  return result
}

export async function purgePlanCache(userId?: string): Promise<number> {
  const result = await db.planCache.deleteMany(userId ? { where: { userId } } : undefined)
  return result.count
}

export async function planCacheStats() {
  const [entries, hits, avg, shared] = await Promise.all([
    db.planCache.count(),
    db.planCache.aggregate({ _sum: { hitCount: true } }),
    db.planCache.aggregate({ _avg: { hitCount: true } }),
    db.planCache.count({ where: { userId: SHARED_USER_ID } }),
  ])
  return {
    entries,
    totalHits: hits._sum.hitCount ?? 0,
    avgHitsPerEntry: avg._avg.hitCount ? Math.round(avg._avg.hitCount * 10) / 10 : 0,
    enabled: cacheEnabled(),
    semanticThreshold: SEMANTIC_THRESHOLD,
    ttlDays: ttlDays(),
    v36: {
      sharedTemplateEntries: shared,
      maxPerUser: maxPerUser(),
      maxGlobal: maxGlobal(),
      coldDays: coldDays(),
    },
  }
}

// ─── Préchauffage (couche partagée — templates officiels) ──────

/** Requête type d'un template (utilisée comme clé sémantique du préchauffage). */
function templateQuery(t: (typeof AGENT_TEMPLATES)[number]): string {
  return `${t.name} : ${t.description}`
}

/** Construit un plan squelette DÉTERMINISTE depuis les métadonnées du template. */
function templatePlans(t: (typeof AGENT_TEMPLATES)[number]): Plan[] {
  const stepFromTool = (tool: string, i: number): PlanStep => {
    const labels: Record<string, string> = {
      web_search: "Recherche web ciblée sur le sujet",
      page_reader: "Lecture approfondie des sources identifiées",
      calculator: "Calculs et vérifications chiffrées",
      knowledge_search: "Interrogation de la base de connaissances",
      http_fetch: "Récupération de données externes vérifiées",
      memory_recall: "Rappel des préférences et leçons mémorisées",
      code_runner: "Traitement computationnel isolé",
      datetime: "Horodatage du livrable",
    }
    return {
      title: labels[tool] ?? `Étape ${i + 1}`,
      detail: `${labels[tool] ?? "Traitement"} conformément au profil « ${t.name} » : ${t.description}`,
      tool,
    }
  }
  const steps: PlanStep[] = t.tools.map(stepFromTool)
  const base: Plan = {
    id: "A",
    name: `${t.name} — standard`,
    strategy: `Plan type du template « ${t.name} » (${t.category}) : ${t.description}`,
    steps,
    requiredTools: [...t.tools],
    risks: t.temperature <= 0.4 ? ["Dépendance à la disponibilité des sources externes."] : ["Réponses à vérifier pour exactitude factuelle."],
    estimatedCostCredits: Math.max(1, Math.round(t.tools.length * 0.8 * 10) / 10),
    successProbability: t.temperature <= 0.4 ? 0.88 : 0.8,
    rationale: `Squelette préchauffé issu du template officiel « ${t.name} » — ré-évalué par l'Evaluator avec les poids de l'utilisateur.`,
    requiresHumanConfirmation: false,
  }
  const lean: Plan = {
    ...base,
    id: "B",
    name: `${t.name} — rapide`,
    strategy: `${base.strategy} Variante économe : étapes réduites aux outils essentiels.`,
    steps: steps.slice(0, Math.max(2, Math.ceil(steps.length / 2))),
    requiredTools: [...new Set(steps.slice(0, Math.max(2, Math.ceil(steps.length / 2))).map((s) => s.tool).filter((x): x is string => Boolean(x)))],
    estimatedCostCredits: Math.max(1, Math.round(base.estimatedCostCredits / 2 * 10) / 10),
    successProbability: 0.78,
    rationale: "Variante économe du template — la moitié des étapes, coût réduit.",
  }
  return [base, lean]
}

/**
 * v3.6 — Préchauffage de la couche partagée : pour chaque template officiel,
 * construit les plans squelettes (aucun appel LLM) + l'embedding de la
 * requête type, et enregistre l'entrée partagée si absente/expirée.
 * Idempotent : les entrées existantes à jour ne sont pas régénérées.
 */
export async function warmupPlanCache(): Promise<{ templates: number; created: number; errors: string[] }> {
  if (!cacheEnabled()) return { templates: 0, created: 0, errors: ["cache désactivé"] }
  const result = { templates: 0, created: 0, errors: [] as string[] }
  for (const t of AGENT_TEMPLATES) {
    result.templates++
    try {
      const query = templateQuery(t)
      const hash = promptHash(query)
      const existing = await db.planCache.findFirst({
        where: { userId: SHARED_USER_ID, promptHash: hash, expiresAt: { gt: new Date() } },
        select: { id: true },
      })
      if (existing) continue
      const embedding = await embedText(query)
      await db.planCache.deleteMany({ where: { userId: SHARED_USER_ID, promptHash: hash } })
      await db.planCache.create({
        data: {
          userId: SHARED_USER_ID,
          promptHash: hash,
          prompt: query.slice(0, 3000),
          embedding: JSON.stringify(embedding.vector.map((x) => Math.round(x * 10000) / 10000)),
          plans: JSON.stringify(templatePlans(t)),
          planScores: JSON.stringify({ selectedPlanId: "A", rationale: "Préchauffage template officiel — ré-évaluation Evaluator systématique." }),
          selectedPlanId: "A",
          expiresAt: new Date(Date.now() + ttlDays() * 86_400_000),
        },
      })
      result.created++
    } catch (err) {
      if (result.errors.length < 5) {
        result.errors.push(`${t.key}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  logger.info("plan-cache: préchauffage terminé", { templates: result.templates, created: result.created })
  return result
}
