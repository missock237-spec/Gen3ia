import { NextRequest } from "next/server"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { fineTuneManager } from "@/lib/learning/finetune"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    const status = await fineTuneManager.getJobStatus(id, user.id)
    if (!status) throw new ApiError(404, "Job introuvable", "NOT_FOUND")
    return Response.json({ ok: true, job: status })
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id } = await params
    await fineTuneManager.cancelJob(id, user.id)
    return Response.json({ ok: true, cancelled: true })
  })
}
