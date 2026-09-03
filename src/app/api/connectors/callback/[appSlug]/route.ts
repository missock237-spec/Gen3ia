import { NextRequest } from "next/server"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { getApp, ensureCatalogApps } from "@/lib/connectors/apps"
import { completeOAuth1, completeOAuth2 } from "@/lib/connectors/core/connections"
import { logger } from "@/lib/observability/logger"

/**
 * Callback OAuth (browser redirect) : /api/connectors/callback/<app>.
 * - OAuth2 : ?code=…&state=… (state signé HMAC, à usage unique) ;
 * - OAuth1 : ?oauth_token=…&oauth_verifier=….
 *
 * Après traitement, redirige vers l'UI (/connectors) avec un statut
 * lisible. Aucun secret ne transite par l'URL de retour.
 */

function redirectWithResult(
  appSlug: string,
  status: "connected" | "failed",
  detail?: string
): Response {
  const base = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "")
  const url = new URL(`${base || "/connectors"}/connectors`)
  url.searchParams.set("callback", appSlug)
  url.searchParams.set("status", status)
  if (detail) url.searchParams.set("detail", detail.slice(0, 300))
  return Response.redirect(url.toString(), 302)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appSlug: string }> }
) {
  const { appSlug } = await params
  return handleRoute(req, async () => {
    // Identifiants dynamiques (cache DB) avant la résolution de l'app.
    await ensureCatalogApps()
    const app = getApp(appSlug)
    if (!app) {
      throw new ApiError(404, `Application inconnue : ${appSlug}`)
    }

    // Authentification : le cookie de session accompagne la
    // redirection de premier niveau (SameSite=Lax).
    let userId: string
    try {
      const user = await requireUser(req)
      userId = user.id
    } catch {
      // Session perdue pendant le flux OAuth : retour UI explicite.
      return redirectWithResult(appSlug, "failed", "Session expirée — reconnectez-vous puis relancez la connexion.")
    }

    const query = req.nextUrl.searchParams
    const errorParam = query.get("error")

    try {
      if (app.authScheme === "OAUTH1") {
        await completeOAuth1(userId, appSlug, query)
      } else {
        await completeOAuth2(userId, appSlug, query)
      }
      if (errorParam) {
        return redirectWithResult(appSlug, "failed", `Fournisseur : ${errorParam}`)
      }
      return redirectWithResult(appSlug, "connected")
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn("connectors: callback échoué", { appSlug, userId, error: message })
      return redirectWithResult(appSlug, "failed", message)
    }
  })
}
