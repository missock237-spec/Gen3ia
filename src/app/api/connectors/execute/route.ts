import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { executeAction } from "@/lib/connectors/core/toolset"
import { ensureCatalogApps } from "@/lib/connectors/apps"
import { ConnectorExecutionError } from "@/lib/connectors/core/executor"

const executeSchema = z.object({
  appSlug: z.string().min(1),
  actionSlug: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
})

/**
 * POST /api/connectors/execute — exécution manuelle d'une action
 * (console de test + SDK). La même voie est utilisée par les agents
 * via le registre d'outils (runTool → runConnectorTool).
 */
export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    await ensureCatalogApps()
    const parsed = executeSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      throw new ApiError(400, "Corps invalide : appSlug, actionSlug et params requis.")
    }
    try {
      const result = await executeAction({
        userId: user.id,
        appSlug: parsed.data.appSlug,
        actionSlug: parsed.data.actionSlug,
        params: parsed.data.params,
      })
      return Response.json({
        ok: result.ok,
        appSlug: result.appSlug,
        actionSlug: result.actionSlug,
        status: result.status,
        statusText: result.statusText,
        data: result.data,
        output: result.output,
        latencyMs: result.latencyMs,
        error: result.error ?? null,
      })
    } catch (err) {
      if (err instanceof ConnectorExecutionError) {
        throw new ApiError(502, err.message, "CONNECTOR_EXECUTION")
      }
      throw err
    }
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
