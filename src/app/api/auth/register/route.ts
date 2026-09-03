import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, getClientIp, ApiError } from "@/lib/api"
import { hashPassword } from "@/lib/auth/password"
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session"
import { grantCredits } from "@/lib/credits/ledger"
import { audit } from "@/lib/engines/audit"
import { SIGNUP_BONUS_CREDITS } from "@/lib/config"

const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
})

export async function POST(req: NextRequest) {
  // v3.1 : rate limiting IP — 5 créations de compte/heure (anti-abus).
  return handleRoute(
    req,
    async () => {
    const body = await readJson(req, registerSchema)
    const email = body.email.toLowerCase().trim()

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      throw new ApiError(409, "Un compte existe déjà avec cet e-mail. Connectez-vous.", "EMAIL_TAKEN")
    }

    // Le premier compte créé devient ADMIN (déploiement vierge) UNIQUEMENT
    // hors production ou quand ADMIN_EMAILS est défini — en production
    // serverless (instances jetables), le bootstrap-auto exposerait le
    // premier inscrit inconnu : liste explicite obligatoire.
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
    const userCount = await db.user.count()
    const allowBootstrap = process.env.NODE_ENV !== "production" || adminEmails.length > 0
    const role = adminEmails.includes(email) || (userCount === 0 && allowBootstrap) ? "ADMIN" : "USER"

    const user = await db.user.create({
      data: {
        email,
        name: body.name.trim(),
        passwordHash: hashPassword(body.password),
        role,
        credits: 0,
      },
      select: { id: true, email: true, name: true, role: true },
    })

    // Bonus de bienvenue via le Credit Ledger (jamais de crédit direct).
    await grantCredits(user.id, SIGNUP_BONUS_CREDITS, {
      type: "BONUS",
      description: "Bonus de bienvenue GEN3IA",
    })

    const token = await createSession(user.id, {
      userAgent: req.headers.get("user-agent"),
      ip: getClientIp(req),
    })
    await audit(req, {
      userId: user.id,
      action: "USER_REGISTERED",
      entityType: "user",
      entityId: user.id,
      detail: { role },
    })

    const res = NextResponse.json({ ok: true, user: { ...user, credits: SIGNUP_BONUS_CREDITS } })
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
      return res
    },
    { rateLimit: { policy: "register", identify: "ip" } }
  )
}
