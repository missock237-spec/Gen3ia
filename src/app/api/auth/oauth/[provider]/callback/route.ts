import { NextRequest, NextResponse } from "next/server"
import { ApiError, handleRoute, getClientIp } from "@/lib/api"
import {
  isOAuthProvider,
  exchangeCode,
  fetchProfile,
  verifyState,
  upsertOAuthUser,
  finalizeOAuthLogin,
  oauthBaseUrl,
} from "@/lib/auth/oauth"
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

/**
 * GET /api/auth/oauth/[provider]/callback?code=…&state=…
 * Finalise la connexion OAuth : échange du code, profil, session.
 * En cas de succès → cookie de session + redirection vers la page demandée.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  return handleRoute(async () => {
    const { provider } = await params
    if (!isOAuthProvider(provider)) {
      throw new ApiError(404, "Fournisseur OAuth inconnu.", "OAUTH_UNKNOWN_PROVIDER")
    }

    const url = new URL(req.url)
    const error = url.searchParams.get("error")
    if (error) {
      const target = new URL("/login", oauthBaseUrl(req))
      target.searchParams.set("error", `oauth_${provider}_${error}`)
      return NextResponse.redirect(target.toString())
    }

    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    if (!code || !state) {
      throw new ApiError(400, "Requête OAuth incomplète (code/state manquants).", "OAUTH_MISSING_PARAMS")
    }

    const redirectTo = verifyState(state, provider)
    const base = oauthBaseUrl(req)
    const accessToken = await exchangeCode(provider, code, `${base}/api/auth/oauth/${provider}/callback`)
    const profile = await fetchProfile(provider, accessToken)

    const { userId, created } = await upsertOAuthUser(provider, profile)
    const token = await finalizeOAuthLogin(req, userId, provider, created, {
      userAgent: req.headers.get("user-agent"),
      ip: getClientIp(req),
    })

    const target = new URL(redirectTo, base)
    if (created) target.searchParams.set("welcome", "1")
    const res = NextResponse.redirect(target.toString())
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
    return res
  })
}
