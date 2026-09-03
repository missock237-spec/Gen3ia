import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { searchVector } from "./vector-store"
import { chunkText, tokenize, type Chunk } from "./text-utils"
import { rerankChunks } from "./reranker"
import { hasZaiConfig } from "@/lib/config"

/**
 * RAG — recherche hybride (amélioration « Remplacer TF-IDF par un Vecteur DB »).
 *
 * Stratégie par ordre de priorité :
 *  1. Vecteurs persistés (Embedding) + TF-IDF ciblé sur les morceaux
 *     candidats → score hybride pondéré (défaut 0.6·cosinus + 0.4·lexical,
 *     AJUSTABLE PAR AGENT via config.rag.semanticWeight) ;
 *  2. Re-ranker cross-encoder (v3.6) : les meilleurs candidats sont
 *     ré-évalués en présence de la requête complète par le LLM — pertinent
 *     quand la requête est précise et que le lexical divague (homonymes,
 *     formulations indirectes). Activable par agent (config.rag.rerank),
 *     fail-open : indisponible → ordre hybride conservé ;
 *  3. Repli TF-IDF pur si aucun vecteur n'est indexé pour l'utilisateur
 *     (documents antérieurs à la v3.1, ou fournisseur local indisponible).
 *
 * L'embedding n'est JAMAIS recalculé pour les documents à la requête :
 * il est calculé une fois à l'ingestion (voir vector-store.indexDocument).
 */

export interface RetrievalOptions {
  /**
   * Poids de la sémantique dans le score hybride (0 = lexical pur,
   * 1 = vectoriel pur). Défaut 0.6. Ajustable par agent — un agent
   * technique sur un jargon précis gagnera à monter le lexical (≈ 0.4),
   * un agent de veille préférera la sémantique (≈ 0.8).
   */
  semanticWeight?: number
  /** Activer le re-ranker cross-encoder (défaut : si un LLM est disponible). */
  rerank?: boolean
  /** Contexte d'observabilité. */
  userId?: string
}

export function clampSemanticWeight(w: number | undefined): number {
  if (w === undefined || !Number.isFinite(w)) return 0.6
  return Math.min(1, Math.max(0, w))
}

export function rerankEnabled(opts: RetrievalOptions): boolean {
  if (opts.rerank !== undefined) return opts.rerank
  // Par défaut : re-rank si un fournisseur LLM est configuré.
  return hasZaiConfig() || Boolean(process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY)
}

export { chunkText, tokenize } from "./text-utils"
export type { Chunk } from "./text-utils"

export interface ScoredChunk {
  documentId: string
  title: string
  text: string
  score: number
  /** Origine du score (observabilité). */
  method?: "hybrid" | "hybrid+rerank" | "lexical"
}

/** TF-IDF ciblé : requête vs liste fermée de morceaux (sous-corpus candidats). */
function lexicalScores(query: string, texts: string[]): number[] {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0 || texts.length === 0) return texts.map(() => 0)

  const docTokens = texts.map((t) => tokenize(t))
  const N = texts.length
  const df = new Map<string, number>()
  for (const tokens of docTokens) {
    for (const term of new Set(tokens)) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const idf = (term: string) => Math.log(1 + N / (1 + (df.get(term) ?? 0)))

  const querySet = new Set(queryTokens)
  return docTokens.map((tokens) => {
    const tf = new Map<string, number>()
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
    let dot = 0
    let docNorm = 0
    for (const [term, f] of tf) {
      const dw = (f / (tokens.length || 1)) * idf(term)
      docNorm += dw * dw
      if (querySet.has(term)) dot += idf(term) * dw
    }
    return docNorm > 0 ? dot / Math.sqrt(docNorm) : 0
  })
}

/** Recherche RAG sur la base de connaissances de l'utilisateur. */
export async function searchKnowledge(
  userId: string,
  query: string,
  topK = 4,
  options: RetrievalOptions = {}
): Promise<ScoredChunk[]> {
  const semanticWeight = clampSemanticWeight(options.semanticWeight)
  const lexicalWeight = 1 - semanticWeight

  // 1. Candidats vectoriels (embedding requête + cosinus sur vecteurs persistés).
  let vectorHits: Awaited<ReturnType<typeof searchVector>> = []
  try {
    vectorHits = await searchVector(userId, query, Math.max(topK * 2, 8))
  } catch (err) {
    logger.warn("rag: recherche vectorielle indisponible, repli lexical", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const docIds = [...new Set(vectorHits.map((h) => h.documentId))]
  const docs =
    docIds.length > 0
      ? await db.document.findMany({ where: { userId, id: { in: docIds } }, select: { id: true, title: true } })
      : []
  const titleById = new Map(docs.map((d) => [d.id, d.title]))

  if (vectorHits.length > 0) {
    // 2. Score hybride pondéré sur les candidats vectoriels.
    const texts = vectorHits.map((h) => h.text)
    const lex = lexicalScores(query, texts)
    const merged: ScoredChunk[] = vectorHits.map((h, i) => ({
      documentId: h.documentId,
      title: titleById.get(h.documentId) ?? "(document supprimé)",
      text: h.text,
      score: Math.round((semanticWeight * h.score + lexicalWeight * lex[i]) * 1000) / 1000,
      method: "hybrid" as const,
    }))
    const ranked = merged
      .filter((m) => m.score > 0.02)
      .sort((a, b) => b.score - a.score)

    // 3. Re-ranker cross-encoder (v3.6) — ajustable par agent, fail-open.
    if (rerankEnabled(options) && ranked.length > 1) {
      return rerankChunks(query, ranked, { topK, userId: options.userId ?? userId })
    }
    return ranked.slice(0, topK)
  }

  // 3. Repli lexical complet (aucun vecteur indexé pour cet utilisateur).
  const allDocs = await db.document.findMany({
    where: { userId },
    select: { id: true, title: true, chunks: true },
  })
  if (allDocs.length === 0) return []

  const corpus: Array<{ documentId: string; title: string; text: string }> = []
  for (const doc of allDocs) {
    let chunks: Chunk[] = []
    try {
      chunks = doc.chunks ? (JSON.parse(doc.chunks) as Chunk[]) : []
    } catch {
      chunks = []
    }
    if (chunks.length === 0 && doc.title) {
      chunks = chunkText(doc.title)
    }
    for (const chunk of chunks) {
      corpus.push({ documentId: doc.id, title: doc.title, text: chunk.text })
    }
  }
  if (corpus.length === 0) return []

  const lex = lexicalScores(query, corpus.map((c) => c.text))
  return corpus
    .map((c, i) => ({
      documentId: c.documentId,
      title: c.title,
      text: c.text,
      score: Math.round(lex[i] * 1000) / 1000,
      method: "lexical" as const,
    }))
    .filter((s) => s.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
