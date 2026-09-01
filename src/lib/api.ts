import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { ensureSchema } from "@/lib/db-init"
import { AppError, toAppError, ERROR_CODES } from "@/lib/errors"
import { enforceRateLimit, type RateLimitPolicyName } from "@/lib/security/rate-limit"
import { withRequestLogger } from "@/lib/observability/logger"

/**
 * Erreur API typée avec code HTTP — remonte un message utilisateur propre.
 * v3.1 : cohabite avec AppError (catalogue centralisé) ; handleRoute gère
 * les deux. Les NOUVEAUX codes doivent être déclarés dans lib/errors.ts.
 */
export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, message: string, code = "API_ERROR") {
    super(message)
    this.status = status
    this.code = code
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function jsonOk<T extends Record<string, unknown>>(data: T) {
  return NextResponse.json({ ok: true, ...data })
}

export interface RateLimitOptions {
  /** Politique à appliquer (voir security/rate-limit.ts). */
  policy: RateLimitPolicyName
  /** Dimension d'identification : ip | userId (résolu automatiquement). */
  identify: "ip" | "userId"
}

/**
 * Enveloppe un gestionnaire de route : initialisation du schéma,
 * journalisation structurée, limitation de débit et capture des erreurs.
 *
 * Usage :
 *   export const POST = (req: NextRequest) =>
 *     handleRoute(req, () => { ... }, { rateLimit: { policy: "auth", identify: "ip" } })
 *
 * L'ancienne signature handleRoute(fn) reste acceptée (sans rate limit).
 */
export async function handleRoute(
  fnOrReq: Request | (() => Promise<Response>),
  maybeFn?: () => Promise<Response>,
  opts?: { rateLimit?: RateLimitOptions }
): Promise<Response> {
  const req = typeof fnOrReq === "object" && "headers" in fnOrReq ? (fnOrReq as Request) : undefined
  const fn = typeof fnOrReq === "function" ? fnOrReq : (maybeFn as () => Promise<Response>)
  const log = req ? withRequestLogger(req) : undefined
  const started = Date.now()

  try {
    // Garantit le schéma de base (idempotent, un seul appel effectif par processus).
    await ensureSchema()

    // v3.1 — limitation de débit unifiée (IP ou utilisateur).
    if (req && opts?.rateLimit) {
      const identifier = await resolveIdentifier(req, opts.rateLimit.identify)
      if (identifier) {
        enforceRateLimit(opts.rateLimit.policy, identifier)
      }
    }

    const response = await fn()
    log?.info("requête traitée", { status: response.status, durMs: Date.now() - started })
    return response
  } catch (err) {
    if (err instanceof AppError) {
      const retryAfter = (err as AppError & { retryAfter?: number }).retryAfter
      log?.warn("requête rejetée", { code: err.code, status: err.status, durMs: Date.now() - started })
      return NextResponse.json(
        { ok: false, error: err.userMessage, code: err.code },
        { status: err.status, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined }
      )
    }
    if (err instanceof ApiError) {
      log?.warn("requête rejetée", { code: err.code, status: err.status, durMs: Date.now() - started })
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code },
        { status: err.status }
      )
    }
    if (err instanceof ZodError) {
      const first = err.issues[0]
      log?.warn("validation rejetée", { durMs: Date.now() - started })
      return NextResponse.json(
        {
          ok: false,
          error: `Données invalides : ${first?.path.join(".")} — ${first?.message}`,
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      )
    }
    // Erreur interne : journalisée en JSON structuré, jamais exposée en clair au client.
    const appErr = toAppError(err)
    log?.error("erreur non gérée", {
      code: appErr.code,
      detail: appErr.technicalDetail,
      durMs: Date.now() - started,
    })
    return NextResponse.json(
      { ok: false, error: appErr.userMessage, code: appErr.code },
      { status: appErr.status }
    )
  }
}

/** Résout l'identifiant de rate limit (IP ou utilisateur de session). */
async function resolveIdentifier(req: Request, identify: "ip" | "userId"): Promise<string | null> {
  if (identify === "ip") {
    const fwd = req.headers.get("x-forwarded-for")
    if (fwd) return fwd.split(",")[0].trim()
    return req.headers.get("x-real-ip") ?? "local"
  }
  // Utilisateur de session : lu depuis le cookie (sans validation complète —
  // la garde d'authentification de la route fait le travail de sécurité ;
  // ici on veut seulement une clé stable par utilisateur).
  try {
    const { getSessionUser, SESSION_COOKIE } = await import("@/lib/auth/session")
    const cookieHeader = req.headers.get("cookie") ?? ""
    const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
    const token = match?.[1]
    if (token) {
      const user = await getSessionUser(decodeURIComponent(token))
      if (user) return user.id
    }
  } catch {
    /* pas de session : retombera sur l'IP */
  }
  const fwd = req.headers.get("x-forwarded-for")
  return fwd ? fwd.split(",")[0].trim() : (req.headers.get("x-real-ip") ?? "local")
}

export function getClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return req.headers.get("x-real-ip")
}

/** Parse et valide le corps JSON d'une requête. */
export async function readJson<T>(req: Request, schema: { parse: (v: unknown) => T }): Promise<T> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new ApiError(400, "Corps de requête JSON invalide.", "BAD_JSON")
  }
  return schema.parse(body)
}

export { ERROR_CODES }
