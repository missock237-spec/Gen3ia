import { NextRequest } from "next/server"
import { handleRoute, jsonOk } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { listConnections } from "@/lib/connectors/core/connections"
import { ConnectionStatuses } from "@/lib/connectors/core/types"
import { getApp } from "@/lib/connectors/apps"
import { isComposioConfigured, listComposioConnections } from "@/lib/connectors/composio/provider"

/**
 * Connexions de l'utilisateur — vue SANITISÉE : aucun secret
 * n'est renvoyé (seuls statut, scopes et indices de compte).
 *
 * v4.2 — fusion : connexions LOCALES (secrets chiffrés GEN3IA) +
 * connexions hébergées COMPOSIO (id préfixé `cpc_`, aucun secret
 * ne transite : l'OAuth est opéré par la plateforme Composio).
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const connections = await listConnections(user.id)

    // Connexions hébergées Composio (live, cache 30 s — v4.2).
    const composioEnabled = await isComposioConfigured()
    const localAppSlugs = new Set(connections.map((c) => c.appSlug))
    const composioConnections = composioEnabled
      ? await listComposioConnections(user.id).catch(() => [])
      : []

    return jsonOk({
      connections: [
        ...connections.map((c) => ({
          id: c.id,
          appSlug: c.appSlug,
          appName: getApp(c.appSlug)?.name ?? c.appSlug,
          status: c.status,
          active: c.status === ConnectionStatuses.ACTIVE,
          provider: "local" as const,
          authScheme: c.authScheme,
          accountHint: c.meta?.accountHint ?? null,
          scopes: c.meta?.scopes ?? null,
          tokenExpiresAt: c.meta?.tokenExpiresAt ?? null,
          lastError: c.lastError,
          lastRefreshAt: c.lastRefreshAt?.toISOString() ?? null,
          connectedAt: c.createdAt.toISOString(),
        })),
        // Anti-doublon : une app déjà connectée LOCALEMENT reste prioritaire.
        ...composioConnections
          .filter((c) => !localAppSlugs.has(c.appSlug))
          .map((c) => ({
            id: c.id,
            appSlug: c.appSlug,
            appName: c.appName,
            status: c.status,
            active: c.active,
            provider: "composio" as const,
            authScheme: "OAUTH2",
            accountHint: c.accountHint,
            scopes: null,
            tokenExpiresAt: null,
            lastError: c.lastError,
            lastRefreshAt: null,
            connectedAt: c.createdAt,
          })),
      ],
    })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
