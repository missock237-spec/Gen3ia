import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute } from "@/lib/api"
import { authenticateApiKey, checkRateLimit } from "@/lib/auth/apikey"

/**
 * API publique v1 — GET /api/v1/agents
 * Agents accessibles avec cette clé : agents publics (marketplace),
 * agents du propriétaire de la clé, et l'agent lié à la clé.
 * Aucun prompt système ni secret n'est exposé.
 */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)

    const agents = await db.agent.findMany({
      where: {
        status: { in: ["PUBLISHED", "PAUSED"] },
        OR: [
          { visibility: "MARKETPLACE" },
          { userId: ctx.user.id },
          { id: ctx.apiKey.agentId ?? "__none__" },
        ],
      },
      select: {
        id: true, slug: true, name: true, description: true, category: true,
        provider: true, model: true, temperature: true, status: true, visibility: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: { name: "asc" },
      take: 200,
    })

    return Response.json({ ok: true, agents })
  })
}
