import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"

const watchSchema = z.object({
  name: z.string(),
  type: z.enum(["PRICE", "WEBSITE", "INDICATOR", "CUSTOM"]),
  target: z.string(),
  schedule: z.string(), // expression CRON
  condition: z.record(z.unknown()).optional(),
  alertChannel: z.enum(["email", "slack", "webhook"]).default("email"),
  alertTarget: z.string().optional(),
})

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, watchSchema)
    const watch = await db.watchConfig.create({
      data: {
        userId: user.id,
        name: body.name,
        type: body.type,
        target: body.target,
        schedule: body.schedule,
        condition: body.condition ? JSON.stringify(body.condition) : null,
        alertChannel: body.alertChannel,
        alertTarget: body.alertTarget,
      },
    })
    return Response.json({ ok: true, watchId: watch.id })
  })
}

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const watches = await db.watchConfig.findMany({ where: { userId: user.id }, include: { executions: { take: 5, orderBy: { executedAt: "desc" } } } })
    return Response.json({ ok: true, watches })
  })
}
