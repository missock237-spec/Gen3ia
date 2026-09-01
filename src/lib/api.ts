import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { ensureSchema } from "@/lib/db-init"

/** Erreur API typée avec code HTTP — remonte un message utilisateur propre. */
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

/** Enveloppe un gestionnaire de route : initialisation du schéma + capture des erreurs. */
export async function handleRoute(
  fn: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    // Garantit le schéma de base (idempotent, un seul appel effectif par processus).
    await ensureSchema()
    return await fn()
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code },
        { status: err.status }
      )
    }
    if (err instanceof ZodError) {
      const first = err.issues[0]
      return NextResponse.json(
        {
          ok: false,
          error: `Données invalides : ${first?.path.join(".")} — ${first?.message}`,
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      )
    }
    // Erreur interne : journalisée côté serveur, jamais exposée en clair au client.
    console.error("[API] Erreur non gérée :", err)
    return NextResponse.json(
      {
        ok: false,
        error: "Une erreur interne est survenue. Réessayez ou contactez le support.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    )
  }
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
