import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { handleRoute } from "@/lib/api"
import { getSessionUser } from "@/lib/auth/session"
import { logger } from "@/lib/observability/logger"
import { syncAllConnections } from "@/lib/connectors/composio"
import { getAppUrl } from "@/lib/config"

/**
 * GET /api/connectors/callback — retour de l'autorisation OAuth Composio.
 *
 * L'utilisateur revient ici après avoir autorisé l'application sur la page
 * hébergée Composio. Les paramètres exacts du retour varient selon l'app ;
 * la source de vérité du statut est l'API Composio elle-même : on
 * resynchronise TOUTES les connexions de l'utilisateur puis on le renvoie
 * vers l'interface avec un résumé lisible.
 *
 * La session est requise pour identifier l'utilisateur : le callback est
 * atteint dans le navigateur de l'utilisateur (cookie de session présent).
 * Sans session valide, redirection vers la page Connecteurs sans sync
 * (fail-closed : aucune donnée ne fuite vers un visiteur non authentifié).
 */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const sp = req.nextUrl.searchParams
    const connectedAccountId = sp.get("connectedAccountId") ?? sp.get("connected_account_id")
    const state = sp.get("state")
    const status = sp.get("status") ?? ""

    const cookieToken = req.cookies.get("g3ia_session")?.value
    let synced = false
    if (cookieToken) {
      try {
        const user = await getSessionUser(decodeURIComponent(cookieToken))
        if (user) {
          await syncAllConnections(user.id)
          synced = true
          if (connectedAccountId) {
            const row = await db.connectedAccount.findUnique({ where: { composioId: connectedAccountId } })
            if (row) {
              await db.auditLog.create({
                data: {
                  userId: user.id,
                  action: "CONNECTOR_CALLBACK",
                  entityType: "ConnectedAccount",
                  entityId: row.id,
                  detail: JSON.stringify({ status, state: state?.slice(0, 200) ?? null }),
                },
              })
            }
          }
        }
      } catch (err) {
        logger.warn("composio: synchronisation au callback échouée", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const base = getAppUrl()
    const params = new URLSearchParams()
    if (connectedAccountId) params.set("connected", connectedAccountId)
    if (status) params.set("status", status)
    params.set("synced", synced ? "1" : "0")
    return NextResponse.redirect(`${base}/connectors?${params.toString()}`, 302)
  })
}
