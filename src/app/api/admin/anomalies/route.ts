import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { anomalyDetector } from "@/lib/security/anomaly-detector"

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    if (user.role !== "ADMIN") throw new ApiError(403, "Admin requis", "FORBIDDEN")
    const alerts = await db.anomalyAlert.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
    return Response.json({ ok: true, alerts })
  })
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    if (user.role !== "ADMIN") throw new ApiError(403, "Admin requis", "FORBIDDEN")
    await anomalyDetector.detect()
    return Response.json({ ok: true, triggered: true })
  })
}
