import { NextRequest } from "next/server"
import { handleRoute, jsonOk } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** GET /api/voice/dictations — historique de dictée (30 dernières). */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const rows = await db.dictationEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    })
    return jsonOk({
      dictations: rows.map((r) => ({
        id: r.id,
        text: r.text,
        durationMs: r.durationMs,
        lang: r.lang,
        createdAt: r.createdAt.toISOString(),
      })),
    })
  })
}

/** DELETE /api/voice/dictations — efface TOUT l'historique de dictée. */
export async function DELETE(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    await db.dictationEntry.deleteMany({ where: { userId: user.id } })
    return jsonOk({ cleared: true })
  })
}
