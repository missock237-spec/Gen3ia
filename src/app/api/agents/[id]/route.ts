import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { TOOL_CATALOG } from "@/lib/tools/registry"
import { audit } from "@/lib/engines/audit"

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  systemPrompt: z.string().max(4000).nullable().optional(),
  provider: z.string().max(30).optional(),
  model: z.string().max(60).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(256).max(8192).optional(),
  category: z.string().max(40).nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "PAUSED", "ARCHIVED"]).optional(),
  visibility: z.enum(["PRIVATE", "MARKETPLACE"]).optional(),
  tools: z.array(z.string()).optional(),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const agent = await db.agent.findFirst({
      where: { id, userId: user.id },
      include: { _count: { select: { tasks: true, reviews: true } } },
    })
    if (!agent) throw new ApiError(404, "Agent introuvable.", "NOT_FOUND")
    return Response.json({ ok: true, agent })
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const body = await readJson(req, patchSchema)
    const agent = await db.agent.findFirst({ where: { id, userId: user.id } })
    if (!agent) throw new ApiError(404, "Agent introuvable.", "NOT_FOUND")

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name.trim()
    if (body.description !== undefined) data.description = body.description
    if (body.systemPrompt !== undefined) data.systemPrompt = body.systemPrompt
    if (body.provider !== undefined) data.provider = body.provider
    if (body.model !== undefined) data.model = body.model
    if (body.temperature !== undefined) data.temperature = body.temperature
    if (body.maxTokens !== undefined) data.maxTokens = body.maxTokens
    if (body.category !== undefined) data.category = body.category
    if (body.status !== undefined) data.status = body.status
    if (body.visibility !== undefined) data.visibility = body.visibility
    if (body.tools !== undefined) {
      const validTools = body.tools.filter((t) => TOOL_CATALOG.some((c) => c.key === t))
      const config = agent.config ? JSON.parse(agent.config) : {}
      data.config = JSON.stringify({ ...config, tools: validTools })
    }

    const updated = await db.agent.update({ where: { id: agent.id }, data })
    await audit(req, {
      userId: user.id, action: "AGENT_UPDATED", entityType: "agent", entityId: agent.id,
      detail: { fields: Object.keys(data) },
    })
    return Response.json({ ok: true, agent: updated })
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const agent = await db.agent.findFirst({ where: { id, userId: user.id } })
    if (!agent) throw new ApiError(404, "Agent introuvable.", "NOT_FOUND")
    await db.agent.update({ where: { id: agent.id }, data: { status: "ARCHIVED", visibility: "PRIVATE" } })
    await audit(req, { userId: user.id, action: "AGENT_ARCHIVED", entityType: "agent", entityId: agent.id })
    return Response.json({ ok: true })
  })
}
