import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { resolveExecutionConfirmation } from "@/lib/connectors/gateway/gateway"

const confirmSchema = z.object({
  approved: z.boolean(),
  /** Crée une permission persistante « app.* → plafond » après approbation
   * (« toujours autoriser jusqu'à ce niveau pour cette app »). */
  remember: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  reason: z.string().max(500).optional(),
})

/**
 * POST /api/connectors/executions/:id/confirm — résout une demande de
 * confirmation d'action (HITL au niveau ACTION, ADR-0017).
 *
 * approved: true → l'action s'exécute (params réels déchiffrés, plafond
 * CRITICAL explicitement couvert par CETTE approbation ; un DENY posé
 * entre-temps gagne toujours). approved: false → statut REJECTED.
 * remember: "HIGH" → permission persistante app.* jusqu'au niveau HIGH.
 * Fail-closed : demande expirée → statut EXPIRED, aucun effet de bord.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const parsed = confirmSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      throw new ApiError(400, "Corps invalide : approved (booléen) requis, remember/reason optionnels.")
    }
    try {
      const result = await resolveExecutionConfirmation(id, user.id, {
        approved: parsed.data.approved,
        remember: parsed.data.remember ?? null,
        reason: parsed.data.reason ?? null,
        decidedBy: user.email,
      })
      return jsonOk({
        ok: result.ok,
        executionId: result.executionId,
        executionStatus: result.executionStatus,
        status: result.status,
        output: result.output,
        error: result.error ?? null,
        risk: result.risk,
        verification: result.verification ?? null,
      })
    } catch (err) {
      throw new ApiError(409, err instanceof Error ? err.message : "Résolution impossible.")
    }
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
