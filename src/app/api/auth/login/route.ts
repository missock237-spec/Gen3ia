import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, getClientIp, ApiError } from "@/lib/api"
import { verifyPassword } from "@/lib/auth/password"
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session"
import { audit } from "@/lib/engines/audit"

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(128),
})

export async function POST(req: NextRequest) {
  // v3.1 : rate limiting IP — 10 tentatives/minute (anti force-brute).
  return handleRoute(
    req,
    async () => {
      const body = await readJson(req, loginSchema)
      const email = body.email.toLowerCase().trim()

      const user = await db.user.findUnique({ where: { email } })
      if (!user || !user.passwordHash || !verifyPassword(body.password, user.passwordHash)) {
        await audit(req, { action: "LOGIN_FAILED", entityType: "user", detail: { email } })
        throw new ApiError(401, "E-mail ou mot de passe incorrect.", "BAD_CREDENTIALS")
      }

      const token = await createSession(user.id, {
        userAgent: req.headers.get("user-agent"),
        ip: getClientIp(req),
      })
      await audit(req, { userId: user.id, action: "LOGIN", entityType: "user", entityId: user.id })

      const res = NextResponse.json({
        ok: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, credits: user.credits },
      })
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
      return res
    },
    { rateLimit: { policy: "auth", identify: "ip" } }
  )
}
