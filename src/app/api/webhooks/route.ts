import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { createWebhook, PIPELINE_EVENTS } from "@/lib/webhooks/outbound"
import { generateKey } from "@/lib/security/encryption"

const webhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(PIPELINE_EVENTS)).min(1),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, webhookSchema)
    const secret = generateKey()
    const webhookId = await createWebhook({
      userId: user.id,
      url: body.url,
      events: body.events,
      secret,
      agentId: body.agentId,
      taskId: body.taskId,
    })
    return Response.json({ ok: true, webhookId, secret })
  })
}

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const webhooks = await db.webhookConfig.findMany({
      where: { userId: user.id },
      include: { deliveries: { take: 5, orderBy: { createdAt: "desc" } } },
    })
    return Response.json({ ok: true, webhooks })
  })
}
