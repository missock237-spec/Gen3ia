import { NextRequest } from "next/server"
import { handleRoute, jsonOk } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { isComposioConfigured, listAppsForUser } from "@/lib/connectors/composio"
import { listToolkitCategories } from "@/lib/connectors/composio/client"

/**
 * GET /api/connectors/apps — catalogue des applications (1000+ via Composio).
 * Query : search, category, limit (défaut 30), cursor.
 * La réponse inclut l'état de connexion de l'utilisateur demandeur.
 */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    if (!isComposioConfigured()) {
      return jsonOk({
        configured: false,
        apps: [],
        total: 0,
        totalPages: 0,
        cursor: null,
        categories: [],
        message:
          "Connecteurs non activés : définissez COMPOSIO_API_KEY pour parcourir et connecter les 1000+ applications.",
      })
    }
    const sp = req.nextUrl.searchParams
    const [catalog, categories] = await Promise.all([
      listAppsForUser(user.id, {
        search: sp.get("search") ?? undefined,
        category: sp.get("category") ?? undefined,
        limit: sp.get("limit") ? Math.min(Number(sp.get("limit")), 100) : 30,
        cursor: sp.get("cursor") ?? undefined,
      }),
      sp.get("withCategories") === "true"
        ? listToolkitCategories().catch(() => [] as string[])
        : Promise.resolve([] as string[]),
    ])
    return jsonOk({ configured: true, ...catalog, categories })
  })
}
