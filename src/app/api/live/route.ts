import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { db } from "@/lib/db"
import { randomBytes } from "crypto"
import { audit } from "@/lib/engines/audit"

const createSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  taskId: z.string().optional(),
})

/** Code de session court et lisible (type 7XK-Q2M). */
function sessionCode(): string {
  const raw = randomBytes(4).toString("hex").toUpperCase()
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`
}

/**
 * POST /api/live — l'hôte crée une session de partage en direct.
 * Retourne le code à partager (lien d'invitation).
 */
export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const body = await req.json().then((b) => createSchema.parse(b)).catch(() => ({} as z.infer<typeof createSchema>))

    // Une seule session LIVE active par hôte.
    const existing = await db.liveSession.findFirst({
      where: { hostId: user.id, status: "LIVE" },
    })
    if (existing) {
      return jsonOk({ session: existing, alreadyLive: true })
    }

    let code = sessionCode()
    // Collision improbable mais gérée (réessai).
    for (let i = 0; i < 3; i++) {
      const clash = await db.liveSession.findUnique({ where: { code } })
      if (!clash) break
      code = sessionCode()
    }

    const session = await db.liveSession.create({
      data: {
        code,
        hostId: user.id,
        taskId: body.taskId ?? null,
        title: body.title ?? null,
        status: "LIVE",
        participants: {
          create: {
            userId: user.id,
            displayName: user.name ?? user.email.split("@")[0],
            role: "HOST",
          },
        },
      },
      include: { participants: true },
    })

    await audit(req, {
      userId: user.id,
      action: "LIVE_SESSION_CREATED",
      entityType: "live_session",
      entityId: session.id,
      detail: { code: session.code },
    })

    return jsonOk({ session: { id: session.id, code: session.code, title: session.title, taskId: session.taskId, status: session.status } })
  })
}

/**
 * GET /api/live — sessions de l'utilisateur (hôtes + participations).
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const hosted = await db.liveSession.findMany({
      where: { hostId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { participants: { select: { id: true, displayName: true, role: true, lastSeenAt: true } } },
    })
    const joined = await db.liveParticipant.findMany({
      where: { userId: user.id, role: "VIEWER" },
      orderBy: { joinedAt: "desc" },
      take: 20,
      include: { session: { include: { host: { select: { name: true, email: true } } } } },
    })
    return jsonOk({
      hosted: hosted.map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        taskId: s.taskId,
        status: s.status,
        viewerCount: s.viewerCount,
        participants: s.participants,
        createdAt: s.createdAt,
      })),
      joined: joined.map((p) => ({
        participantId: p.id,
        sessionId: p.sessionId,
        code: p.session.code,
        title: p.session.title,
        status: p.session.status,
        host: p.session.host.name ?? p.session.host.email,
        joinedAt: p.joinedAt,
      })),
    })
  })
}
