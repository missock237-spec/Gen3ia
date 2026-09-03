import crypto from "node:crypto"
import { z } from "zod"
import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { chatJSON } from "@/lib/ai/structured"
import type { LearningInput } from "@/lib/engines/learning"
import type { Plan } from "@/lib/engines/types"

/**
 * Méta-learning cross-agent (v3.6 — intelligence).
 *
 * Le Learning Engine mémorise des leçons PAR UTILISATEUR (mémoire privée).
 * Ce module ajoute la dimension COLLECTIVE : les « patrons d'échec »
 * généralisés — « l'outil X échoue souvent pour ce type de demande »,
 * « cette stratégie de plan sur-sollicite l'outil Y » — sont partagés
 * ANONYMEMENT entre tous les agents de la plateforme.
 *
 * Garantie de vie privée (stricte) :
 *  - le LLM reçoit le contexte de tâche AVEC consigne de généralisation
 *    absolue (aucun nom propre, aucune donnée utilisateur, aucune citation
 *    du prompt) et le patron extrait est VALIDÉ par un filtre anti-fuite ;
 *  - la multiplicité d'utilisateurs est comptée via des EMPREINTES hachées
 *    (SHA-256 + sel) — jamais d'identifiant en clair ;
 *  - un patron ne comporte que : une phrase généralisée, des tags
 *    techniques (outil, phase, code d'erreur) et des compteurs.
 *
 * Boucle fermée : les patrons dominants alimentent le contexte du
 * PLANIFICATEUR de TOUTES les tâches (cf. orchestrator) — les agents
 * « apprennent » des échecs des autres.
 */

const failurePatternSchema = z.object({
  patterns: z
    .array(
      z.object({
        pattern: z.string().min(20).max(300),
        tags: z.array(z.string().max(60)).max(6).default([]),
      })
    )
    .max(3)
    .default([]),
})

/** Mots/contenus interdits dans un patron généralisé (anti-fuite). */
const LEAK_PATTERNS: RegExp[] = [
  /@/i, // emails
  /https?:\/\//i, // URLs
  /\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/, // téléphones
  /\b(?:[A-Z]{2,}\s){3,}/, // noms propres multiples
]

function userFingerprint(userId: string): string {
  const salt = process.env.SESSION_SECRET ?? "gen3ia-dev-secret"
  return crypto.createHmac("sha256", salt).update(`meta:${userId}`).digest("hex").slice(0, 24)
}

function patternHash(pattern: string, tags: string[]): string {
  // Normalisation : casse, ponctuation, espaces → même patron = même hash.
  const normalized = `${pattern.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim()}|${tags.slice().sort().join(",")}`
  return crypto.createHash("sha256").update(normalized).digest("hex")
}

function sanitizePattern(pattern: string): string | null {
  const trimmed = pattern.trim()
  if (trimmed.length < 20 || trimmed.length > 300) return null
  for (const leak of LEAK_PATTERNS) {
    if (leak.test(trimmed)) return null
  }
  return trimmed
}

/**
 * Extrait et enregistre les patrons généralisés d'une tâche terminée
 * (échec ou succès — les deux apprennent). Anonyme, best-effort.
 */
