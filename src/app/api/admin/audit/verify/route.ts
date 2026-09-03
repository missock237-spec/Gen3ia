import { NextRequest } from "next/server"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { verifyChain } from "@/lib/security/audit-chain"

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    if (user.role !== "ADMIN") throw new ApiError(403, "Admin requis", "FORBIDDEN")
    const result = await verifyChain()
    return Response.json({ ok: true, ...result })
  })
}
