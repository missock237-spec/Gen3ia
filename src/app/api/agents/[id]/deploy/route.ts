import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { generateApiKey } from "@/lib/sdk/keys"
import { getAppUrl } from "@/lib/config"
import { audit } from "@/lib/engines/audit"

const deploySchema = z.object({
  generateKey: z.boolean().default(true),
  keyName: z.string().max(60).default("Clé de production"),
})

/**
 * Déploiement d'agent — publie l'agent : endpoint public /api/v1/chat,
 * clé API dédiée (visible une seule fois) et SDK prêts à l'emploi.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const body = await readJson(req, deploySchema)

    const agent = await db.agent.findFirst({ where: { id, userId: user.id } })
    if (!agent) throw new ApiError(404, "Agent introuvable.", "NOT_FOUND")
    if (!agent.systemPrompt) {
      throw new ApiError(
        400,
        "Définissez un prompt système avant de déployer : un agent déployé doit avoir une identité et des instructions claires.",
        "NO_SYSTEM_PROMPT"
      )
    }

    const published = await db.agent.update({
      where: { id: agent.id },
      data: { status: "PUBLISHED" },
    })

    let apiKey: { secret: string; prefix: string } | null = null
    if (body.generateKey) {
      const generated = generateApiKey()
      await db.apiKey.create({
        data: {
          userId: user.id,
          agentId: agent.id,
          name: body.keyName,
          prefix: generated.prefix,
          keyHash: generated.keyHash,
          scopes: "chat,task",
        },
      })
      apiKey = { secret: generated.secret, prefix: generated.prefix }
      await audit(req, {
        userId: user.id, action: "APIKEY_CREATED", entityType: "agent", entityId: agent.id,
      })
    }

    await audit(req, {
      userId: user.id, action: "AGENT_DEPLOYED", entityType: "agent", entityId: agent.id,
    })

    const base = getAppUrl()
    return Response.json({
      ok: true,
      agent: { id: published.id, name: published.name, slug: published.slug, status: published.status },
      endpoint: `${base}/api/v1`,
      apiKey,
      docs: {
        chat: `POST ${base}/api/v1/chat`,
        task: `POST ${base}/api/v1/task`,
        curl: `curl -X POST ${base}/api/v1/chat -H "Authorization: Bearer ${apiKey ? apiKey.secret : "g3ia_live_..."}" -H "Content-Type: application/json" -d '{"message":"Bonjour","agent_slug":"${published.slug}"}'`,
      },
    })
  })
}
