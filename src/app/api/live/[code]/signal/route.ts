import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { db } from "@/lib/db"

const sendSchema = z.object({
  /** ID du participant émetteur (vérifié côté serveur). */
  fromId: z.string().min(1),
  /** Destinataire (null = diffusion). */
  toId: z.string().nullable().optional(),
  type: z.enum(["OFFER", "ANSWER", "ICE", "BYE", "CHAT", "TASK"]),
  payload: z.record(z.string(), z.unknown()),
})

const POLL_WINDOW_MS = 20_000 // attente max en long-poll
const POLL_INTERVAL_MS = 1_000 // vérification de nouvelles boucles

/**
 * GET /api/live/[code]/signal?since=<ISO>&participant=<id>
 * Long-poll (≤20 s) des messages de signalisation destinés au participant.
 * Le flux média, lui, voyage en P2P chiffré (DTLS/SRTP) — jamais ici.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const { code } = await params
    const url = new URL(req.url)
    const sinceParam = url.searchParams.get("since")
    const participantId = url.searchParams.get("participant")

    const session = await db.liveSession.findUnique({ where: { code } })
    if (!session) throw new ApiError(404, "Session live introuvable.", "LIVE_NOT_FOUND")

    // Identité du participant courant (participant OU hôte).
    let me = participantId
      ? await db.liveParticipant.findFirst({ where: { id: participantId, sessionId: session.id } })
      : null
    if (!me) {
      me = await db.liveParticipant.findFirst({
        where: { sessionId: session.id, userId: user.id },
      })
    }
    if (!me) throw new ApiError(403, "Rejoignez la session avant de lire les signaux.", "LIVE_NOT_PARTICIPANT")

    const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - POLL_WINDOW_MS)

    // Long-poll : boucle jusqu'à nouvelles données ou expiration.
    const deadline = Date.now() + POLL_WINDOW_MS
    while (Date.now() < deadline) {
      // Signaux qui me sont destinés (toId = moi) ou diffusés (toId null),
      // émis par d'autres participants, non consommés, récents.
      const signals = await db.liveSignal.findMany({
        where: {
          sessionId: session.id,
          createdAt: { gt: since },
          NOT: { fromId: me.id },
          OR: [{ toId: me.id }, { toId: null }],
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      })
      // Marque ma présence (watchdog de session côté serveur).
      await db.liveParticipant.update({
        where: { id: me.id },
        data: { lastSeenAt: new Date() },
      })

      if (signals.length > 0) {
        await db.liveSignal.updateMany({
          where: { id: { in: signals.map((s) => s.id) }, toId: me.id },
          data: { consumedAt: new Date() },
        })
        return jsonOk({
          signals: signals.map((s) => ({
            id: s.id,
            fromId: s.fromId,
            type: s.type,
            payload: JSON.parse(s.payload),
            createdAt: s.createdAt.toISOString(),
          })),
          now: new Date().toISOString(),
          sessionStatus: session.status,
        })
      }

      // Session terminée pendant l'attente ?
      const current = await db.liveSession.findUnique({
        where: { code },
        select: { status: true },
      })
      if (current?.status !== "LIVE") {
        return jsonOk({ signals: [], now: new Date().toISOString(), sessionStatus: "ENDED" })
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }

    return jsonOk({ signals: [], now: new Date().toISOString(), sessionStatus: session.status })
  })
}

/**
 * POST /api/live/[code]/signal — publie un message de signalisation
 * (offre SDP, réponse, candidat ICE, chat) vers un pair ou en diffusion.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const { code } = await params
    const body = sendSchema.parse(await req.json())

    const session = await db.liveSession.findUnique({ where: { code } })
    if (!session) throw new ApiError(404, "Session live introuvable.", "LIVE_NOT_FOUND")

    const sender = await db.liveParticipant.findFirst({
      where: { id: body.fromId, sessionId: session.id },
    })
    if (!sender) throw new ApiError(403, "Participant émetteur inconnu sur cette session.", "LIVE_INVALID_SENDER")
    // Le participant doit appartenir à l'utilisateur courant (anti-usurpation).
    if (sender.userId && sender.userId !== user.id && sender.role !== "HOST") {
      throw new ApiError(403, "Usurpation de participant refusée.", "LIVE_FORBIDDEN")
    }

    await db.liveSignal.create({
      data: {
        sessionId: session.id,
        fromId: sender.id,
        toId: body.toId ?? null,
        type: body.type,
        payload: JSON.stringify(body.payload),
      },
    })

    return jsonOk({ sent: true })
  })
}
