import { NextRequest } from "next/server"
import { handleRoute, jsonOk } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { searchCatalog, catalogStats } from "@/lib/connectors/catalog"
import { ensureCatalogApps, appAvailability } from "@/lib/connectors/apps"
import { buildDynamicApp } from "@/lib/connectors/apps/dynamic"
import { OAUTH_ENDPOINTS } from "@/lib/connectors/catalog/endpoints"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/connectors/catalog?search=&category=&page=&pageSize=|?stats=1
 * Catalogue complet des applications (1467 apps, 51240 outils) avec
 * état de connectivité résolu pour chaque app retournée.
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    await requireUser(req)
    await ensureCatalogApps()

    const url = new URL(req.url)

    if (url.searchParams.get("stats") === "1") {
      return jsonOk({ stats: catalogStats(), registryApps: Object.keys(OAUTH_ENDPOINTS).length })
    }

    const result = searchCatalog({
      search: url.searchParams.get("search") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      page: Number(url.searchParams.get("page") ?? 1) || 1,
      pageSize: Number(url.searchParams.get("pageSize") ?? 24) || 24,
    })

    // Connectivité par app : NATIVE | OAUTH_READY | KEY_IMPORT | COMING_SOON
    const apps = result.apps.map((a) => {
      const native = buildDynamicApp(a.slug)
      const availability = native ? appAvailability(native) : null
      const inRegistry = OAUTH_ENDPOINTS[a.slug] !== undefined
      const status = native
        ? availability?.connectable
          ? "OAUTH_READY"
          : inRegistry || native.supportsTokenImport
            ? "OAUTH_READY"
            : "KEY_IMPORT"
        : inRegistry
          ? "OAUTH_READY"
          : "COMING_SOON"
      const credSource =
        native?.oauth2 && native.oauth2.clientId.length > 0
          ? availability?.envConfigured
            ? "ENV"
            : "ADMIN"
          : null
      return {
        slug: a.slug,
        name: a.name,
        logo: a.logo,
        description: a.description,
        category: a.category,
        authSchemes: a.authSchemes,
        toolCount: a.toolCount,
        triggerCount: a.triggerCount,
        status,
        credSource,
        native: native !== null && native.actions.length > 0,
      }
    })

    return jsonOk({
      apps,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    })
  })
}
