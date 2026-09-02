import { NextRequest } from "next/server"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { isComposioConfigured, listActionsForUser, listConnections } from "@/lib/connectors/composio"
import { getToolkit } from "@/lib/connectors/composio/client"

/**
 * GET /api/connectors/apps/[slug] — détail d'une application + ses actions.
 * Query : actionsLimit (défaut 20).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { slug } = await params
    if (!isComposioConfigured()) {
      throw new ApiError(
        503,
        "Connecteurs non activés : COMPOSIO_API_KEY n'est pas configurée sur le serveur. Ajoutez la clé pour activer les applications externes.",
        "CONNECTOR_NOT_CONFIGURED"
      )
    }
    const [toolkit, connections] = await Promise.all([
      getToolkit(slug),
      listConnections(user.id),
    ])
    const connection = connections.find((c) => c.toolkitSlug === slug) ?? null
    const actionsLimit = req.nextUrl.searchParams.get("actionsLimit")
    const actions = await listActionsForUser(user.id, {
      toolkit: slug,
      limit: actionsLimit ? Math.min(Number(actionsLimit), 50) : 20,
    })
    return jsonOk({
      app: {
        slug: toolkit.slug,
        name: toolkit.name,
        description: typeof toolkit.meta?.description === "string" ? toolkit.meta.description : "",
        categories: Array.isArray(toolkit.meta?.categories) ? toolkit.meta.categories : [],
        logo: typeof toolkit.meta?.logo === "string" ? toolkit.meta.logo : null,
        authGuideUrl: toolkit.authGuideUrl ?? null,
      },
      connection,
      actions,
    })
  })
}
