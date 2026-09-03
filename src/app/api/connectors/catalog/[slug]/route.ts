import { NextRequest } from "next/server"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { getCatalogApp, getCatalogTools, searchCatalog } from "@/lib/connectors/catalog"
import { OAUTH_ENDPOINTS } from "@/lib/connectors/catalog/endpoints"
import { ensureCatalogApps, appAvailability, getApp } from "@/lib/connectors/apps"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/connectors/catalog/[slug]
 * Détail d'une app : métadonnées + outils + déclencheurs + connectivité.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  return handleRoute(req, async () => {
    await requireUser(req)
    await ensureCatalogApps()

    const { slug } = await params
    const app = getCatalogApp(slug)
    if (!app) throw new ApiError(404, `Application introuvable dans le catalogue : ${slug}`)

    const { tools, triggers } = getCatalogTools(slug)
    const endpoints = OAUTH_ENDPOINTS[slug] ?? null
    const resolved = getApp(slug)
    const availability = resolved ? appAvailability(resolved) : null

    // Pagination des outils si demandée.
    const url = new URL(req.url)
    const page = Math.max(1, Number(url.searchParams.get("toolsPage") ?? 1) || 1)
    const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("toolsPageSize") ?? 40) || 40))
    const start = (page - 1) * pageSize
    const toolsPage = tools.slice(start, start + pageSize)

    return jsonOk({
      app: {
        slug: app.slug,
        name: app.name,
        logo: app.logo,
        description: app.description,
        category: app.category,
        authSchemes: app.authSchemes,
        toolCount: app.toolCount,
        triggerCount: app.triggerCount,
        version: app.version,
      },
      connectivity: {
        // NATIVE : actions exécutables localement (spec intégrée).
        native: resolved !== null && resolved.actions.length > 0,
        actionCount: resolved?.actions.length ?? 0,
        // OAUTH_READY : endpoints réels + identifiants plateforme disponibles.
        connectable: availability?.connectable ?? false,
        mode: availability?.mode ?? "UNAVAILABLE",
        reason: availability?.reason ?? null,
        credSource: resolved?.oauth2?.clientId ? (availability?.envConfigured ? "ENV" : "ADMIN") : null,
        inRegistry: endpoints !== null,
        docsUrl: endpoints?.docsUrl ?? null,
      },
      tools: toolsPage,
      toolsTotal: tools.length,
      toolsPage: page,
      toolsPageSize: pageSize,
      triggers: triggers.slice(0, 20),
      triggersTotal: triggers.length,
    })
  })
}
