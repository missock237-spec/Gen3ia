import { NextRequest } from "next/server"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { getBatchStatus, executeBatch } from "@/lib/tasks/batch"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const status = await getBatchStatus(id, user.id)
    if (!status) throw new ApiError(404, "Batch introuvable", "NOT_FOUND")
    return Response.json({ ok: true, batch: status })
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const result = await executeBatch(id, user.id)
    return Response.json({ ok: true, result })
  })
}
