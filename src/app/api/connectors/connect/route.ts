import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { getApp } from "@/lib/connectors/apps"
import {
  connectDirectly,
  initiateConnection,
} from "@/lib/connectors/core/connections"
import { appAvailability, ensureCatalogApps } from "@/lib/connectors/apps"

const initiateSchema = z.object({
  appSlug: z.string().min(1),
  /** Retour UI après le callback OAuth (route côté front). */
  redirectUri: z.string().url().nullable().optional(),
})

const directSchema = z.object({
  appSlug: z.string().min(1),
  token: z.string().min(8).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  fields: z.record(z.string(), z.string()).optional(),
})

/**
 * POST /api/connectors/connect
 * - body { appSlug } → démarre un flux OAuth (retourne redirectUrl) ;
 * - body { appSlug, token, … } → connexion directe (import de token
 *   ou identifiants Basic) sans redirection.
 */
export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    // Charge les identifiants dynamiques (OAuthAppConfig) avant résolution.
    await ensureCatalogApps()
    const body = await req.json().catch(() => ({}))

    // 1. Connexion directe si des identifiants sont fournis.
    const direct = directSchema.safeParse(body)
    if (direct.success && (direct.data.token || direct.data.password)) {
      const app = getApp(direct.data.appSlug)
      if (!app) throw new ApiError(404, `Application inconnue : ${direct.data.appSlug}`)
      if (!app.supportsTokenImport && app.authScheme !== "BASIC") {
        throw new ApiError(
          400,
          `« ${app.name} » n'accepte pas l'import direct de token : utilisez le flux OAuth.`
        )
      }
      const { connectionId } = await connectDirectly(user.id, direct.data.appSlug, {
        token: direct.data.token,
        username: direct.data.username,
        password: direct.data.password,
        fields: direct.data.fields,
      })
      return jsonOk({ mode: "DIRECT", connectionId, appSlug: direct.data.appSlug })
    }

    // 2. Flux OAuth (redirection).
    const parsed = initiateSchema.safeParse(body)
    if (!parsed.success) {
      throw new ApiError(400, "Corps de requête invalide : appSlug requis.")
    }
    const app = getApp(parsed.data.appSlug)
    if (!app) throw new ApiError(404, `Application inconnue : ${parsed.data.appSlug}`)
    const availability = appAvailability(app)
    if (!availability.connectable) {
      throw new ApiError(
        503,
        `« ${app.name} » n'est pas connectable : ${availability.reason ?? "configuration serveur absente"}`
      )
    }
    if (availability.mode === "TOKEN_IMPORT" && !app.oauth2 && !app.oauth1) {
      throw new ApiError(
        400,
        `« ${app.name} » n'est pas encore activée pour la connexion OAuth sur cette plateforme — l'administrateur doit configurer ses identifiants. Aucun token utilisateur n'est nécessaire ni accepté.`
      )
    }

    const result = await initiateConnection(
      user.id,
      parsed.data.appSlug,
      parsed.data.redirectUri ?? null
    )
    return jsonOk({
      mode: "OAUTH",
      redirectUrl: result.redirectUrl,
      requestId: result.requestId,
      expect: result.expect,
      appSlug: parsed.data.appSlug,
    })
  }, { rateLimit: { policy: "user", identify: "userId" } })
}
