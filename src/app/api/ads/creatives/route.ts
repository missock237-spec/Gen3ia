import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { audit } from "@/lib/engines/audit"

const creativeSchema = z.object({
  campaignId: z.string().min(1),
  headline: z.string().min(2).max(120),
  body: z.string().min(2).max(1000),
  mediaUrl: z.string().url().max(500).nullable().optional(),
  cta: z.string().max(40).nullable().optional(),
})

/** POST /api/ads/creatives — ajoute une création (annonce) à une campagne. */
export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const body = await readJson(req, creativeSchema)

    const campaign = await db.adCampaign.findFirst({
      where: { id: body.campaignId, userId: user.id },
    })
    if (!campaign) throw new ApiError(404, "Campagne introuvable.", "NOT_FOUND")

    const creative = await db.adCreative.create({
      data: {
        campaignId: campaign.id,
        headline: body.headline.trim(),
        body: body.body.trim(),
        mediaUrl: body.mediaUrl ?? null,
        cta: body.cta ?? null,
        status: "PENDING",
      },
    })
    await audit(req, {
      userId: user.id,
      action: "AD_CREATIVE_CREATED",
      entityType: "adCreative",
      entityId: creative.id,
      detail: { campaignId: campaign.id },
    })
    return jsonOk({ creative })
  })
}
