import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson } from "@/lib/api"
import { authenticateApiKey, checkRateLimit } from "@/lib/auth/apikey"
import { chargeCredits } from "@/lib/credits/ledger"
import { embeddingProvider, embedTexts } from "@/lib/rag/embeddings"

const embeddingsSchema = z.object({
  input: z.union([z.string().min(1).max(32_000), z.array(z.string().min(1).max(32_000)).min(1).max(64)]),
  model: z.string().max(120).optional(),
})

/**
 * API unifiée v1 — POST /api/v1/embeddings
 * Embeddings vectoriels (fournisseur auto : OpenAI-compat / HF / local).
 * Facturés au crédit (0.01 minimum, coût réel par tokens).
 */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)

    const body = await readJson(req, embeddingsSchema)
    const texts = Array.isArray(body.input) ? body.input : [body.input]

    const providerInfo = embeddingProvider()
    const started = Date.now()
    const vectors = await embedTexts(texts)
    const elapsed = Date.now() - started

    // Facturation : coût par tokens (min 0.01 crédit — cohérent avec le ledger).
    const approxTokens = texts.reduce((acc, t) => acc + Math.ceil(t.length / 4), 0)
    const credits = Math.max(0.01, Math.round((approxTokens / 100_000) * 1000) / 1000)
    await chargeCredits(ctx.user.id, credits, {
      type: "EMBEDDINGS_API",
      description: `API /v1/embeddings — ${texts.length} texte(s), ${vectors[0]?.dim ?? 0} dims`,
      refType: "apikey",
      refId: ctx.apiKey.id,
    })

    return Response.json({
      ok: true,
      model: body.model ?? vectors[0]?.model ?? providerInfo.model,
      dim: vectors[0]?.dim ?? providerInfo.dim,
      count: vectors.length,
      latencyMs: elapsed,
      creditsUsed: credits,
      data: vectors.map((v, i) => ({ index: i, embedding: v.vector.map((x) => Math.round(x * 10000) / 10000) })),
    })
  })
}
