import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson } from "@/lib/api"
import { requireAdmin } from "@/lib/auth/guards"
import { audit } from "@/lib/engines/audit"
import { modelHealth, setProviderDisabled, getDisabledProviders } from "@/lib/observability/model-health"
import { evaluateAlertRules } from "@/lib/observability/alerting"
import { otelStats } from "@/lib/observability/otel"

/**
 * GET  /api/admin/models — santé des modèles LLM (succès/latence p95/
 *        tokens/crédits par fournisseur, 24 h), état OTLP, évaluation
 *        live des règles d'alerting (seuils dynamiques + recommandations).
 * POST /api/admin/models — bascule manuelle d'un fournisseur
 *        ({ provider, disabled }) : sort/revient dans la chaîne de repli.
 */
const toggleSchema = z.object({
  provider: z.string().min(1).max(30),
  disabled: z.boolean(),
})

export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    await requireAdmin(req)
    const [providers, alerts, disabled, days] = await Promise.all([
      modelHealth(1),
      evaluateAlertRules(),
      getDisabledProviders(),
      Promise.resolve(Number(new URL(req.url).searchParams.get("days") ?? 1)),
    ])
    const windowProviders = days !== 1 ? await modelHealth(Math.min(Math.max(days, 1), 30)) : providers
    return Response.json({
      ok: true,
      providers: windowProviders.map((p) => ({ ...p, disabled: disabled.has(p.provider) })),
      alerting: alerts,
      otel: otelStats(),
    })
  })
}

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async () => {
      const admin = await requireAdmin(req)
      const body = await readJson(req, toggleSchema)
      const remaining = await setProviderDisabled(body.provider, body.disabled)
      await audit(req, {
        userId: admin.id,
        action: body.disabled ? "MODEL_PROVIDER_DISABLED" : "MODEL_PROVIDER_ENABLED",
        entityType: "provider",
        entityId: body.provider,
        detail: { remainingDisabled: remaining },
      })
      return Response.json({
        ok: true,
        provider: body.provider,
        disabled: body.disabled,
        disabledProviders: remaining,
      })
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}
