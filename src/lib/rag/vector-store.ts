import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { bumpVectorSearch } from "@/lib/observability/metrics"
import { embedText, embedTexts, embeddingProvider, cosineSimilarity, type EmbeddingVector } from "./embeddings"
import { chunkText, type Chunk } from "./text-utils"

/**
 * Vector Store (amélioration « Remplacer TF-IDF par un Vecteur DB »).
 *
 * Persistance réelle des vecteurs (table `Embedding`, une ligne par
 * morceau de document) : l'embedding est calculé UNE fois à l'ingestion,
 * plus jamais à la requête. La recherche :
 *  1. embed la requête (fournisseur courant) ;
 *  2. cosinus contre les vecteurs du même modèle pour l'utilisateur ;
 *  3. hybride avec le score TF-IDF (0.6 vecteur + 0.4 lexical) —
 *     la similarité lexicale reste précise sur les termes rares et
 *     l'identifiant exact (numéros, noms propres) que les embeddings
 *     diluent parfois.
 *
 * Backend « json » par défaut (portable SQLite/Postgres). Le
 * pgvector natif reste une évolution documentée (ADR-0003) : la
 * même interface `indexDocument`/`searchVector` sera conservée.
 */

export interface IndexingResult {
  documentId: string
  chunks: number
  model: string
  dim: number
}

/** (Ré)indexe un document : découpage + embeddings persistés. */
export async function indexDocument(
  userId: string,
  documentId: string,
  title: string,
  content: string
): Promise<IndexingResult> {
  const chunks: Chunk[] = chunkText(content)
  const info = embeddingProvider()

  // Morceaux conservés sur le document (repli lexical TF-IDF).
  await db.document.update({
    where: { id: documentId },
    data: { chunks: JSON.stringify(chunks) },
  })

  // Ré-indexation propre : on repart de zéro pour ce document.
  await db.embedding.deleteMany({ where: { documentId } })

  if (chunks.length === 0) {
    return { documentId, chunks: 0, model: info.model, dim: info.dim }
  }

  const vectors = await embedTexts(chunks.map((c) => c.text))
  const rows = vectors.map((v: EmbeddingVector, i: number) => ({
    userId,
    documentId,
    chunkIndex: chunks[i].index,
    chunkText: chunks[i].text.slice(0, 4000),
    embedding: JSON.stringify(v.vector.map((x) => Math.round(x * 10000) / 10000)),
    dim: v.dim,
    norm: v.norm,
    model: v.model,
  }))

  // Écriture par lots raisonnables (SQLite : limite de variables liées).
  for (let i = 0; i < rows.length; i += 64) {
    await db.embedding.createMany({ data: rows.slice(i, i + 64) })
  }

  logger.info("vector-store: document indexé", {
    documentId,
    chunks: rows.length,
    model: info.model,
    dim: info.dim,
  })
  return { documentId, chunks: rows.length, model: info.model, dim: info.dim }
}

export interface VectorSearchHit {
  documentId: string
  chunkIndex: number
  text: string
  score: number
}

/** Recherche vectorielle pure (cosinus) sur les vecteurs persistés de l'utilisateur. */
export async function searchVector(
  userId: string,
  query: string,
  topK = 4
): Promise<VectorSearchHit[]> {
  const info = embeddingProvider()
  const queryVec = await embedText(query)

  // Vecteurs du même modèle uniquement (incompatibilité de dimension sinon).
  const rows = await db.embedding.findMany({
    where: { userId, model: queryVec.model },
    select: { documentId: true, chunkIndex: true, chunkText: true, embedding: true, norm: true },
    take: 5000,
  })
  if (rows.length === 0) return []

  bumpVectorSearch()
  const hits: VectorSearchHit[] = rows
    .map((row) => {
      let stored: number[]
      try {
        stored = JSON.parse(row.embedding) as number[]
      } catch {
        return { documentId: row.documentId, chunkIndex: row.chunkIndex, text: row.chunkText, score: 0 }
      }
      return {
        documentId: row.documentId,
        chunkIndex: row.chunkIndex,
        text: row.chunkText,
        score: cosineSimilarity(queryVec.vector, queryVec.norm, stored, row.norm),
      }
    })
    .filter((h) => h.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return hits.map((h) => ({ ...h, score: Math.round(h.score * 1000) / 1000 }))
}

/** Statistiques du stockage vectoriel (tableau admin). */
export async function vectorStoreStats() {
  const info = embeddingProvider()
  const [total, byModel] = await Promise.all([
    db.embedding.count(),
    db.embedding.groupBy({ by: ["model"], _count: { _all: true } }),
  ])
  return {
    provider: info.provider,
    model: info.model,
    dim: info.dim,
    totalVectors: total,
    byModel: byModel.map((g) => ({ model: g.model, count: g._count._all })),
  }
}

// ---------- Recherche hybride (vecteur + TF-IDF) ----------

export { embedText }
