import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { generateApiKey } from "@/lib/sdk/keys"
import { listParams, paginate } from "@/lib/api-pagination"
import { audit } from "@/lib/engines/audit"

const createSchema = z.object({
  name: z.string().min(2).max(60).default("Ma clé"),
  agentId: z.string().max(64).nullable().optional(),
  scopes: z.string().max(100).default("chat,task"),
})

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { limit, cursor } = listParams(new URL(req.url).searchParams, 50, 100)
    const rows = await db.apiKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, name: true, prefix: true, scopes: true, requests: true, revoked: true,
        lastUsedAt: true, createdAt: true, agentId: true,
      },
    })
    const { page, nextCursor } = paginate(rows, limit)
    return Response.json({ ok: true, keys: page, nextCursor })
  })
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, createSchema)

    const active = await db.apiKey.count({ where: { userId: user.id, revoked: false } })
    if (active >= 10) {
      throw new ApiError(402, "Limite de 10 clés actives atteinte. Révoquez une clé existante.", "KEY_LIMIT")
    }

    if (body.agentId) {
      const agent = await db.agent.findFirst({ where: { id: body.agentId, userId: user.id } })
      if (!agent) throw new ApiError(404, "Agent introuvable.", "NOT_FOUND")
    }

    const generated = generateApiKey()
    const key = await db.apiKey.create({
      data: {
        userId: user.id,
        agentId: body.agentId ?? null,
        name: body.name,
        prefix: generated.prefix,
        keyHash: generated.keyHash,
        scopes: body.scopes,
      },
    })
    await audit(req, { userId: user.id, action: "APIKEY_CREATED", entityType: "apikey", entityId: key.id })
    // Le secret n'est JAMAIS stocké en clair : visible une seule fois ici.
    return Response.json({
      ok: true,
      key: { id: key.id, name: key.name, prefix: key.prefix, scopes: key.scopes, createdAt: key.createdAt },
      secret: generated.secret,
    })
  })
}
