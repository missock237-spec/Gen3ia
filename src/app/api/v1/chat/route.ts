import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson } from "@/lib/api"
import { authenticateApiKey, resolveAgent, checkRateLimit } from "@/lib/auth/apikey"
import { agentChat } from "@/lib/agents/chat"

const chatSchema = z.object({
  message: z.string().min(1).max(8000),
  agent_slug: z.string().max(60).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .max(20)
    .default([]),
})

/**
 * API publique v1 — POST /api/v1/chat
 * Conversation directe avec un agent publié (inférence réelle).
 */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)

    const body = await readJson(req, chatSchema)
    const agent = await resolveAgent(ctx, body.agent_slug)

    // Accès : clé liée à l'agent OU agent du propriétaire de la clé OU agent public (marketplace).
    const accessible =
      ctx.apiKey.agentId === agent.id ||
      agent.userId === ctx.user.id ||
      agent.visibility === "MARKETPLACE"
    if (!accessible) {
      return Response.json(
        { ok: false, error: "Cet agent n'est pas accessible avec cette clé.", code: "FORBIDDEN" },
        { status: 403 }
      )
    }

    const result = await agentChat(ctx.user, agent, body.message, body.history)
    return Response.json({
      ok: true,
      agent: { slug: agent.slug, name: agent.name },
      answer: result.answer,
      usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut, credits: result.credits },
      latencyMs: result.latencyMs,
    })
  })
}
