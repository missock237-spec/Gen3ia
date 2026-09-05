import { NextRequest } from "next/server"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { getGatewayExecution } from "@/lib/connectors/gateway/gateway"

/**
 * GET /api/connectors/executions/:id — détail complet d'une exécution :
 * évaluation de risque (facteurs), décision de permission, params rédigés,
 * résultat, rapport de vérification (contrôles + preuves), chaîne de trace.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const execution = await getGatewayExecution(id, user.id)
    if (!execution) throw new ApiError(404, "Exécution introuvable.")
    return jsonOk({ execution })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
