import { db } from "@/lib/db"
import type { VectorStoreBackend, IndexPayload, VectorSearchHit } from "./types"
import { cosineSimilarity, type EmbeddingVector } from "../embeddings"

/**
 * Backend Qdrant (v4.0 — Phase 14) — recherche vectorielle à grande échelle.
 *
 * API HTTP officielle (https://qdrant.tech/documentation/concepts/):
 *  - PUT /collections/{name}         : création de collection ;
 *  - PUT /collections/{name}/points  : upsert de points ;
 *  - POST /collections/{name}/points/search : recherche ;
 *  - POST /collections/{name}/points/delete : suppression.
 *
 * Une collection par (modèle, dimension) : « gen3ia_{model}_{dim} ».
 * Les payloads portent userId/documentId/chunkIndex — filtre exact côté
 * Qdrant (recherche cloisonnée par utilisateur).
 */

function qdrantUrl(): string {
  return (process.env.QDRANT_URL ?? "").replace(/\/$/, "")
}

function qdrantHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const key = process.env.QDRANT_API_KEY
  if (key) headers["api-key"] = key
  return headers
}

function collectionName(model: string, dim: number): string {
  const safe = model.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 60)
  return `gen3ia_${safe}_${dim}`
}

async function ensureCollection(model: string, dim: number): Promise<string> {
  const name = collectionName(model, dim)
  const exists = await fetch(`${qdrantUrl()}/collections/${name}`, {
    headers: qdrantHeaders(),
    signal: AbortSignal.timeout(10_000),
  })
  if (exists.ok) return name
  if (exists.status !== 404) {
    throw new Error(`Qdrant: vérification collection HTTP ${exists.status}`)
  }
  const create = await fetch(`${qdrantUrl()}/collections/${name}`, {
    method: "PUT",
    headers: qdrantHeaders(),
    body: JSON.stringify({
      vectors: { size: dim, distance: "Cosine" },
      on_disk_payload: true,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!create.ok) {
    throw new Error(`Qdrant: création collection HTTP ${create.status}`)
  }
  return name
}

export const qdrantBackend: VectorStoreBackend = {
  key: "qdrant",

  async available() {
    if (!qdrantUrl()) return false
    try {
      const res = await fetch(`${qdrantUrl()}/readyz`, {
        headers: qdrantHeaders(),
        signal: AbortSignal.timeout(5000),
      })
      return res.ok
    } catch {
      return false
    }
  },

  async index(payload: IndexPayload) {
    if (payload.vectors.length === 0) return
    const model = payload.vectors[0]?.model ?? "unknown"
    const dim = payload.vectors[0]?.dim ?? 0
    if (dim === 0) return
    const collection = await ensureCollection(model, dim)

    // Remplacement propre : supprime les points du document puis upsert.
    await this.deleteDocument(payload.documentId)

    const points = payload.chunks.map((chunk, i) => ({
      id: deterministicId(payload.documentId, chunk.index),
      vector: payload.vectors[i]?.vector ?? [],
      payload: {
        userId: payload.userId,
        documentId: payload.documentId,
        chunkIndex: chunk.index,
        text: chunk.text.slice(0, 4000),
        model,
      },
    }))

    // Lots de 128 (limite usuelle Qdrant par requête).
    for (let i = 0; i < points.length; i += 128) {
      const res = await fetch(`${qdrantUrl()}/collections/${collection}/points?wait=true`, {
        method: "PUT",
        headers: qdrantHeaders(),
        body: JSON.stringify({ points: points.slice(i, i + 128) }),
        signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) {
        throw new Error(`Qdrant: upsert HTTP ${res.status}`)
      }
    }
  },

  async search(userId: string, query: EmbeddingVector, topK: number): Promise<VectorSearchHit[]> {
    const collection = collectionName(query.model, query.dim)
    const res = await fetch(`${qdrantUrl()}/collections/${collection}/points/search`, {
      method: "POST",
      headers: qdrantHeaders(),
      body: JSON.stringify({
        vector: query.vector,
        limit: Math.min(topK, 100),
        with_payload: true,
        filter: {
          must: [
            { key: "userId", match: { value: userId } },
            { key: "model", match: { value: query.model } },
          ],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      if (res.status === 404) return [] // collection inexistante : rien d'indexé
      throw new Error(`Qdrant: recherche HTTP ${res.status}`)
    }
    const body = (await res.json()) as {
      result: Array<{ score: number; payload: { documentId: string; chunkIndex: number; text: string } }>
    }
    return body.result.map((r) => ({
      documentId: r.payload.documentId,
      chunkIndex: r.payload.chunkIndex,
      text: r.payload.text,
      score: Math.round(r.score * 1000) / 1000,
    }))
  },

  async deleteDocument(documentId: string) {
    // Suppression par filtre (toutes collections possibles — le modèle n'est
    // pas connu ici) : itère les collections listées.
    try {
      const list = await fetch(`${qdrantUrl()}/collections`, {
        headers: qdrantHeaders(),
        signal: AbortSignal.timeout(10_000),
      })
      if (!list.ok) return
      const body = (await list.json()) as { result?: { collections?: Array<{ name: string }> } }
      for (const col of body.result?.collections ?? []) {
        if (!col.name.startsWith("gen3ia_")) continue
        await fetch(`${qdrantUrl()}/collections/${col.name}/points/delete?wait=true`, {
          method: "POST",
          headers: qdrantHeaders(),
          body: JSON.stringify({ filter: { must: [{ key: "documentId", match: { value: documentId } }] } }),
          signal: AbortSignal.timeout(15_000),
        }).catch(() => undefined)
      }
    } catch {
      /* best-effort */
    }
  },
}

/** Identifiant de point déterministe (UUID v5-like depuis document+chunk). */
function deterministicId(documentId: string, chunkIndex: number): string {
  // Hash FNV-1a → hex 32 bits x 4 (format UUID accepté par Qdrant).
  let h1 = 2166136261, h2 = 2166136261, h3 = 2166136261, h4 = 2166136261
  const input = `${documentId}:${chunkIndex}`
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 16777619)
    h2 = Math.imul(h2 ^ (c + 1), 16777619)
    h3 = Math.imul(h3 ^ (c + 2), 16777619)
    h4 = Math.imul(h4 ^ (c + 3), 16777619)
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0")
  return `${hex(h1)}-${hex(h2).slice(0, 4)}-${hex(h3).slice(0, 4)}-${hex(h4).slice(0, 4)}-${hex(h1)}${hex(h2)}`.slice(0, 36)
}

// ─── Backend pgvector (Supabase natif) ───────────────────────

export const pgvectorBackend: VectorStoreBackend = {
  key: "pgvector",

  async available() {
    if (!(process.env.DATABASE_URL ?? "").startsWith("postgres")) return false
    if (!process.env.SUPABASE_DB_URL && !(process.env.DATABASE_URL ?? "").startsWith("postgres")) return false
    try {
      // L'extension doit exister (Supabase l'active via le dashboard ou SQL).
      await db.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`)
      return true
    } catch {
      // Extension indisponible (droits/SQLite) : pgvector inutilisable.
      return false
    }
  },

  async index(payload: IndexPayload) {
    if (payload.vectors.length === 0) return
    const model = payload.vectors[0]?.model ?? "unknown"
    const dim = payload.vectors[0]?.dim ?? 0
    if (dim === 0) return

    // Table dédiée (structurée comme Embedding, colonne vector native).
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "VectorIndex" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "documentId" TEXT NOT NULL,
        "chunkIndex" INTEGER NOT NULL,
        "chunkText" TEXT NOT NULL,
        "model" TEXT NOT NULL,
        "dim" INTEGER NOT NULL,
        "embedding" vector(${Math.min(Math.max(dim, 2), 16000)}),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "VectorIndex_user_model" ON "VectorIndex"("userId", "model");
      CREATE INDEX IF NOT EXISTS "VectorIndex_document" ON "VectorIndex"("documentId");
    `)

    await this.deleteDocument(payload.documentId)

    for (let i = 0; i < payload.chunks.length; i++) {
      const chunk = payload.chunks[i]
      const vec = payload.vectors[i]?.vector ?? []
      const vecLiteral = `[${vec.map((v) => Math.round(v * 10000) / 10000).join(",")}]`
      await db.$executeRawUnsafe(
        `INSERT INTO "VectorIndex" ("id", "userId", "documentId", "chunkIndex", "chunkText", "model", "dim", "embedding")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)`,
        `${payload.documentId}:${chunk.index}`,
        payload.userId,
        payload.documentId,
        chunk.index,
        chunk.text.slice(0, 4000),
        model,
        dim,
        vecLiteral
      )
    }
  },

  async search(userId: string, query: EmbeddingVector, topK: number): Promise<VectorSearchHit[]> {
    const vecLiteral = `[${query.vector.map((v) => Math.round(v * 10000) / 10000).join(",")}]`
    try {
      const rows = (await db.$queryRawUnsafe(
        `SELECT "documentId", "chunkIndex", "chunkText", 1 - ("embedding" <=> $1::vector) AS score
         FROM "VectorIndex"
         WHERE "userId" = $2 AND "model" = $3
         ORDER BY "embedding" <=> $1::vector
         LIMIT $4`,
        vecLiteral, userId, query.model, Math.min(topK, 100)
      )) as Array<{ documentId: string; chunkIndex: number; chunkText: string; score: number }>
      return rows.map((r) => ({
        documentId: r.documentId,
        chunkIndex: r.chunkIndex,
        text: r.chunkText,
        score: Math.round(Number(r.score) * 1000) / 1000,
      }))
    } catch {
      return [] // table absente : rien d'indexé via pgvector
    }
  },

  async deleteDocument(documentId: string) {
    await db.$executeRawUnsafe(`DELETE FROM "VectorIndex" WHERE "documentId" = $1`, documentId).catch(() => undefined)
  },
}

// ─── Backend json (historique, portable) ──────────────────────

export const jsonBackend: VectorStoreBackend = {
  key: "json",

  async available() {
    return true
  },

  async index(payload: IndexPayload) {
    await db.embedding.deleteMany({ where: { documentId: payload.documentId } })
    const rows = payload.vectors.map((v, i) => ({
      userId: payload.userId,
      documentId: payload.documentId,
      chunkIndex: payload.chunks[i]?.index ?? i,
      chunkText: (payload.chunks[i]?.text ?? "").slice(0, 4000),
      embedding: JSON.stringify(v.vector.map((x) => Math.round(x * 10000) / 10000)),
      dim: v.dim,
      norm: v.norm,
      model: v.model,
    }))
    for (let i = 0; i < rows.length; i += 64) {
      await db.embedding.createMany({ data: rows.slice(i, i + 64) })
    }
  },

  async search(userId: string, query: EmbeddingVector, topK: number): Promise<VectorSearchHit[]> {
    const rows = await db.embedding.findMany({
      where: { userId, model: query.model },
      select: { documentId: true, chunkIndex: true, chunkText: true, embedding: true, norm: true },
      take: 5000,
    })
    return rows
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
          score: cosineSimilarity(query.vector, query.norm, stored, row.norm ?? 1),
        }
      })
      .filter((h) => h.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((h) => ({ ...h, score: Math.round(h.score * 1000) / 1000 }))
  },

  async deleteDocument(documentId: string) {
    await db.embedding.deleteMany({ where: { documentId } })
  },
}

export const backendRegistry: Record<string, VectorStoreBackend> = {
  json: jsonBackend,
  pgvector: pgvectorBackend,
  qdrant: qdrantBackend,
}
