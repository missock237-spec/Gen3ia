import { NextRequest } from "next/server"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { listSessionCommands, closeTerminalSession } from "@/lib/tools/terminal"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/terminal/sessions/[id] — historique complet d'une session
 * (lecture seule : commandes, sorties, codes de retour, durées).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const { id } = await params
    const commands = await listSessionCommands(user.id, id)
    if (commands.length === 0) {
      // Session inconnue OU aucune commande : vérifions l'existence.
      const sessions = await import("@/lib/tools/terminal").then((m) =>
        m.listTerminalSessions(user.id)
      )
      const exists = sessions.some((s) => s.id === id)
      if (!exists) throw new ApiError(404, "Session terminal introuvable.")
    }
    return jsonOk({ sessionId: id, commands })
  })
}

/**
 * PATCH /api/terminal/sessions/[id] — clôture d'une session
 * (l'utilisateur peut fermer la session d'un agent ; l'agent en
 * recréera une à la prochaine commande si la tâche continue).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const { id } = await params
    const closed = await closeTerminalSession(user.id, id)
    if (!closed) throw new ApiError(404, "Session introuvable ou déjà clôturée.")
    return jsonOk({ sessionId: id, status: "CLOSED" })
  })
}
