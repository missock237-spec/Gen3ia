import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson } from "@/lib/api"
import { requireUser, getUserSettings } from "@/lib/auth/guards"
import { audit } from "@/lib/engines/audit"

const settingsSchema = z.object({
  maxAttempts: z.number().int().min(1).max(5).optional(),
  confirmDangerousOps: z.boolean().optional(),
  defaultProvider: z.string().max(30).optional(),
  defaultModel: z.string().max(60).optional(),
  /** v3.1 — mode Explain : « manual » exige l'approbation des plans avant exécution. */
  planApproval: z.enum(["auto", "manual"]).optional(),
})

/** Mise à jour des préférences utilisateur (autonomie, sécurité, moteur). */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, settingsSchema)

    const current = getUserSettings(user)
    const next = { ...current, ...body }
    await db.user.update({
      where: { id: user.id },
      data: { settings: JSON.stringify(next) },
    })
    await audit(req, {
      userId: user.id, action: "SETTINGS_UPDATED", entityType: "user", entityId: user.id,
      detail: { fields: Object.keys(body) },
    })
    return Response.json({ ok: true, settings: next })
  })
}
