import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { chunkText } from "@/lib/rag/retriever"
import { indexDocument } from "@/lib/rag/vector-store"
import { listParams, paginate } from "@/lib/api-pagination"
import { audit } from "@/lib/engines/audit"

const addSchema = z.object({
  title: z.string().min(2).max(150),
  content: z.string().min(20).max(200000),
  sourceType: z.enum(["TEXT", "FILE", "URL"]).default("TEXT"),
})

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { limit, cursor } = listParams(new URL(req.url).searchParams)
    const rows = await db.document.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, title: true, sourceType: true, size: true, createdAt: true,
        agentId: true,
      },
    })
    const { page, nextCursor } = paginate(rows, limit)
    return Response.json({
      ok: true,
      documents: page.map((d) => ({
        ...d,
        chunks: d.size, // taille = nombre de caractères ; le détail des morceaux est indexé
      })),
      nextCursor,
    })
  })
}

/** Ajout d'un document : découpage + embeddings persistés (v3.1 — recherche hybride). */
export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async () => {
      const user = await requireUser(req)
      const body = await readJson(req, addSchema)

      const chunks = chunkText(body.content)
      if (chunks.length === 0) {
        throw new ApiError(400, "Document vide ou non indexable.", "EMPTY_DOC")
      }

      const document = await db.document.create({
        data: {
          userId: user.id,
          title: body.title.trim(),
          sourceType: body.sourceType,
          content: body.content,
          chunks: JSON.stringify(chunks),
          size: body.content.length,
        },
      })

      // v3.1 : indexation vectorielle à l'ingestion (embedding calculé UNE fois,
      // jamais à la requête). Best-effort : la recherche lexical TF-IDF reste
      // le repli si l'embeddings échoue.
      let vectors = 0
      let embeddingModel: string | null = null
      try {
        const indexed = await indexDocument(user.id, document.id, document.title, body.content)
        vectors = indexed.chunks
        embeddingModel = indexed.model
      } catch {
        // Document conservé : la réindexation manuelle reste possible.
      }

      await audit(req, {
        userId: user.id, action: "DOCUMENT_ADDED", entityType: "document", entityId: document.id,
        detail: { chunks: chunks.length, size: body.content.length, vectors, embeddingModel },
      })
      return Response.json({
        ok: true,
        document: { id: document.id, title: document.title, size: document.size, chunks: chunks.length, vectors, embeddingModel },
      })
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}
