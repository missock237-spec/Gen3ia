import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { debitAdWallet, AD_RECHARGE_MIN_FCFA } from "@/lib/ads/ledger"
import { audit } from "@/lib/engines/audit"

const updateSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"]).optional(),
  budgetPerDay: z.number().min(0).max(10_000_000).optional(),
  name: z.string().min(2).max(120).optional(),
  targetUrl: z.string().url().max(500).nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
})

/**
 * PATCH /api/ads/campaigns/[id] — met à jour une campagne.
 * L'activation exige un budget journalier > 0 et crédite le premier
 * jour de budget immédiatement (débit du portefeuille publicitaire).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const { id } = await params
    const body = await readJson(req, updateSchema)

    const campaign = await db.adCampaign.findFirst({ where: { id, userId: user.id } })
    if (!campaign) throw new ApiError(404, "Campagne introuvable.", "NOT_FOUND")

    // Activation : budget requis + premier jour débité immédiatement.
    if (body.status === "ACTIVE" && campaign.status !== "ACTIVE") {
      const budget = body.budgetPerDay ?? campaign.budgetPerDay
      if (budget <= 0) {
        throw new ApiError(
          400,
          "Impossible d'activer une campagne sans budget journalier (> 0 FCFA).",
          "AD_NO_BUDGET"
        )
      }
      await debitAdWallet(user.id, budget, {
        type: "SPEND",
        description: `Budget campagne « ${body.name ?? campaign.name} » — 1er jour`,
        campaignId: campaign.id,
      })
      const updated = await db.adCampaign.update({
        where: { id: campaign.id },
        data: {
          ...body,
          startDate: campaign.startDate ?? new Date(),
          lastChargeAt: new Date(),
          totalSpent: { increment: budget },
        },
      })
      await audit(req, {
        userId: user.id,
        action: "AD_CAMPAIGN_ACTIVATED",
        entityType: "adCampaign",
        entityId: campaign.id,
        detail: { firstDayDebit: budget },
      })
      return jsonOk({ campaign: updated })
    }

    const updated = await db.adCampaign.update({ where: { id: campaign.id }, data: body })
    await audit(req, {
      userId: user.id,
      action: "AD_CAMPAIGN_UPDATED",
      entityType: "adCampaign",
      entityId: campaign.id,
      detail: { fields: Object.keys(body) },
    })
    return jsonOk({ campaign: updated })
  })
}

/** DELETE /api/ads/campaigns/[id] — supprime campagne + créas (cascade). */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const { id } = await params
    const campaign = await db.adCampaign.findFirst({ where: { id, userId: user.id } })
    if (!campaign) throw new ApiError(404, "Campagne introuvable.", "NOT_FOUND")
    await db.adCampaign.delete({ where: { id: campaign.id } })
    await audit(req, {
      userId: user.id,
      action: "AD_CAMPAIGN_DELETED",
      entityType: "adCampaign",
      entityId: campaign.id,
    })
    return jsonOk({ deleted: true, refundHint: campaign.totalSpent > 0 ? AD_RECHARGE_MIN_FCFA : undefined })
  })
}
