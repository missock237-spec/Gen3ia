import type { Chunk } from "../text-utils"
import type { EmbeddingVector } from "../embeddings"

/**
 * VectorStore abstraction (v4.0 — Phase 14/15).
 *
 * Contrat commun aux backends de recherche vectorielle :
 *  - json (défaut, portable — implémentation historique Embedding) ;
 *  - pgvector (Supabase/Postgres natif — proximité avec les données) ;
 *  - qdrant (recherche vectorielle à grande échelle).
 *
 * Mêmes signatures que l'implémentation historique : indexDocument /
 * searchVector / deleteDocument — l'abstraction choisie par variables
 * d'environnement (VECTOR_BACKEND), repli automatique sur json.
 */

export interface VectorSearchHit {
  documentId: string
  chunkIndex: number
  text: string
  score: number
}

export interface IndexPayload {
  userId: string
  documentId: string
  chunks: Chunk[]
  vectors: EmbeddingVector[]
}

export interface VectorStoreBackend {
  key: string
  /** Backend utilisable dans cet environnement (config + connectivité). */
  available(): Promise<boolean>
  /** Indexe (remplace) les vecteurs d'un document. */
  index(payload: IndexPayload): Promise<void>
  /** Recherche top-K par vecteur requête (même modèle uniquement). */
  search(userId: string, query: EmbeddingVector, topK: number): Promise<VectorSearchHit[]>
  /** Supprime les vecteurs d'un document. */
  deleteDocument(documentId: string): Promise<void>
}

export function activeBackend(): "json" | "pgvector" | "qdrant" {
  const forced = (process.env.VECTOR_BACKEND ?? "auto").toLowerCase()
  if (forced === "pgvector" || forced === "qdrant" || forced === "json") return forced
  // auto : qdrant si URL configurée, sinon pgvector si Postgres, sinon json.
  if (process.env.QDRANT_URL) return "qdrant"
  if ((process.env.DATABASE_URL ?? "").startsWith("postgres")) return "pgvector"
  return "json"
}
