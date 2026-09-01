import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { uniqueSlug } from "@/lib/agents/chat"
import { TOOL_CATALOG } from "@/lib/tools/registry"
import { audit } from "@/lib/engines/audit"

const createSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().max(4000).optional(),
  provider: z.string().max(30).default("auto"),
  model: z.string().max(60).default("auto"),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(256).max(8192).default(4096),
  category: z.string().max(40).optional(),
  tools: z.array(z.string()).default([]),
})

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const agents = await db.agent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, slug: true, description: true, status: true, visibility: true,
        category: true, provider: true, model: true, temperature: true, maxTokens: true,
        config: true, stats: true, createdAt: true, updatedAt: true,
        _count: { select: { tasks: true } },
      },
    })
    return Response.json({ ok: true, agents })
  })
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, createSchema)

    const count = await db.agent.count({ where: { userId: user.id } })
    if (user.plan === "FREE" && count >= 5) {
      throw new ApiError(
        402,
        "Limite du plan gratuit atteinte (5 agents). Passez au plan Pro via la Facturation pour créer davantage d'agents.",
        "AGENT_LIMIT"
      )
    }

    const validTools = body.tools.filter((t) => TOOL_CATALOG.some((c) => c.key === t))
    const slug = await uniqueSlug(body.name)

    const agent = await db.agent.create({
      data: {
        userId: user.id,
        name: body.name.trim(),
        slug,
        description: body.description?.trim(),
        systemPrompt: body.systemPrompt?.trim(),
        provider: body.provider,
        model: body.model,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        category: body.category?.trim(),
        config: JSON.stringify({ tools: validTools }),
        stats: JSON.stringify({ runs: 0, success: 0, failed: 0, tokens: 0, credits: 0 }),
      },
    })
    await audit(req, {
      userId: user.id, action: "AGENT_CREATED", entityType: "agent", entityId: agent.id,
    })
    return Response.json({ ok: true, agent })
  })
}
