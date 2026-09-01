import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireAdmin } from "@/lib/auth/guards"
import { grantCredits } from "@/lib/credits/ledger"
import { audit } from "@/lib/engines/audit"

const patchSchema = z.object({
  credits: z.number().min(1).max(100000).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  reason: z.string().max(200).optional(),
})

/** Administration d'un utilisateur : attribution de crédits (via le ledger) ou rôle. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const admin = await requireAdmin(req)
    const { id } = await params
    const body = await readJson(req, patchSchema)
    const target = await db.user.findUnique({ where: { id } })
    if (!target) throw new ApiError(404, "Utilisateur introuvable.", "NOT_FOUND")

    if (body.role) {
      await db.user.update({ where: { id: target.id }, data: { role: body.role } })
      await audit(req, {
        userId: admin.id, action: "ADMIN_ROLE_CHANGED", entityType: "user", entityId: target.id,
        detail: { role: body.role },
      })
    }
    if (body.credits) {
      await grantCredits(target.id, body.credits, {
        type: "ADJUSTMENT",
        description: `Ajustement administrateur${body.reason ? ` — ${body.reason}` : ""}`,
        refType: "user",
        refId: admin.id,
      })
      await audit(req, {
        userId: admin.id, action: "ADMIN_CREDITS_GRANTED", entityType: "user", entityId: target.id,
        detail: { credits: body.credits, reason: body.reason },
      })
    }
    const updated = await db.user.findUniqueOrThrow({
      where: { id: target.id },
      select: { id: true, email: true, role: true, plan: true, credits: true },
    })
    return Response.json({ ok: true, user: updated })
  })
}
