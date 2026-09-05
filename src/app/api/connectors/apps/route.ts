import { NextRequest } from "next/server"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { listApps, appAvailability } from "@/lib/connectors/apps"
import { listConnections } from "@/lib/connectors/core/connections"
import { ConnectionStatuses } from "@/lib/connectors/core/types"
import {
  isComposioConfigured,
  listComposioConnections,
  type ComposioConnectionView,
} from "@/lib/connectors/composio/provider"

/**
 * Catalogue des applications connectables + état des connexions
 * de l'utilisateur. Miroir du catalogue de toolkits Composio, mais
 * résolu localement (disponibilité env + statut de connexion).
 * v4.2 : mode COMPOSIO (connexion one-click hébergée) + connexions
 * Composio actives prises en compte par app.
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const connections = await listConnections(user.id)
    const byApp = new Map(connections.map((c) => [c.appSlug, c]))
    const composioEnabled = await isComposioConfigured()

    // Connexions Composio actives par app (pour les 13 natives).
    const composioByApp = new Map<string, ComposioConnectionView>()
    if (composioEnabled) {
      const views = await listComposioConnections(user.id).catch(() => [] as ComposioConnectionView[])
      for (const v of views) {
        if (v.active) composioByApp.set(v.appSlug, v)
      }
    }

    const apps = listApps().map((app) => {
      const availability = appAvailability(app, { composioEnabled })
      const connection = byApp.get(app.slug)
      const composioConnection = composioByApp.get(app.slug) ?? null
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
              provider: "local" as const,
              accountHint: connection.meta?.accountHint ?? null,
              scopes: connection.meta?.scopes ?? null,
              lastError: connection.lastError,
              lastRefreshAt: connection.lastRefreshAt?.toISOString() ?? null,
              tokenExpiresAt: connection.meta?.tokenExpiresAt ?? null,
              connectedAt: connection.createdAt.toISOString(),
            }
          : composioConnection
            ? {
                id: composioConnection.id,
                status: composioConnection.status,
                active: true,
                provider: "composio" as const,
                accountHint: composioConnection.accountHint,
                scopes: null,
                lastError: composioConnection.lastError,
                lastRefreshAt: null,
                tokenExpiresAt: null,
                connectedAt: composioConnection.createdAt,
              }
            : null,
      }
    })

    return jsonOk({
      apps,
      composio: composioEnabled,
      connectedCount: connections.filter((c) => c.status === ConnectionStatuses.ACTIVE).length,
    })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}

export { ApiError }
