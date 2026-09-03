import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { audit } from "@/lib/engines/audit"

/** Marketplace : agents publiés par la communauté. */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const agents = await db.agent.findMany({
      where: { visibility: "MARKETPLACE", status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true, name: true, slug: true, description: true, category: true,
        stats: true, createdAt: true, userId: true,
        listing: { select: { id: true, price: true, purchases: true, description: true } },
      },
    })
     
    const ratings = await db.marketplaceReview.groupBy({
      by: ["agentId"],
      _avg: { rating: true },
      _count: { rating: true },
    })
    const ratingMap = new Map(ratings.map((r) => [r.agentId, { avg: r._avg.rating, count: r._count.rating }]))
    return Response.json({
      ok: true,
      agents: agents.map((a) => ({
        ...a,
        stats: a.stats ? JSON.parse(a.stats) : null,
        rating: ratingMap.get(a.id) ?? null,
        // v3.6 — mise en vente : prix en crédits + identifiant de listing.
        listing: a.listing
          ? { id: a.listing.id, price: a.listing.price, purchases: a.listing.purchases }
          : null,
      })),
    })
  })
}

const publishSchema = z.object({
  agentId: z.string().max(64),
  action: z.enum(["publish", "unpublish"]).default("publish"),
  /** v3.6 — prix de vente en crédits (0/absent = gratuit). Commission 20 %. */
  price: z.number().min(0).max(100_000).optional(),
  description: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, publishSchema)
    const agent = await db.agent.findFirst({ where: { id: body.agentId, userId: user.id } })
    if (!agent) throw new ApiError(404, "Agent introuvable.", "NOT_FOUND")

    if (body.action === "publish") {
      if (agent.status !== "PUBLISHED") {
        throw new ApiError(
          400,
          "Déployez d'abord l'agent (statut PUBLISHED) avant de le lister sur la marketplace.",
          "NOT_DEPLOYED"
        )
      }
      await db.agent.update({ where: { id: agent.id }, data: { visibility: "MARKETPLACE" } })

      // v3.6 — mise en vente : listing avec prix (commission plateforme 20 %).
      const price = body.price ?? 0
      const existing = await db.agentListing.findUnique({ where: { agentId: agent.id } })
      if (existing) {
        await db.agentListing.update({
          where: { id: existing.id },
          data: { price, ...(body.description !== undefined ? { description: body.description } : {}) },
        })
      } else if (price > 0 || body.description) {
        await db.agentListing.create({
          data: {
            agentId: agent.id,
            price,
            description: body.description ?? null,
            commission: 0.2,
          },
        })
      }
      await audit(req, {
        userId: user.id, action: "MARKETPLACE_PUBLISHED", entityType: "agent", entityId: agent.id,
        detail: { price: body.price ?? 0 },
      })
    } else {
      await db.agent.update({ where: { id: agent.id }, data: { visibility: "PRIVATE" } })
      await audit(req, { userId: user.id, action: "MARKETPLACE_UNPUBLISHED", entityType: "agent", entityId: agent.id })
    }
    return Response.json({ ok: true })
  })
}

const installSchema = z.object({ installAgentId: z.string().max(64) })

/** Installation : duplique un agent de la marketplace dans le compte de l'utilisateur. */
export async function PUT(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, installSchema)
    const source = await db.agent.findFirst({
      where: { id: body.installAgentId, visibility: "MARKETPLACE", status: "PUBLISHED" },
    })
    if (!source) throw new ApiError(404, "Agent de la marketplace introuvable.", "NOT_FOUND")

    let slug = `${source.slug}-fork`
    let suffix = 1
     
    while (true) {
      const exists = await db.agent.findUnique({ where: { slug }, select: { id: true } })
      if (!exists) break
      slug = `${source.slug}-fork-${suffix++}`
    }

    const fork = await db.agent.create({
      data: {
        userId: user.id,
        name: `${source.name} (installé)`,
        slug,
        description: source.description,
        systemPrompt: source.systemPrompt,
        provider: source.provider,
        model: source.model,
        temperature: source.temperature,
        maxTokens: source.maxTokens,
        category: source.category,
        config: source.config,
        stats: JSON.stringify({ runs: 0, success: 0, failed: 0, tokens: 0, credits: 0 }),
      },
    })
    await audit(req, { userId: user.id, action: "MARKETPLACE_INSTALLED", entityType: "agent", entityId: fork.id })
    return Response.json({ ok: true, agent: fork })
  })
}
