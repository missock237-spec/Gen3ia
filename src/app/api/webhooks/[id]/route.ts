import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const webhook = await db.webhookConfig.findFirst({ where: { id, userId: user.id } })
    if (!webhook) throw new ApiError(404, "Webhook introuvable", "NOT_FOUND")
    return Response.json({ ok: true, webhook })
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const body = await req.json()
    await db.webhookConfig.updateMany({ where: { id, userId: user.id }, data: { active: body.active ?? true } })
    return Response.json({ ok: true })
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    await db.webhookConfig.deleteMany({ where: { id, userId: user.id } })
    return Response.json({ ok: true, deleted: true })
  })
}
