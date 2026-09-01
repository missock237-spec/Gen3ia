import { NextRequest } from "next/server"
import { handleRoute } from "@/lib/api"
import { optionalUser, getUserSettings } from "@/lib/auth/guards"
import { getProviderStatuses } from "@/lib/config"

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await optionalUser(req)
    if (!user) {
      return Response.json({ ok: true, user: null })
    }
    return Response.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        plan: user.plan,
        credits: user.credits,
        createdAt: user.createdAt,
        settings: getUserSettings(user),
      },
      providers: getProviderStatuses().map((p) => ({ key: p.key, name: p.name, available: p.available })),
    })
  })
}
