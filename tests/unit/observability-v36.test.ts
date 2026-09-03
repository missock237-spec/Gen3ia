import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { mkdirSync } from "node:fs"

/**
 * v3.6 — Observabilité :
 *  1. export OTLP/HTTP-JSON réel vers un collecteur local (Bun.serve) :
 *     structure resourceSpans/scopeSpans, identifiants conformes,
 *     parentage, statuts, non-blocage en cas de collecteur absent ;
 *  2. alerting à seuils dynamiques (p95, règles, recommandations) ;
 *  3. santé des modèles : bascule fournisseur persistée + filtrage routeur.
 */

mkdirSync(new URL("../../db", import.meta.url).pathname, { recursive: true })
const TEST_DB_PATH = new URL("../../db/test-otel.db", import.meta.url).pathname
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "" // activé après le collecteur

import { ensureSchema } from "@/lib/db-init"
import { db } from "@/lib/db"
import {
  startSpan,
  endSpan,
  withSpan,
  traceparentHeader,
  flush,
  otelEnabled,
  resetOtel,
  otelStats,
  serviceName,
} from "@/lib/observability/otel"
import { p95, evaluateAlertRules, ALERT_RULES } from "@/lib/observability/alerting"
import { getDisabledProviders, setProviderDisabled, modelHealth, invalidateProviderCache } from "@/lib/observability/model-health"

const collected: Array<{ body: string; headers: Record<string, string> }> = []

const collector = Bun.serve({
  port: 0,
  fetch(req) {
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => (headers[k] = v))
    return req.text().then((body) => {
      collected.push({ body, headers })
      return new Response("{}", { status: 200 })
    })
  },
})

beforeAll(async () => {
  await ensureSchema()
  await db.systemConfig.deleteMany({})
  await db.engineRun.deleteMany({})
  // Deux fournisseurs pour tester le filtrage de bascule (zai réel via
  // /etc/.z-ai-config + openrouter fictif).
  process.env.OPENROUTER_API_KEY = "sk-or-test-v36"
})

afterAll(async () => {
  collector.stop(true)
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = ""
  delete process.env.OPENROUTER_API_KEY
  resetOtel()
  await db.systemConfig.deleteMany({}).catch(() => undefined)
})

describe("OTLP : export vers collecteur réel", () => {
  test("inactif sans endpoint : spans no-op, overhead nul", async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = ""
    resetOtel()
    expect(otelEnabled()).toBe(false)
    const span = startSpan("noop")
    expect(span).toBeNull()
    endSpan(null)
    await withSpan("noop.wrap", {}, async () => "ok")
    expect(traceparentHeader(null)).toEqual({})
  })

  test("withSpan : span OK exporté au format OTLP conforme", async () => {
    collected.length = 0
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://localhost:${collector.port}`
    resetOtel()

    const value = await withSpan(
      "llm.chat",
      { "llm.task_type": "EXECUTION", "llm.tokens_out": 42 },
      async () => {
        // Span enfant : parentage + traceparent W3C.
        const child = startSpan("db.query", { "db.model": "Task" }, null)
        expect(traceparentHeader(child).traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
        endSpan(child, "OK", { "db.duration_ms": 12 })
        return "résultat"
      }
    )
    expect(value).toBe("résultat")
    await flush()

    expect(collected.length).toBe(1)
    const payload = JSON.parse(collected[0].body) as {
      resourceSpans: Array<{
        resource: { attributes: Array<{ key: string; value: { stringValue: string } }> }
        scopeSpans: Array<{ scope: { name: string }; spans: Array<Record<string, unknown>> }>
      }>
    }
    expect(payload.resourceSpans).toHaveLength(1)
    const resource = payload.resourceSpans[0].resource.attributes
    expect(resource.find((a) => a.key === "service.name")?.value.stringValue).toBe(serviceName())

    const spans = payload.resourceSpans[0].scopeSpans[0].spans
    expect(spans.length).toBe(2)
    for (const span of spans) {
      expect(String(span.traceId)).toMatch(/^[0-9a-f]{32}$/)
      expect(String(span.spanId)).toMatch(/^[0-9a-f]{16}$/)
      expect(span.status).toEqual(expect.objectContaining({ code: 1 }))
    }
    // Le header du collecteur confirme le POST JSON OTLP.
    expect(collected[0].headers["content-type"]).toContain("application/json")

    const stats = otelStats()
    expect(stats.enabled).toBe(true)
    expect(stats.exported).toBeGreaterThanOrEqual(2)
  })

  test("erreur : span ERROR avec message, jamais avalée", async () => {
    collected.length = 0
    await expect(
      withSpan("tool.échec", {}, async () => {
        throw new Error("panne simulée du fournisseur")
      })
    ).rejects.toThrow("panne simulée")
    await flush()
    const payload = JSON.parse(collected[0].body) as { resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<Record<string, unknown>> }> }> }
    const span = payload.resourceSpans[0].scopeSpans[0].spans[0]
    expect(span.status).toEqual(expect.objectContaining({ code: 2, message: "panne simulée du fournisseur" }))
  })

  test("collecteur injoignable : fail-open intégral (aucune exception)", async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:1"
    resetOtel()
    await withSpan("orphan", {}, async () => "ok")
    await flush() // n'explose pas
    expect(true).toBe(true)
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://localhost:${collector.port}`
    resetOtel()
  })
})

