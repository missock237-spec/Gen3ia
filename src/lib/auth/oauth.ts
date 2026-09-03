import crypto from "crypto"
import { db } from "@/lib/db"
import { createSession } from "@/lib/auth/session"
import { grantCredits } from "@/lib/credits/ledger"
import { audit } from "@/lib/engines/audit"
import { SIGNUP_BONUS_CREDITS } from "@/lib/config"
import { ApiError } from "@/lib/api"

/**
 * Authentification OAuth 2.0 — GitHub et Google.
 *
 * Flux serveur complet (RFC 6749) :
 *   1. GET /api/auth/oauth/[provider]           → redirection vers le fournisseur
 *   2. Fournisseur redirige vers /api/auth/oauth/[provider]/callback?code=…
 *   3. Échange du code contre un token d'accès (appel serveur réel)
 *   4. Récupération du profil vérifié (API du fournisseur)
 *   5. Mise en correspondance : OAuthIdentity → User (fusion par e-mail)
 *
 * Aucun jeton utilisateur n'est requis ; l'utilisateur clique, autorise, c'est fait.
 */

export type OAuthProvider = "github" | "google"

interface ProviderConfig {
  authorizeUrl: string
  tokenUrl: string
  profileUrl: string
  scope: string
  clientId: string | undefined
  clientSecret: string | undefined
}

const PROVIDERS: Record<OAuthProvider, ProviderConfig> = {
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    profileUrl: "https://api.github.com/user",
    scope: "read:user user:email",
    clientId: process.env.AUTH_GITHUB_CLIENT_ID,
    clientSecret: process.env.AUTH_GITHUB_CLIENT_SECRET,
  },
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    clientId: process.env.AUTH_GOOGLE_CLIENT_ID,
    clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET,
  },
}

export function isOAuthProvider(v: string): v is OAuthProvider {
  return v === "github" || v === "google"
}

export function getProviderConfig(provider: OAuthProvider): ProviderConfig {
  const cfg = PROVIDERS[provider]
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new ApiError(
      503,
      `L'authentification ${provider === "github" ? "GitHub" : "Google"} n'est pas configurée sur cette plateforme (variables AUTH_${provider.toUpperCase()}_CLIENT_ID / _SECRET absentes).`,
      "OAUTH_NOT_CONFIGURED"
    )
  }
  return cfg
}

/** URL de base pour les redirections (production : domaine public). */
export function oauthBaseUrl(req: Request): string {
  const fromEnv = process.env.APP_URL
  if (fromEnv) return fromEnv.replace(/\/+$/, "")
  const url = new URL(req.url)
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host
  return `${proto}://${host}`
}

// ---------------------------------------------------------------------------
// État anti-CSRF : signé HMAC-SHA256, éphémère (10 minutes)
// ---------------------------------------------------------------------------

function hmacSecret(): string {
  return process.env.SESSION_SECRET ?? "gen3ia-oauth-state-dev-secret"
}

export function signState(provider: OAuthProvider, redirect: string): string {
  const exp = Date.now() + 10 * 60 * 1000
  const payload = `${provider}|${redirect}|${exp}`
  const sig = crypto.createHmac("sha256", hmacSecret()).update(payload).digest("base64url")
  return Buffer.from(`${payload}|${sig}`).toString("base64url")
}

export function verifyState(state: string, provider: OAuthProvider): string {
  let payload: string
  try {
    payload = Buffer.from(state, "base64url").toString("utf8")
  } catch {
    throw new ApiError(400, "État OAuth invalide.", "OAUTH_STATE_INVALID")
  }
  const parts = payload.split("|")
  if (parts.length !== 4) throw new ApiError(400, "État OAuth invalide.", "OAUTH_STATE_INVALID")
  const [p, redirect, exp, sig] = parts
  const expected = crypto.createHmac("sha256", hmacSecret()).update(`${p}|${redirect}|${exp}`).digest("base64url")
  if (sig !== expected || p !== provider || Number(exp) < Date.now()) {
    throw new ApiError(400, "État OAuth expiré ou invalide.", "OAUTH_STATE_INVALID")
  }
  return redirect
}

// ---------------------------------------------------------------------------
// Échange du code + récupération du profil (appels réseau réels)
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string
  token_type: string
  scope?: string
  error?: string
  error_description?: string
}

export async function exchangeCode(
  provider: OAuthProvider,
  code: string,
  redirectUri: string
): Promise<string> {
  const cfg = getProviderConfig(provider)
  const body = new URLSearchParams({
    client_id: cfg.clientId as string,
    client_secret: cfg.clientSecret as string,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  })
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  })
  const data = (await res.json()) as TokenResponse
  if (!res.ok || !data.access_token) {
    throw new ApiError(
      502,
      `Échange de code ${provider} refusé : ${data.error_description ?? data.error ?? res.statusText}`,
      "OAUTH_TOKEN_EXCHANGE_FAILED"
    )
  }
  return data.access_token
}

export interface OAuthProfile {
  providerAccountId: string
  email: string | null
  name: string | null
  avatarUrl: string | null
}

