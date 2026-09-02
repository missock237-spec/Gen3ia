import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute, jsonOk } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { disconnectConnection, syncConnection } from "@/lib/connectors/composio"

/**
 * GET  /api/connectors/connections/[id] — resynchronise et renvoie la connexion.
 * DELETE /api/connectors/connections/[id] — déconnecte l'application
 * (révocation chez Composio + suppression locale + journal d'audit).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(
    req,
    async () => {
      const user = await requireUser(req)
      const { id } = await params
      const connection = await syncConnection(user.id, id)
      return jsonOk({ connection })
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(
    req,
    async () => {
      const user = await requireUser(req)
      const { id } = await params
      const row = await db.connectedAccount.findFirst({ where: { id, userId: user.id } })
      await disconnectConnection(user.id, id)
      if (row) {
        await db.auditLog.create({
          data: {
            userId: user.id,
            action: "CONNECTOR_DISCONNECTED",
            entityType: "ConnectedAccount",
            entityId: id,
            detail: JSON.stringify({ toolkitSlug: row.toolkitSlug, composioId: row.composioId }),
          },
        })
      }
      return jsonOk({})
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}
