import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { grantConnectorPermission, listConnectorPermissions } from "@/lib/connectors/gateway/permissions"

const grantSchema = z.object({
  appSlug: z.string().trim().min(1).max(64),
  actionPattern: z.string().trim().min(1).max(128),
  effect: z.enum(["ALLOW", "DENY"]),
  riskFloor: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  note: z.string().max(300).optional(),
  /** Durée de validité en jours (absent = permanent). */
  expiresInDays: z.number().int().min(1).max(365).optional(),
})

/**
 * GET /api/connectors/permissions — permissions de l'utilisateur
 * (motifs app/action, effet, plafond de risque, expiration).
 *
 * POST /api/connectors/permissions — accorde/met à jour une permission.
 * Motifs : « gmail.* » (toute l'app), « gmail.send_email » (action exacte),
 * « *.send_email » (action sur toutes les apps), «*» (tout).
 * DENY prioritaire sur ALLOW ; riskFloor = plafond couvert.
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const permissions = await listConnectorPermissions(user.id)
    return jsonOk({ permissions })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}

export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const parsed = grantSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      throw new ApiError(400, "Corps invalide : appSlug, actionPattern, effect, riskFloor requis.")
    }
    try {
      const permission = await grantConnectorPermission({
        userId: user.id,
        appSlug: parsed.data.appSlug,
        actionPattern: parsed.data.actionPattern,
        effect: parsed.data.effect,
        riskFloor: parsed.data.riskFloor,
        source: "USER",
        createdBy: user.email,
        note: parsed.data.note ?? null,
        expiresAt: parsed.data.expiresInDays
          ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000)
          : null,
      })
      return jsonOk({ permission })
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : "Permission invalide.")
    }
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
