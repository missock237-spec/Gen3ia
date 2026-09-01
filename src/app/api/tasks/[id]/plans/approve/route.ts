import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { resolvePlanApproval } from "@/lib/engines/orchestrator"

/**
 * Mode Explain (amélioration « Mode Explain — plan détaillé »).
 * POST : résout l'approbation des 5 plans — sélection, édition des étapes,
 * régénération ou refus. Voir resolvePlanApproval dans l'orchestrateur.
 */

const approveSchema = z.object({
  approved: z.boolean(),
  planId: z.string().max(2).optional(),
  editedSteps: z
    .array(
      z.object({
        title: z.string().min(3).max(200),
        detail: z.string().min(5).max(2000),
        tool: z.string().max(40).optional(),
      })
    )
    .max(8)
    .optional(),
  regenerate: z.boolean().optional(),
  reason: z.string().max(500).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(
    req,
    async () => {
      const user = await requireUser(req)
      const { id } = await params
      const body = await readJson(req, approveSchema)

      const task = await resolvePlanApproval(id, user.id, {
        approved: body.approved,
        planId: body.planId,
        editedSteps: body.editedSteps,
        regenerate: body.regenerate,
        reason: body.reason,
      })
      return Response.json({ ok: true, task })
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}