describe("Alerting : seuils dynamiques", () => {
  test("p95 : distribution connue", () => {
    expect(p95([])).toBe(0)
    expect(p95([10])).toBe(10)
    // 100 valeurs croissantes 1..100 : rang le plus proche (floor(100*0.95)
    // = index 95 en 0-based) → 96e valeur.
    expect(p95(Array.from({ length: 100 }, (_, i) => i + 1))).toBe(96)
  })

  test("quatre règles définies avec recommandations actionnables", () => {
    expect(ALERT_RULES).toHaveLength(4)
    for (const rule of ALERT_RULES) {
      expect(rule.id).toContain(".")
      expect(rule.recommendation(0.1, 0.05).length).toBeGreaterThan(80)
      expect(rule.baselineMultiplier).toBeGreaterThan(1)
    }
  })

  test("évaluation réelle : pas de données → règles non déclenchées, aucune erreur", async () => {
    const evaluations = await evaluateAlertRules()
    expect(Array.isArray(evaluations)).toBe(true)
    for (const e of evaluations) {
      expect(e.triggered).toBe(false)
      expect(e.windowMinutes).toBeGreaterThan(0)
    }
  })

  test("code_runner en échec massif → règle déclenchée + recommandation", async () => {
    // Historique réaliste : 20 exécutions OK il y a 2 h (base 24 h saine)
    // PUIS un pic : 10 exécutions récentes, 6 en échec (60 % sur 5 min).
    for (let i = 0; i < 20; i++) {
      await db.engineRun.create({
        data: {
          engine: "EXECUTOR",
          phase: "EXECUTING",
          ok: true,
          durationMs: 400,
          attempts: 1,
          createdAt: new Date(Date.now() - 2 * 3_600_000),
          detail: JSON.stringify({ tools: ["code_runner"], toolFailures: [] }),
        },
      })
    }
    for (let i = 0; i < 10; i++) {
      await db.engineRun.create({
        data: {
          engine: "EXECUTOR",
          phase: "EXECUTING",
          ok: i < 6 ? false : true,
          durationMs: 500,
          attempts: 1,
          detail: JSON.stringify({
            tools: ["code_runner"],
            toolFailures: i < 6 ? ["code_runner"] : [],
          }),
        },
      })
    }
    const evaluations = await evaluateAlertRules()
    const rule = evaluations.find((e) => e.ruleId === "tool.code_runner.error_rate")
    expect(rule).toBeTruthy()
    expect(rule!.triggered).toBe(true) // 60 % > 5 %
    expect(rule!.observed).toBeCloseTo(0.6, 2)
    expect(rule!.recommendation).toContain("allow-list")

    // L'alerte est persistée (AnomalyAlert, dédup 15 min).
    const alerts = await db.anomalyAlert.findMany({ where: { metric: "tool.code_runner.error_rate" } })
    expect(alerts.length).toBe(1)
    await evaluateAlertRules()
    const alertsAfterDedup = await db.anomalyAlert.findMany({ where: { metric: "tool.code_runner.error_rate" } })
    expect(alertsAfterDedup.length).toBe(1) // pas de doublon
  })
})

describe("Santé des modèles : bascule fournisseur", () => {
  test("désactivation persistée + filtrage du routeur", async () => {
    // Télémétrie fictive de deux fournisseurs.
    for (let i = 0; i < 6; i++) {
      await db.engineRun.create({
        data: {
          engine: i < 5 ? "LLM::zai" : "LLM::openrouter",
          ok: i < 4,
          durationMs: 800 + i * 100,
          attempts: 1,
          tokensIn: 100,
          tokensOut: 200,
          credits: 0.3,
          detail: JSON.stringify({ model: "glm-4.6" }),
        },
      })
    }

    const health = await modelHealth(1)
    expect(health.length).toBe(2)
    const zai = health.find((p) => p.provider === "zai")!
    expect(zai.runs).toBe(5)
    expect(zai.okRate).toBeCloseTo(0.8, 2)
    expect(zai.avgLatencyMs).toBeGreaterThan(0)
    expect(zai.p95LatencyMs).toBeGreaterThanOrEqual(zai.avgLatencyMs)
    expect(zai.disabled).toBe(false)

    // Bascule manuelle : zai désactivé.
    await setProviderDisabled("zai", true)
    expect((await getDisabledProviders()).has("zai")).toBe(true)

    // Le routeur l'exclut de la chaîne de repli.
    const { routeCall } = await import("@/lib/ai/router")
    const { LLMCallOptions } = { LLMCallOptions: null }
    void LLMCallOptions
    const decision = routeCall({ taskType: "EXECUTION", temperature: 0.5, maxTokens: 100 } as never)
    expect(decision.fallbackChain.includes("zai")).toBe(false)

    // Santé reflète l'état désactivé.
    const healthAfter = await modelHealth(1)
    expect(healthAfter.find((p) => p.provider === "zai")!.disabled).toBe(true)

    // Réactivation.
    await setProviderDisabled("zai", false)
    invalidateProviderCache()
    const decisionAfter = routeCall({ taskType: "EXECUTION", temperature: 0.5, maxTokens: 100 } as never)
    expect(decisionAfter.fallbackChain.includes("zai") || decisionAfter.provider === "zai").toBe(true)

    // Persistance SystemConfig effective.
    const row = await db.systemConfig.findUnique({ where: { key: "llm.disabled_providers" } })
    expect(row?.value).toBe("[]")
  })
})