export async function fetchProfile(provider: OAuthProvider, accessToken: string): Promise<OAuthProfile> {
  const cfg = getProviderConfig(provider)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  }
  if (provider === "github") headers["User-Agent"] = "GEN3IA-OAuth"

  const res = await fetch(cfg.profileUrl, { headers })
  if (!res.ok) {
    throw new ApiError(502, `Profil ${provider} inaccessible (${res.status}).`, "OAUTH_PROFILE_FAILED")
  }
  const raw = (await res.json()) as Record<string, unknown>

  if (provider === "github") {
    let email = typeof raw.email === "string" ? raw.email : null
    // GitHub masque l'e-mail public : interroger /user/emails (endpoint privilégié).
    if (!email) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: { ...headers, "User-Agent": "GEN3IA-OAuth" },
      })
      if (emailsRes.ok) {
        const emails = (await emailsRes.json()) as Array<{
          email: string
          primary: boolean
          verified: boolean
        }>
        email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email ?? null
      }
    }
    return {
      providerAccountId: String(raw.id),
      email,
      name: typeof raw.name === "string" ? raw.name : typeof raw.login === "string" ? raw.login : null,
      avatarUrl: typeof raw.avatar_url === "string" ? raw.avatar_url : null,
    }
  }

  // Google (OpenID Connect)
  return {
    providerAccountId: String(raw.sub ?? ""),
    email: typeof raw.email === "string" ? raw.email : null,
    name: typeof raw.name === "string" ? raw.name : null,
    avatarUrl: typeof raw.picture === "string" ? raw.picture : null,
  }
}

// ---------------------------------------------------------------------------
// Mise en correspondance profil ↔ compte utilisateur
// ---------------------------------------------------------------------------

export interface OAuthLoginResult {
  userId: string
  created: boolean
}

export async function upsertOAuthUser(
  provider: OAuthProvider,
  profile: OAuthProfile
): Promise<OAuthLoginResult> {
  if (!profile.email) {
    throw new ApiError(
      422,
      "Le fournisseur OAuth n'a pas retourné d'adresse e-mail vérifiée — impossible de rattacher le compte.",
      "OAUTH_NO_EMAIL"
    )
  }
  const email = profile.email.toLowerCase().trim()

  // 1. Identité déjà liée ? → connexion directe.
  const existingIdentity = await db.oAuthIdentity.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    include: { user: true },
  })
  if (existingIdentity) {
    // Met à jour les attributs de profil (avatar, nom) si fournis.
    await db.oAuthIdentity.update({
      where: { id: existingIdentity.id },
      data: {
        email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
    })
    if (profile.avatarUrl || profile.name) {
      await db.user.update({
        where: { id: existingIdentity.userId },
        data: {
          avatarUrl: existingIdentity.user.avatarUrl ?? profile.avatarUrl,
          oauthProvider: provider,
        },
      })
    } else {
      await db.user.update({
        where: { id: existingIdentity.userId },
        data: { oauthProvider: provider },
      })
    }
    return { userId: existingIdentity.userId, created: false }
  }

  // 2. Fusion par e-mail : le compte local existant reçoit l'identité OAuth.
  const existingUser = await db.user.findUnique({ where: { email } })
  if (existingUser) {
    await db.oAuthIdentity.create({
      data: {
        userId: existingUser.id,
        provider,
        providerAccountId: profile.providerAccountId,
        email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
    })
    await db.user.update({
      where: { id: existingUser.id },
      data: {
        avatarUrl: existingUser.avatarUrl ?? profile.avatarUrl,
        name: existingUser.name ?? profile.name,
        oauthProvider: provider,
      },
    })
    return { userId: existingUser.id, created: false }
  }

  // 3. Nouvel utilisateur (e-mail vérifié par le fournisseur).
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const userCount = await db.user.count()
  // Bootstrap-admin uniquement hors production ou avec ADMIN_EMAILS explicite.
  const allowBootstrap = process.env.NODE_ENV !== "production" || adminEmails.length > 0
  const role = adminEmails.includes(email) || (userCount === 0 && allowBootstrap) ? "ADMIN" : "USER"

  const user = await db.user.create({
    data: {
      email,
      name: profile.name ?? email.split("@")[0],
      role,
      credits: 0,
      avatarUrl: profile.avatarUrl,
      oauthProvider: provider,
      oauthIdentities: {
        create: {
          provider,
          providerAccountId: profile.providerAccountId,
          email,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
        },
      },
    },
  })

  await grantCredits(user.id, SIGNUP_BONUS_CREDITS, {
    type: "BONUS",
    description: "Bonus de bienvenue GEN3IA",
  })

  return { userId: user.id, created: true }
}

/** Session + audit pour une connexion OAuth aboutie. */
export async function finalizeOAuthLogin(
  req: Request,
  userId: string,
  provider: OAuthProvider,
  created: boolean,
  meta: { userAgent?: string | null; ip?: string | null }
): Promise<string> {
  const token = await createSession(userId, meta)
  await audit(req, {
    userId,
    action: created ? "USER_REGISTERED_OAUTH" : "USER_LOGIN_OAUTH",
    entityType: "user",
    entityId: userId,
    detail: { provider },
  })
  return token
}
