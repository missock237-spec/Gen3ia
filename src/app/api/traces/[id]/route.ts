import { NextRequest } from "next/server"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { tracer } from "@/lib/observability/tracing"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id: traceId } = await params
    const trace = await tracer.getTrace(traceId)
    if (!trace) throw new ApiError(404, "Trace introuvable", "NOT_FOUND")
    return Response.json({ ok: true, trace })
  })
}
