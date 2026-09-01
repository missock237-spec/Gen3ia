import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { searchKnowledge } from "@/lib/rag/retriever"

const searchSchema = z.object({ query: z.string().min(2).max(500) })

/** Test de la recherche RAG sur la base de connaissances de l'utilisateur. */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, searchSchema)
    const results = await searchKnowledge(user.id, body.query, 5)
    return Response.json({
      ok: true,
      results: results.map((r) => ({
        title: r.title,
        score: r.score,
        excerpt: r.text.slice(0, 600),
      })),
    })
  })
}
