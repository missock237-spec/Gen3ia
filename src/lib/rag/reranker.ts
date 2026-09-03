import { z } from "zod"
import { chatJSON } from "@/lib/ai/structured"
import { logger } from "@/lib/observability/logger"
import type { ScoredChunk } from "./retriever"

/**
 * Re-ranker (v3.6 — intelligence) : ré-ordonne les candidats hybrides d'une
 * recherche RAG par pertinence FINE vis-à-vis de la requête.
 *
 * Approche « cross-encoder » : contrairement au score bi-encodeur
 * (cosinus requête/document calculé indépendamment), chaque candidat est
 * évalué EN PRÉSENCE de la requête complète par le LLM — le modèle lit
 * les deux textes ensemble et juge directement la pertinence.
 *
 * Garanties :
 *  - fail-open : toute erreur LLM (clé absente, quota, réseau) conserve
 *    l'ordre hybride initial — le re-ranker ne peut JAMAIS dégrader la
 *    disponibilité de la recherche ;
 *  - budget : seuls les `topK * 3` premiers candidats (les plus prometteurs)
 *    sont soumis — pas de coût super-linéaire ;
 *  - traçabilité : la méthode est marquée "hybrid+rerank" dans les résultats.
 */

const rerankSchema = z.object({
  rankings: z
    .array(
      z.object({
        index: z.number().int().min(0),
        score: z.number().min(0).max(100),
        reason: z.string().max(300).optional().catch(undefined),
      })
    )
    .min(1),
})

export interface RerankOptions {
  topK: number
  /** Contexte d'observabilité. */
  userId?: string
}

/**
 * Ré-ordonne les candidats par pertinence jugée (0-100).
 * Retourne les topK meilleurs, score normalisé 0-1, méthode "hybrid+rerank".
 * En cas d'échec LLM : ordre d'entrée inchangé (fail-open).
 */
export async function rerankChunks(
  query: string,
  candidates: ScoredChunk[],
  options: RerankOptions
): Promise<ScoredChunk[]> {
  if (candidates.length <= 1) return candidates

  // Budget : soumettre au plus topK*3 candidats — les suivants n'ont
  // de toute façon aucune chance d'entrer dans le top-K final.
  const submitted = candidates.slice(0, Math.max(options.topK * 3, 3))

  try {
    const result = await chatJSON(
      {
        messages: [
          {
            role: "system",
            content:
              "Tu es un re-ranker de pertinence documentaire (style cross-encoder). " +
              "Pour CHAQUE extrait numéroté, juge sa pertinence DIRECTE pour répondre à la requête de l'utilisateur " +
              "(0 = hors sujet, 100 = répond exactement à la requête). " +
              "Évalue : couverture du sujet demandé, spécificité (vs vague), absence de hors-sujet. " +
              "Réponds en JSON : {\"rankings\":[{\"index\":<numéro>,\"score\":<0-100>,\"reason\":\"<justification courte>\"}]}. " +
              "Notes chaque extrait INDÉPENDAMMENT — pas de classement relatif demandé, juste des scores absolus.",
          },
          {
            role: "user",
            content:
              `REQUÊTE : ${query.slice(0, 600)}\n\nEXTRAITS :\n` +
              submitted.map((c, i) => `[${i}] ${c.title} — ${c.text.slice(0, 500)}`).join("\n\n"),
          },
        ],
        taskType: "VERIFICATION",
        temperature: 0,
        maxTokens: 800,
      },
      rerankSchema
    )

    // Fusion : score LLM (prépondérant) + score hybride initial (10 %) pour
    // départager les ex-aequo et préserver un soupçon du signal lexical.
    const scores = new Map<number, number>()
    for (const r of result.data.rankings) {
      if (r.index >= 0 && r.index < submitted.length) {
        scores.set(r.index, r.score)
      }
    }
    const reranked = submitted
      .map((c, i) => ({
        ...c,
        score: Math.round(((scores.get(i) ?? 50) / 100) * 0.9 + c.score * 0.1 * 10) / 10,
        method: "hybrid+rerank" as const,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK)

    logger.info("rag: re-ranking appliqué", {
      userId: options.userId,
      candidates: submitted.length,
      kept: reranked.length,
      tokens: result.tokensIn + result.tokensOut,
    })
    return reranked
  } catch (err) {
    logger.warn("rag: re-ranking indisponible — ordre hybride conservé (fail-open)", {
      userId: options.userId,
      error: err instanceof Error ? err.message : String(err),
    })
    return candidates.slice(0, options.topK)
  }
}
