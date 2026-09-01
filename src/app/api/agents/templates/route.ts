import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { uniqueSlug } from "@/lib/agents/chat"
import { AGENT_TEMPLATES, findTemplate } from "@/lib/agents/templates"
import { audit } from "@/lib/engines/audit"

/**
 * Templates d'agents (amélioration « one-click deploy »).
 * GET  : catalogue des profils pré-configurés.
 * POST : instancie un template en agent privé (personnalisable ensuite).
 */

export async function GET() {
  return handleRoute(async () => {
    return Response.json({
      ok: true,
      templates: AGENT_TEMPLATES.map((t) => ({
        key: t.key,
        name: t.name,
        category: t.category,
        description: t.description,
        tools: t.tools,
        temperature: t.temperature,
        tags: t.tags,
        systemPromptPreview: t.systemPrompt.slice(0, 280),
      })),
    })
  })
}

const instantiateSchema = z.object({
  templateKey: z.string().min(2).max(60),
  /** Personnalisations optionnelles au moment de l'instanciation. */
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
  temperature: z.number().min(0).max(2).optional(),
})

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async () => {
      const user = await requireUser(req)
      const body = await readJson(req, instantiateSchema)

      const template = findTemplate(body.templateKey)
      if (!template) {
        throw new ApiError(404, "Template introuvable.", "NOT_FOUND")
      }

      const count = await db.agent.count({ where: { userId: user.id } })
      if (user.plan === "FREE" && count >= 5) {
        throw new ApiError(
          402,
          "Limite du plan gratuit atteinte (5 agents). Passez au plan Pro via la Facturation pour créer davantage d'agents.",
          "AGENT_LIMIT"
        )
      }

      const name = (body.name ?? template.name).trim()
      const slug = await uniqueSlug(name)
      const agent = await db.agent.create({
        data: {
          userId: user.id,
          name,
          slug,
          description: (body.description ?? template.description).trim(),
          systemPrompt: template.systemPrompt,
          provider: "auto",
          model: "auto",
          temperature: body.temperature ?? template.temperature,
          maxTokens: 4096,
          category: template.category,
          tags: JSON.stringify(template.tags),
          config: JSON.stringify({ tools: template.tools, fromTemplate: template.key }),
          stats: JSON.stringify({ runs: 0, success: 0, failed: 0, tokens: 0, credits: 0 }),
        },
      })
      await audit(req, {
        userId: user.id,
        action: "AGENT_CREATED_FROM_TEMPLATE",
        entityType: "agent",
        entityId: agent.id,
        detail: { template: template.key },
      })
      return Response.json({ ok: true, agent })
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}
