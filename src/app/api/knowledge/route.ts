import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { chunkText } from "@/lib/rag/retriever"
import { audit } from "@/lib/engines/audit"

const addSchema = z.object({
  title: z.string().min(2).max(150),
  content: z.string().min(20).max(200000),
  sourceType: z.enum(["TEXT", "FILE", "URL"]).default("TEXT"),
})

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const documents = await db.document.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, title: true, sourceType: true, size: true, createdAt: true,
        agentId: true,
      },
    })
    return Response.json({
      ok: true,
      documents: documents.map((d) => ({
        ...d,
        chunks: d.size, // taille = nombre de caractères ; le détail des morceaux est indexé
      })),
    })
  })
}

/** Ajout d'un document : découpage immédiat en morceaux indexés pour le RAG. */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
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
    await audit(req, {
      userId: user.id, action: "DOCUMENT_ADDED", entityType: "document", entityId: document.id,
      detail: { chunks: chunks.length, size: body.content.length },
    })
    return Response.json({
      ok: true,
      document: { id: document.id, title: document.title, size: document.size, chunks: chunks.length },
    })
  })
}
