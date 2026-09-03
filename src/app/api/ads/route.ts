import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { adsOverview } from "@/lib/ads/ledger"
import { audit } from "@/lib/engines/audit"

/** Plateformes publicitaires connectables depuis la page /ads. */
export const AD_PLATFORMS = ["googleads", "metaads", "tiktok", "linkedin_ads"] as const

const campaignSchema = z.object({
  name: z.string().min(2).max(120),
  platform: z.enum(["googleads", "metaads", "tiktok", "linkedin_ads", "other"]),
  objective: z.enum(["AWARENESS", "TRAFFIC", "CONVERSION", "LEADS"]).default("TRAFFIC"),
  budgetPerDay: z.number().min(0).max(10_000_000),
  targetUrl: z.string().url().max(500).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
})

/**
 * GET /api/ads — vue complète de la page Publicités :
 * solde du portefeuille, historique, campagnes + créas, et comptes
 * publicitaires liés (Google Ads, Meta Ads, TikTok, LinkedIn Ads —
 * connexions OAuth de l'utilisateur via le moteur de connecteurs).
 * Règle au passage les budgets de campagnes dus (settlement paresseux).
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const overview = await adsOverview(user.id)
    const connections = await db.connectedAccount.findMany({
      where: { userId: user.id, appSlug: { in: [...AD_PLATFORMS] } },
      select: { appSlug: true, status: true, meta: true, lastError: true, updatedAt: true },
    })
    const accounts = AD_PLATFORMS.map((slug) => {
      const conn = connections.find((c) => c.appSlug === slug)
      let accountHint: string | null = null
      if (conn?.meta) {
        try {
          accountHint = (JSON.parse(conn.meta) as { accountHint?: string }).accountHint ?? null
        } catch {
          accountHint = null
        }
      }
      return {
        slug,
        connected: conn?.status === "ACTIVE",
        status: conn?.status ?? null,
        accountHint,
        lastError: conn?.lastError ?? null,
        updatedAt: conn?.updatedAt ?? null,
      }
    })
    return jsonOk({ ...overview, accounts })
  })
}

/** POST /api/ads — crée une campagne publicitaire (statut DRAFT). */
export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const body = await readJson(req, campaignSchema)

    const campaign = await db.adCampaign.create({
      data: {
        userId: user.id,
        name: body.name.trim(),
        platform: body.platform,
        objective: body.objective,
        budgetPerDay: body.budgetPerDay,
        targetUrl: body.targetUrl ?? null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        status: "DRAFT",
      },
    })
    await audit(req, {
      userId: user.id,
      action: "AD_CAMPAIGN_CREATED",
      entityType: "adCampaign",
      entityId: campaign.id,
      detail: { platform: body.platform, budgetPerDay: body.budgetPerDay },
    })
    return jsonOk({ campaign })
  })
}
