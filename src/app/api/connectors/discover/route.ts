import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { discoverConnectorTools } from "@/lib/connectors/gateway/tool-discovery"

const querySchema = z.object({
  q: z.string().trim().min(2).max(300),
  limitApps: z.coerce.number().int().min(3).max(12).optional(),
  limitTools: z.coerce.number().int().min(5).max(60).optional(),
})

/**
 * GET /api/connectors/discover?q=... — Tool Discovery (ADR-0017) :
 * apps + outils classés par pertinence pour une demande en langage
 * naturel, enrichis de l'état de connexion de l'utilisateur et du
 * niveau de risque de chaque action.
 *
 * Ex : ?q=analyser mes emails gmail et creer des taches dans notion
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const url = new URL(req.url)
    const parsed = querySchema.safeParse({
      q: url.searchParams.get("q") ?? "",
      limitApps: url.searchParams.get("limitApps") ?? undefined,
      limitTools: url.searchParams.get("limitTools") ?? undefined,
    })
    if (!parsed.success) {
      throw new ApiError(400, "Paramètre q requis (2 caractères minimum).")
    }
    const discovery = await discoverConnectorTools(parsed.data.q, {
      userId: user.id,
      limitApps: parsed.data.limitApps,
      limitTools: parsed.data.limitTools,
    })
    return jsonOk({ terms: discovery.terms, apps: discovery.apps, tools: discovery.tools })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
