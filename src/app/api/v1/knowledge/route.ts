import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { authenticateApiKey, checkRateLimit } from "@/lib/auth/apikey"
import { chunkText } from "@/lib/rag/retriever"
import { indexDocument, vectorBackendInfo } from "@/lib/rag/vector-store"
import { searchKnowledge } from "@/lib/rag/retriever"
import { listParams, paginate } from "@/lib/api-pagination"

const createSchema = z.object({
  title: z.string().min(2).max(150),
  content: z.string().min(20).max(200_000),
  source_type: z.enum(["TEXT", "FILE", "URL"]).default("TEXT"),
})

const searchSchema = z.object({ query: z.string().min(2).max(500), top_k: z.number().int().min(1).max(20).default(5) })

/**
 * API unifiée v1 — /api/v1/knowledge
 * GET    : documents de la base de connaissances (paginé) ;
 * POST   : ingestion (chunk + embeddings + archive HF Bucket si configuré) ;
 * PUT    : recherche hybride RAG (vecteur + lexical + re-rank).
 */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)
    const { limit, cursor } = listParams(new URL(req.url).searchParams)
    const rows = await db.document.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, title: true, sourceType: true, size: true, createdAt: true },
    })
    const { page, nextCursor } = paginate(rows, limit)
    return Response.json({
      ok: true,
      documents: page,
      nextCursor,
      backend: await vectorBackendInfo().catch(() => null),
    })
  })
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)
    const body = await readJson(req, createSchema)

    const chunks = chunkText(body.content)
    if (chunks.length === 0) {
      throw new ApiError(400, "Document vide ou non indexable.", "EMPTY_DOC")
    }

    const document = await db.document.create({
      data: {
        userId: ctx.user.id,
        title: body.title.trim(),
        sourceType: body.source_type,
        content: body.content,
        size: body.content.length,
        chunks: JSON.stringify(chunks),
      },
    })
    const indexing = await indexDocument(ctx.user.id, document.id, document.title, body.content)

    return Response.json(
      {
        ok: true,
        documentId: document.id,
        title: document.title,
        chunks: indexing.chunks,
        embeddingModel: indexing.model,
        dim: indexing.dim,
        vectorBackend: indexing.backend,
      },
      { status: 201 }
    )
  })
}

/** Recherche RAG hybride (PUT pour distinguer de l'ingestion POST). */
export async function PUT(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)
    const body = await readJson(req, searchSchema)

    const started = Date.now()
    const results = await searchKnowledge(ctx.user.id, body.query, body.top_k)
    return Response.json({
      ok: true,
      query: body.query,
      latencyMs: Date.now() - started,
      results: results.map((r) => ({
        documentId: r.documentId,
        title: r.title,
        score: r.score,
        method: r.method ?? "hybrid",
        excerpt: r.text.slice(0, 600),
      })),
    })
  })
}
