import crypto from "crypto"
import { db } from "@/lib/db"
import type { User } from "@prisma/client"

/**
 * Sessions serveur : cookie httpOnly + enregistrement en base
 * (révocable, expiration 30 jours).
 */

export const SESSION_COOKIE = "g3ia_session"
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface SessionInfo {
  user: User
  sessionId: string
}

export async function createSession(
  userId: string,
  meta?: { userAgent?: string | null; ip?: string | null }
): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex")
  await db.session.create({
    data: {
      token,
      userId,
      userAgent: meta?.userAgent ?? null,
      ip: meta?.ip ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })
  return token
}

export async function getSessionUser(token: string | undefined | null): Promise<User | null> {
  if (!token) return null
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }
  return session.user
}

export async function destroySession(token: string): Promise<void> {
  await db.session.deleteMany({ where: { token } })
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  }
}
