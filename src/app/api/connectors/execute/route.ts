import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { executeGuardedAction } from "@/lib/connectors/gateway/gateway"
import { ensureCatalogApps } from "@/lib/connectors/apps"
import { ConnectorExecutionError } from "@/lib/connectors/core/executor"

const executeSchema = z.object({
  appSlug: z.string().min(1),
  actionSlug: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
})

/**
 * POST /api/connectors/execute — exécution d'une action via l'Action
 * Gateway (ADR-0017) : Risk Engine → Permission Engine → exécution
 * (locale prioritaire, relay Composio) → vérification → audit.
 *
 * Une action à risque au-dessus du plafond couvert renvoie
 * { ok: false, executionStatus: "CONFIRMATION_REQUIRED", executionId }
 * — approuvable depuis /api/connectors/executions/{id}/confirm.
 * La console de test et le SDK utilisent cette même voie que les agents.
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
      const result = await executeGuardedAction({
        userId: user.id,
        appSlug: parsed.data.appSlug,
        actionSlug: parsed.data.actionSlug,
        params: parsed.data.params,
        source: "CONSOLE",
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
        // Champs Action Gateway (v4.3)
        executionId: result.executionId,
        executionStatus: result.executionStatus,
        risk: result.risk,
        permission: result.permission,
        verification: result.verification ?? null,
        confirmation: result.confirmation ?? null,
      })
    } catch (err) {
      if (err instanceof ConnectorExecutionError) {
        throw new ApiError(502, err.message, "CONNECTOR_EXECUTION")
      }
      throw err
    }
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
