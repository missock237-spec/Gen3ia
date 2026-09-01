import { NextRequest, NextResponse } from "next/server"
import { handleRoute } from "@/lib/api"
import { SESSION_COOKIE, destroySession } from "@/lib/auth/session"

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const token = req.cookies.get(SESSION_COOKIE)?.value
    if (token) await destroySession(token)
    const res = NextResponse.json({ ok: true })
    res.cookies.delete(SESSION_COOKIE)
    return res
  })
}
