import { NextRequest } from "next/server"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { listApps, appAvailability } from "@/lib/connectors/apps"
import { listConnections } from "@/lib/connectors/core/connections"
import { ConnectionStatuses } from "@/lib/connectors/core/types"

/**
 * Catalogue des applications connectables + état des connexions
 * de l'utilisateur. Miroir du catalogue de toolkits Composio, mais
 * résolu localement (disponibilité env + statut de connexion).
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const connections = await listConnections(user.id)
    const byApp = new Map(connections.map((c) => [c.appSlug, c]))

    const apps = listApps().map((app) => {
      const availability = appAvailability(app)
      const connection = byApp.get(app.slug)
      return {
        slug: app.slug,
        name: app.name,
        description: app.description,
        category: app.category,
        logo: app.logo,
        docsUrl: app.docsUrl,
        authScheme: app.authScheme,
        connectable: availability.connectable,
        mode: availability.mode,
        requiredEnvVars: availability.requiredEnvVars,
        reason: availability.reason,
        supportsTokenImport: app.supportsTokenImport,
        tokenImportLabel: app.apiKeyEnv?.label ?? null,
        actionCount: app.actions.length,
        actions: app.actions.map((a) => ({
          slug: a.slug,
          name: a.name,
          description: a.description,
          method: a.method,
          dangerous: a.method !== "GET",
          parameters: a.params.map((p) => ({
            name: p.name,
            type: p.type,
            description: p.description,
            required: p.required,
            in: p.in,
            enum: p.enum,
          })),
        })),
        connection: connection
          ? {
              id: connection.id,
              status: connection.status,
              active: connection.status === ConnectionStatuses.ACTIVE,
              accountHint: connection.meta?.accountHint ?? null,
              scopes: connection.meta?.scopes ?? null,
              lastError: connection.lastError,
              lastRefreshAt: connection.lastRefreshAt?.toISOString() ?? null,
              tokenExpiresAt: connection.meta?.tokenExpiresAt ?? null,
              connectedAt: connection.createdAt.toISOString(),
            }
          : null,
      }
    })

    return jsonOk({
      apps,
      connectedCount: connections.filter((c) => c.status === ConnectionStatuses.ACTIVE).length,
    })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}

export { ApiError }
