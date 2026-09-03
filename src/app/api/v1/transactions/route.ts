import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute } from "@/lib/api"
import { authenticateApiKey, checkRateLimit } from "@/lib/auth/apikey"
import { listParams } from "@/lib/api-pagination"

/**
 * API publique v1 — GET /api/v1/transactions?limit=&offset=
 * Historique des transactions de crédits du propriétaire de la clé.
 */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)

    const { limit } = listParams(new URL(req.url).searchParams)
    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where: { userId: ctx.user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true, type: true, amount: true, balanceAfter: true,
          description: true, refType: true, refId: true, createdAt: true,
        },
      }),
      db.transaction.count({ where: { userId: ctx.user.id } }),
    ])

    return Response.json({ ok: true, transactions, total, limit })
  })
}
