import { NextRequest } from "next/server"
import { handleRoute, jsonOk } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { listConnections } from "@/lib/connectors/core/connections"
import { ConnectionStatuses } from "@/lib/connectors/core/types"
import { getApp } from "@/lib/connectors/apps"

/**
 * Connexions de l'utilisateur — vue SANITISÉE : aucun secret
 * n'est renvoyé (seuls statut, scopes et indices de compte).
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const connections = await listConnections(user.id)
    return jsonOk({
      connections: connections.map((c) => ({
        id: c.id,
        appSlug: c.appSlug,
        appName: getApp(c.appSlug)?.name ?? c.appSlug,
        status: c.status,
        active: c.status === ConnectionStatuses.ACTIVE,
        authScheme: c.authScheme,
        accountHint: c.meta?.accountHint ?? null,
        scopes: c.meta?.scopes ?? null,
        tokenExpiresAt: c.meta?.tokenExpiresAt ?? null,
        lastError: c.lastError,
        lastRefreshAt: c.lastRefreshAt?.toISOString() ?? null,
        connectedAt: c.createdAt.toISOString(),
      })),
    })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
