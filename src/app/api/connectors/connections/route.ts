import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, jsonOk, readJson } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { getAppUrl } from "@/lib/config"
import {
  initiateConnection,
  listConnections,
  syncAllConnections,
} from "@/lib/connectors/composio"

/**
 * GET /api/connectors/connections — connexions de l'utilisateur.
 * Query : sync=true → resynchronise les statuts distants d'abord.
 *
 * POST /api/connectors/connections — initie une connexion d'application.
 * Body : { toolkitSlug } → { connection, redirectUrl, expiresAt }.
 * L'utilisateur suit redirectUrl (page d'autorisation hébergée Composio),
 * puis revient via /api/connectors/callback.
 */
const initiateSchema = z.object({
  toolkitSlug: z.string().min(1).max(120),
})

export async function GET(req: NextRequest) {
  return handleRoute(
    req,
    async () => {
      const user = await requireUser(req)
      const sync = req.nextUrl.searchParams.get("sync") === "true"
      const connections = sync
        ? await syncAllConnections(user.id).catch(() => listConnections(user.id))
        : await listConnections(user.id)
      return jsonOk({ connections })
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async () => {
      const user = await requireUser(req)
      const { toolkitSlug } = await readJson(req, initiateSchema)
      const callbackUrl = `${getAppUrl()}/api/connectors/callback`
      const result = await initiateConnection(user.id, { toolkitSlug, callbackUrl })
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: "CONNECTOR_INITIATED",
          entityType: "ConnectedAccount",
          entityId: result.connection.id,
          detail: JSON.stringify({ toolkitSlug, composioId: result.connection.composioId }),
        },
      })
      return jsonOk(result)
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}