export async function recordCrossAgentPatterns(params: {
  userId: string
  input: LearningInput
  plan?: Plan
}): Promise<{ extracted: number; stored: number; rejected: number }> {
  const result = { extracted: 0, stored: 0, rejected: 0 }

  // Les tags techniques accompagnent le patron sans exposer la tâche.
  const technicalTags = [
    ...(params.plan ? [`plan:${params.plan.strategy.slice(0, 40).replace(/\s+/g, "-").toLowerCase()}`] : []),
    ...(params.input.error ? [`error:${params.input.error.slice(0, 40).replace(/\s+/g, "-").toLowerCase()}`] : []),
    ...(["code_runner", "http_fetch", "web_search"].filter((t) =>
      params.plan?.requiredTools?.includes(t) ?? false
    ).map((t) => `tool:${t}`)),
  ]

  try {
    const extraction = await chatJSON(
      {
        messages: [
          {
            role: "system",
            content:
              "Tu extrais des PATRONS GÉNÉRALISÉS d'apprentissage multi-utilisateurs à partir d'une tâche terminée. " +
              "Règles ABSOLUES : chaque patron est une leçon technique universelle réutilisable par N'IMPORTE QUEL agent ; " +
              "INTERDIT d'inclure la moindre donnée utilisateur (noms, sociétés, lieux, chiffres spécifiques à la tâche, " +
              "URL, emails, extraits du prompt). Formule toujours de façon générique : « pour ce type d'objectif, l'outil X… ». " +
              "Réponds en JSON : {\"patterns\":[{\"pattern\":\"<leçon généralisée>\",\"tags\":[\"tool:…\",\"phase:…\"]}]}. " +
              "Si la tâche n'enseigne rien de généralisable, réponds une liste vide.",
          },
          {
            role: "user",
            content:
              `NATURE DE LA TÂCHE : ${params.input.prompt.slice(0, 200).replace(/\b\w+\b/g, (w) => (w.length > 3 ? w[0] + "***" : w))}\n` +
              `RÉSULTAT : ${params.input.outcome}\n` +
              (params.input.error ? `ERREUR TECHNIQUE : ${params.input.error.slice(0, 200)}\n` : "") +
              `OUTILS DU PLAN : ${(params.plan?.requiredTools ?? []).join(", ") || "(aucun)"}\n` +
              `TAGS TECHNIQUES DÉJÀ CONNUS : ${technicalTags.join(", ") || "(aucun)"}`,
          },
        ],
        taskType: "LEARNING",
        temperature: 0.2,
        maxTokens: 500,
      },
      failurePatternSchema
    )

    const fingerprint = userFingerprint(params.userId)
    for (const candidate of extraction.data.patterns) {
      result.extracted++
      const clean = sanitizePattern(candidate.pattern)
      if (!clean) {
        result.rejected++
        continue
      }
      const tags = [...new Set([...candidate.tags.map((t) => t.slice(0, 60)), ...technicalTags])].slice(0, 6)
      const hash = patternHash(clean, tags)

      // Upsert : compteur d'occurrences + utilisateurs distincts (empreintes).
      const existing = await db.crossAgentPattern.findUnique({ where: { patternHash: hash } })
      if (existing) {
        const seenBy = new Set(JSON.parse(existing.seenBy ?? "[]") as string[])
        const isNewUser = !seenBy.has(fingerprint)
        seenBy.add(fingerprint)
        await db.crossAgentPattern.update({
          where: { patternHash: hash },
          data: {
            occurrences: { increment: 1 },
            distinctUsers: isNewUser ? { increment: 1 } : undefined,
            seenBy: JSON.stringify([...seenBy].slice(-500)),
            lastSeenAt: new Date(),
          },
        })
      } else {
        await db.crossAgentPattern.create({
          data: {
            patternHash: hash,
            pattern: clean,
            category: params.input.outcome === "FAILURE" ? "FAILURE" : "SUCCESS",
            tags: JSON.stringify(tags),
            distinctUsers: 1,
            seenBy: JSON.stringify([fingerprint]),
          },
        })
      }
      result.stored++
    }
  } catch (err) {
    logger.warn("meta-learning: extraction impossible (non bloquant)", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return result
}

export interface SharedPattern {
  pattern: string
  category: string
  tags: string[]
  occurrences: number
  distinctUsers: number
}

/**
 * Patrons dominants à injecter dans le contexte du planificateur :
 * les plus corroborés (utilisateurs distincts), d'abord les échecs.
 * Un patron vu chez un SEUL utilisateur n'est PAS partagé (bruit possible).
 */
export async function sharedFailureContext(limit = 5): Promise<SharedPattern[]> {
  try {
    const rows = await db.crossAgentPattern.findMany({
      where: { distinctUsers: { gte: 2 } },
      orderBy: [{ distinctUsers: "desc" }, { occurrences: "desc" }],
      take: limit * 2,
    })
    const failures = rows.filter((r) => r.category === "FAILURE").slice(0, limit)
    const successes = rows.filter((r) => r.category === "SUCCESS").slice(0, Math.max(1, Math.floor(limit / 2)))
    return [...failures, ...successes].map((r) => ({
      pattern: r.pattern,
      category: r.category,
      tags: JSON.parse(r.tags ?? "[]") as string[],
      occurrences: r.occurrences,
      distinctUsers: r.distinctUsers,
    }))
  } catch {
    return []
  }
}

/** Bloc de contexte prêt à injecter dans le prompt du planificateur. */
export async function crossAgentPatternsBlock(limit = 5): Promise<string> {
  const patterns = await sharedFailureContext(limit)
  if (patterns.length === 0) return ""
  const lines = patterns.map(
    (p) =>
      `- (${p.category === "FAILURE" ? "À ÉVITER" : "FONCTIONNE"}, ${p.distinctUsers} agents distincts) ${p.pattern}`
  )
  return `PATRONS CROSS-AGENTS (anonymes, ${patterns.length} leçons collectives) :\n${lines.join("\n")}`
}

/** Statistiques d'observabilité (admin). */
export async function metaLearningStats() {
  const [total, failures, successes, users] = await Promise.all([
    db.crossAgentPattern.count(),
    db.crossAgentPattern.count({ where: { category: "FAILURE" } }),
    db.crossAgentPattern.count({ where: { category: "SUCCESS" } }),
    db.crossAgentPattern.aggregate({ _max: { distinctUsers: true } }),
  ])
  return {
    patterns: total,
    failurePatterns: failures,
    successPatterns: successes,
    maxDistinctUsers: users._max.distinctUsers ?? 0,
  }
}
