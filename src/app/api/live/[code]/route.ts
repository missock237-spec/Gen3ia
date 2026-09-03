import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { db } from "@/lib/db"

const joinSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
})

/**
 * GET /api/live/[code] — informations publiques de la session
 * (statut, hôte, nombre de spectateurs) + heartbeat participant.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const { code } = await params

    const session = await db.liveSession.findUnique({
      where: { code },
      include: {
        host: { select: { id: true, name: true, email: true } },
        participants: {
          where: { leftAt: null },
          select: { id: true, displayName: true, role: true, lastSeenAt: true },
          orderBy: { joinedAt: "asc" },
        },
      },
    })
    if (!session) throw new ApiError(404, "Session live introuvable — vérifiez le code.", "LIVE_NOT_FOUND")

    // Heartbeat du participant courant ( présence maintenue vivante ).
    await db.liveParticipant.updateMany({
      where: { sessionId: session.id, userId: user.id },
      data: { lastSeenAt: new Date() },
    })

    const me = session.participants.find((p) => p.role === "HOST" && session.host.id === user.id) ?? null
    return jsonOk({
      session: {
        id: session.id,
        code: session.code,
        title: session.title,
        taskId: session.taskId,
        status: session.status,
        viewerCount: session.viewerCount,
        createdAt: session.createdAt,
        host: {
          name: session.host.name ?? session.host.email,
          isMe: session.host.id === user.id,
        },
        participants: session.participants.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          role: p.role,
          lastSeenAt: p.lastSeenAt,
        })),
        me: me ? { id: me.id, role: "HOST" } : null,
      },
    })
  })
}

/**
 * POST /api/live/[code] — rejoindre la session en tant que spectateur.
 * Envoie un signal VIEWER_JOINED à l'hôte (déclenche l'offre WebRTC).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const { code } = await params
    const body = await req.json().catch(() => ({} as z.infer<typeof joinSchema>))
    const displayName = (body.displayName ?? user.name ?? user.email.split("@")[0]).slice(0, 80)

    const session = await db.liveSession.findUnique({
      where: { code },
      include: { participants: { where: { userId: user.id } } },
    })
    if (!session) throw new ApiError(404, "Session live introuvable.", "LIVE_NOT_FOUND")
    if (session.status !== "LIVE") throw new ApiError(410, "Cette session est terminée.", "LIVE_ENDED")

    // L'hôte rejoint sa propre session → simple rafraîchissement.
    if (session.hostId === user.id) {
      const host = session.participants.find((p) => p.role === "HOST")
      return jsonOk({ role: "HOST", participantId: host?.id ?? null, sessionId: session.id })
    }

    // Déjà participant ? → réactive sa présence.
    const existing = session.participants.find((p) => p.role === "VIEWER")
    if (existing) {
      await db.liveParticipant.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), leftAt: null },
      })
      return jsonOk({ role: "VIEWER", participantId: existing.id, sessionId: session.id })
    }

    const participant = await db.liveParticipant.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        displayName,
        role: "VIEWER",
      },
    })
    await db.liveSession.update({
      where: { id: session.id },
      data: { viewerCount: { increment: 1 } },
    })

    // Signale l'arrivée à l'hôte → il créera l'offre WebRTC.
    const hostParticipant = await db.liveParticipant.findFirst({
      where: { sessionId: session.id, role: "HOST" },
    })
    if (hostParticipant) {
      await db.liveSignal.create({
        data: {
          sessionId: session.id,
          fromId: participant.id,
          toId: hostParticipant.id,
          type: "VIEWER_JOINED",
          payload: JSON.stringify({ participantId: participant.id, displayName }),
        },
      })
    }

    return jsonOk({ role: "VIEWER", participantId: participant.id, sessionId: session.id })
  })
}

/**
 * DELETE /api/live/[code] — l'hôte termine la session (ou le spectateur la quitte).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const { code } = await params
    const session = await db.liveSession.findUnique({ where: { code } })
    if (!session) throw new ApiError(404, "Session introuvable.", "LIVE_NOT_FOUND")

    if (session.hostId === user.id) {
      // Fin de session : signale BYE à tous puis clôture.
      const active = await db.liveParticipant.findMany({ where: { sessionId: session.id, leftAt: null } })
      for (const p of active) {
        if (p.role === "VIEWER") {
          await db.liveSignal.create({
            data: {
              sessionId: session.id,
              fromId: p.id,
              type: "BYE",
              payload: JSON.stringify({ reason: "HOST_ENDED" }),
            },
          })
        }
      }
      await db.liveSession.update({
        where: { id: session.id },
        data: { status: "ENDED", endedAt: new Date() },
      })
      return jsonOk({ ended: true })
    }

    // Spectateur : départ propre.
    const participant = await db.liveParticipant.findFirst({
      where: { sessionId: session.id, userId: user.id, role: "VIEWER" },
    })
    if (participant) {
      await db.liveParticipant.update({
        where: { id: participant.id },
        data: { leftAt: new Date() },
      })
      await db.liveSession.update({
        where: { id: session.id },
        data: { viewerCount: { decrement: 1 } },
      })
      const host = await db.liveParticipant.findFirst({
        where: { sessionId: session.id, role: "HOST" },
      })
      if (host) {
        await db.liveSignal.create({
          data: {
            sessionId: session.id,
            fromId: participant.id,
            toId: host.id,
            type: "VIEWER_LEFT",
            payload: JSON.stringify({ participantId: participant.id }),
          },
        })
      }
    }
    return jsonOk({ left: true })
  })
}
