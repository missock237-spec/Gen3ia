import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { indexDocument } from "@/lib/rag/vector-store"
import { audit } from "@/lib/engines/audit"

/**
 * Réindexation vectorielle d'un document (migration des documents
 * antérieurs à la v3.1, ou changement de fournisseur d'embeddings).
 * POST /api/knowledge/[id]/reindex
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(
    req,
    async () => {
      const user = await requireUser(req)
      const { id } = await params
      const document = await db.document.findFirst({ where: { id, userId: user.id } })
      if (!document) throw new ApiError(404, "Document introuvable.", "NOT_FOUND")

      const result = await indexDocument(user.id, document.id, document.title, document.content)
      await audit(req, {
        userId: user.id,
        action: "DOCUMENT_REINDEXED",
        entityType: "document",
        entityId: document.id,
        detail: { chunks: result.chunks, model: result.model },
      })
      return Response.json({ ok: true, ...result })
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}
