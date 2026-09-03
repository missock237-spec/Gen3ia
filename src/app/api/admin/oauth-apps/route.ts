import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireAdmin } from "@/lib/auth/guards"
import { db } from "@/lib/db"
import { encryptJson } from "@/lib/connectors/core/crypto"
import { invalidateDynamicCache } from "@/lib/connectors/apps/dynamic"
import { parseOpenApi, tryParseSpec } from "@/lib/connectors/catalog/openapi-parser"
import { OAUTH_ENDPOINTS } from "@/lib/connectors/catalog/endpoints"
import { getCatalogApp } from "@/lib/connectors/catalog"
import { audit } from "@/lib/engines/audit"

const upsertSchema = z.object({
  appSlug: z.string().min(1).max(120),
  clientId: z.string().min(1).max(500),
  clientSecret: z.string().min(1).max(2000),
  scopes: z.string().max(2000).optional(),
  /** Endpoints personnalisés (app hors registre — saisie opérateur). */
  endpoints: z
    .object({
      authorizeUrl: z.string().url(),
      tokenUrl: z.string().url(),
      baseUrl: z.string().url(),
      scope: z.string().optional(),
      usePkce: z.boolean().optional(),
      authStyle: z.enum(["bearer", "query_token", "basic"]).optional(),
      tokenQueryParam: z.string().optional(),
    })
    .optional(),
  /** Spécification OpenAPI collée (génère les actions exécutables). */
  openapiSpec: z.string().max(8_000_000).optional(),
})

/**
 * GET /api/admin/oauth-apps
 * Registre des applications OAuth de la plateforme (secrets jamais renvoyés).
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    await requireAdmin(req)
    const rows = await db.oAuthAppConfig.findMany({
      orderBy: { appSlug: "asc" },
      select: {
        id: true,
        appSlug: true,
        clientId: true,
        scopes: true,
        active: true,
        redirectUri: true,
        extraConfig: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    const apps = rows.map((r) => {
      let parsed: { actions?: unknown[]; openapiTitle?: string; openapiWarnings?: string[] } = {}
      try {
        parsed = r.extraConfig ? JSON.parse(r.extraConfig) : {}
      } catch {}
      return {
        id: r.id,
        appSlug: r.appSlug,
        appName: getCatalogApp(r.appSlug)?.name ?? r.appSlug,
        clientId: r.clientId,
        scopes: r.scopes,
        active: r.active,
        redirectUri: r.redirectUri,
        actionCount: Array.isArray(parsed.actions) ? parsed.actions.length : 0,
        openapiTitle: parsed.openapiTitle ?? null,
        openapiWarnings: parsed.openapiWarnings ?? [],
        inRegistry: OAUTH_ENDPOINTS[r.appSlug] !== undefined,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }
    })
    return jsonOk({ apps })
  })
}

/**
 * POST /api/admin/oauth-apps
 * Enregistre les identifiants OAuth de la plateforme pour une app.
 * Dès cet instant, les utilisateurs finaux voient « Connecter » fonctionner
 * (flux OAuth réel, aucun jeton utilisateur).
 *
 * Body : { appSlug, clientId, clientSecret, scopes?, endpoints?, openapiSpec? }
 */
export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const admin = await requireAdmin(req)
    const body = await req.json().then((b) => upsertSchema.parse(b))

    const catalogApp = getCatalogApp(body.appSlug)
    if (!catalogApp) throw new ApiError(404, `App inconnue au catalogue : ${body.appSlug}`)

    const endpoints = body.endpoints ?? OAUTH_ENDPOINTS[body.appSlug] ?? null
    if (!endpoints && catalogApp.authSchemes.includes("OAUTH2")) {
      throw new ApiError(
        422,
        `Aucun endpoint OAuth connu pour « ${catalogApp.name} » : renseignez « endpoints » (authorizeUrl, tokenUrl, baseUrl).`
      )
    }

    // Spécification OpenAPI → actions réelles exécutables.
    let extraConfig: string | null = null
    if (body.openapiSpec) {
      const parsedSpec = tryParseSpec(body.openapiSpec)
      if (!parsedSpec.ok) throw new ApiError(422, `Spec OpenAPI invalide : ${parsedSpec.error}`)
      const parsed = parseOpenApi(parsedSpec.spec)
      extraConfig = JSON.stringify({
        actions: parsed.actions,
        openapiTitle: parsed.title,
        openapiWarnings: parsed.warnings,
        ...(body.endpoints
          ? {
              endpoints: {
                ...body.endpoints,
                baseUrl: body.endpoints.baseUrl,
                scope: body.endpoints.scope,
              },
            }
          : {}),
      })
    } else if (body.endpoints) {
      extraConfig = JSON.stringify({ endpoints: body.endpoints })
    }

    const encrypted = encryptJson({ clientSecret: body.clientSecret })

    const existing = await db.oAuthAppConfig.findUnique({ where: { appSlug: body.appSlug } })
    const row = existing
      ? await db.oAuthAppConfig.update({
          where: { id: existing.id },
          data: {
            clientId: body.clientId,
            clientSecret: encrypted,
            scopes: body.scopes ?? existing.scopes,
            extraConfig: extraConfig ?? existing.extraConfig,
            active: true,
            updatedAt: new Date(),
          },
        })
      : await db.oAuthAppConfig.create({
          data: {
            appSlug: body.appSlug,
            clientId: body.clientId,
            clientSecret: encrypted,
            scopes: body.scopes ?? endpoints?.scope ?? null,
            extraConfig,
            active: true,
            createdBy: admin.id,
          },
        })

    invalidateDynamicCache()
    await audit(req, {
      userId: admin.id,
      action: "ADMIN_OAUTH_APP_UPSERTED",
      entityType: "oauth_app",
      entityId: row.id,
      detail: { appSlug: row.appSlug, hasOpenApi: !!body.openapiSpec },
    })

    return jsonOk({ ok: true, appSlug: row.appSlug, actionCount: body.openapiSpec ? JSON.parse(extraConfig ?? "{}").actions.length : 0 })
  })
}
