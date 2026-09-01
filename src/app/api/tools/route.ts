import { NextRequest } from "next/server"
import { handleRoute } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { TOOL_CATALOG } from "@/lib/tools/registry"

/** Catalogue des outils réels disponibles (avec statut sensible). */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    await requireUser(req)
    return Response.json({
      ok: true,
      tools: TOOL_CATALOG.map((t) => ({
        key: t.key,
        name: t.name,
        description: t.description,
        category: t.category,
        dangerous: t.dangerous,
        parameters: t.parameters,
      })),
    })
  })
}
