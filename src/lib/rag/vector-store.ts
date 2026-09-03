import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { bumpVectorSearch } from "@/lib/observability/metrics"
import { embedText, embedTexts, embeddingProvider, type EmbeddingVector } from "./embeddings"
import { chunkText, type Chunk } from "./text-utils"
import { activeBackend } from "./backends/types"
import { backendRegistry } from "./backends/vector-backends"
import { isHfConfigured } from "@/lib/hf/client"

/**
 * Vector Store (v3.1 → v4.0 — Phase 14/15).
 *
 * Abstraction multi-backends (mêmes signatures historiques) :
 *  - VECTOR_BACKEND=json (défaut portable SQLite/Postgres) ;
 *  - VECTOR_BACKEND=pgvector (Supabase natif — proximité PostgreSQL) ;
 *  - VECTOR_BACKEND=qdrant (grande échelle) ;
 *  - auto : Qdrant si QDRANT_URL, pgvector si Postgres, sinon json.
 *
 * Pipeline v4.0 (Phase 15) :
 *   Document → HF Bucket (archive) → Parser → Chunker → Embedding Model
 *   (sélectionnable) → Qdrant OU pgvector → Hybrid Retrieval → Context →
 *   Model Router → LLM.
 *
 * Persistance : l'embedding est calculé UNE fois à l'ingestion, plus jamais
 * à la requête. Recherche hybride 0.6·cosinus + 0.4·lexical (retriever.ts).
 */

export interface IndexingResult {
  documentId: string
  chunks: number
  model: string
  dim: number
  backend: string
}

let resolvedBackendKey: string | null = null
let resolutionPromise: Promise<string> | null = null

/** Résout le backend actif une fois (fail-open → json). */
async function resolveBackendKey(): Promise<string> {
  if (resolvedBackendKey) return resolvedBackendKey
  if (resolutionPromise) return resolutionPromise
  resolutionPromise = (async () => {
    const wanted = activeBackend()
    const backend = backendRegistry[wanted]
    if (backend && (await backend.available().catch(() => false))) {
      resolvedBackendKey = wanted
      logger.info("vector-store: backend actif", { backend: wanted })
      return wanted
    }
    resolvedBackendKey = "json"
    logger.warn("vector-store: backend demandé indisponible — repli json", { wanted })
    return "json"
  })()
  return resolutionPromise
}

function getBackendSync(): (typeof backendRegistry)["json"] {
  return backendRegistry[resolvedBackendKey ?? activeBackend()] ?? backendRegistry.json
}

async function withBackend<T>(
  op: (backend: (typeof backendRegistry)["json"]) => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    const key = await resolveBackendKey()
    return await op(backendRegistry[key] ?? backendRegistry.json)
  } catch (err) {
    logger.warn("vector-store: opération échouée — repli json", {
      error: err instanceof Error ? err.message : String(err),
    })
    try {
      return await op(backendRegistry.json)
    } catch {
      return fallback
    }
  }
}

/** (Ré)indexe un document : découpage + embeddings persistés (backend actif). */
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

  if (chunks.length === 0) {
    return { documentId, chunks: 0, model: info.model, dim: info.dim, backend: resolvedBackendKey ?? activeBackend() }
  }

  const vectors = await embedTexts(chunks.map((c) => c.text))

  // v4.0 — Phase 13/15 : archive du document brut dans le HF Bucket
  // (source de vérité des fichiers, PostgreSQL ne garde que les métadonnées).
  if (isHfConfigured()) {
    try {
      const { hfStorage } = await import("@/lib/hf/storage")
      await hfStorage.upload(
        userId,
        `knowledge/${documentId}/source.txt`,
        new TextEncoder().encode(content.slice(0, 2_000_000)),
        { contentType: "text/plain", metadata: { title, chunks: chunks.length } }
      )
    } catch (err) {
      logger.warn("vector-store: archive Bucket best-effort", {
        documentId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  await withBackend(
    (backend) => backend.index({ userId, documentId, chunks, vectors }),
    undefined as unknown as void
  )

  const backendKey = await resolveBackendKey()
  logger.info("vector-store: document indexé", {
    documentId,
    chunks: chunks.length,
    model: info.model,
    dim: info.dim,
    backend: backendKey,
  })
  return { documentId, chunks: chunks.length, model: info.model, dim: info.dim, backend: backendKey }
}

export interface VectorSearchHit {
  documentId: string
  chunkIndex: number
  text: string
  score: number
}

/** Recherche vectorielle pure (cosinus) sur le backend actif. */
export async function searchVector(
  userId: string,
  query: string,
  topK = 4
): Promise<VectorSearchHit[]> {
  const queryVec = await embedText(query)
  bumpVectorSearch()
  return withBackend(
    (backend) => backend.search(userId, queryVec, topK),
    [] as VectorSearchHit[]
  )
}

/** Statistiques du stockage vectoriel (tableau admin). */
export async function vectorStoreStats() {
  const info = embeddingProvider()
  const backendKey = await resolveBackendKey().catch(() => activeBackend())
  const [total, byModel] = await Promise.all([
    db.embedding.count().catch(() => 0),
    db.embedding.groupBy({ by: ["model"], _count: { _all: true } }).catch(() => [] as Array<{ model: string; _count: { _all: number } }>),
  ])
  return {
    provider: info.provider,
    model: info.model,
    dim: info.dim,
    backend: backendKey,
    totalVectors: total,
    byModel: byModel.map((g) => ({ model: g.model, count: g._count._all })),
  }
}

/** Suppression propre (backend + table Embedding pour repli lexical). */
export async function deleteDocumentVectors(documentId: string): Promise<void> {
  const backend = getBackendSync()
  await backend.deleteDocument(documentId).catch(() => undefined)
  await db.embedding.deleteMany({ where: { documentId } }).catch(() => undefined)
}

/** Backend actif (observabilité / santé). */
export async function vectorBackendInfo(): Promise<{ key: string; available: boolean }> {
  const key = await resolveBackendKey()
  const backend = backendRegistry[key]
  return { key, available: await backend.available().catch(() => false) }
}

// ---------- Recherche hybride (vecteur + TF-IDF) ----------

export { embedText }
