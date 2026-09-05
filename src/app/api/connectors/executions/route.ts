import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { listGatewayExecutions } from "@/lib/connectors/gateway/gateway"

const querySchema = z.object({
  appSlug: z.string().trim().min(1).optional(),
  status: z.enum(["PENDING", "CONFIRMATION_REQUIRED", "RUNNING", "SUCCESS", "VERIFIED", "FAILED", "REJECTED", "EXPIRED"]).optional(),
  taskId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

/**
 * GET /api/connectors/executions — historique des exécutions d'actions
 * de l'utilisateur (Action Gateway, ADR-0017) : statut, risque, décision
 * de permission, vérification, chaîne de trace taskId/planId/stepIndex.
 * Filtres : ?status=CONFIRMATION_REQUIRED (demandes en attente),
 * ?appSlug=github, ?taskId=..., ?limit=50.
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const url = new URL(req.url)
    const parsed = querySchema.safeParse({
      appSlug: url.searchParams.get("appSlug") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      taskId: url.searchParams.get("taskId") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    })
    if (!parsed.success) {
      throw new ApiError(400, "Paramètres invalides : status, appSlug, taskId, limit.")
    }
    const executions = await listGatewayExecutions(user.id, parsed.data)
    return jsonOk({ executions })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
