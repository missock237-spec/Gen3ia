import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute } from "@/lib/api"
import { authenticateApiKey, checkRateLimit } from "@/lib/auth/apikey"

/**
 * API publique v1 — GET /api/v1/keys
 * Clés API du propriétaire de la clé utilisée (préfixes uniquement —
 * les secrets complets ne sont JAMAIS renvoyés).
 */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)

    const keys = await db.apiKey.findMany({
      where: { userId: ctx.user.id, revoked: false },
      select: {
        id: true, name: true, prefix: true, scopes: true, requests: true,
        agentId: true, lastUsedAt: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    })

    return Response.json({ ok: true, keys })
  })
}
