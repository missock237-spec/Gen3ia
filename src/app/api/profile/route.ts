import { NextRequest } from "next/server"
import { handleRoute } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { userProfileEvolver } from "@/lib/learning/user-profile"

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const profile = await userProfileEvolver.getProfile(user.id)
    return Response.json({ ok: true, profile })
  })
}

export async function PUT(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    await userProfileEvolver.evolve(user.id)
    const profile = await userProfileEvolver.getProfile(user.id)
    return Response.json({ ok: true, profile })
  })
}
