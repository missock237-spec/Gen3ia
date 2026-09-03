import { NextRequest, NextResponse } from "next/server"
import { ApiError, handleRoute } from "@/lib/api"
import {
  isOAuthProvider,
  getProviderConfig,
  signState,
  oauthBaseUrl,
} from "@/lib/auth/oauth"

export const dynamic = "force-dynamic"

/**
 * GET /api/auth/oauth/[provider]?redirect=/dashboard
 * Redirige vers la page d'autorisation du fournisseur (GitHub / Google).
 * L'utilisateur n'a aucun jeton à fournir : il autorise son compte, c'est tout.
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
    const cfg = getProviderConfig(provider)

    const url = new URL(req.url)
    const redirect = url.searchParams.get("redirect") ?? "/dashboard"
    // Un redirect invalide ou externe retombe sur le tableau de bord.
    const safeRedirect = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard"

    const base = oauthBaseUrl(req)
    const redirectUri = `${base}/api/auth/oauth/${provider}/callback`
    const state = signState(provider, safeRedirect)

    const authorizeUrl = new URL(cfg.authorizeUrl)
    authorizeUrl.searchParams.set("client_id", cfg.clientId as string)
    authorizeUrl.searchParams.set("redirect_uri", redirectUri)
    authorizeUrl.searchParams.set("scope", cfg.scope)
    authorizeUrl.searchParams.set("state", state)
    if (provider === "google") {
      authorizeUrl.searchParams.set("response_type", "code")
      authorizeUrl.searchParams.set("access_type", "offline")
      authorizeUrl.searchParams.set("prompt", "consent")
    }

    return NextResponse.redirect(authorizeUrl.toString())
  })
}
