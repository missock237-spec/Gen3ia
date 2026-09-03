import type { LLMCallOptions, LLMResult } from "./types"
import { LLMError } from "./types"
import { startSpan as otelStart, endSpan as otelEnd } from "@/lib/observability/otel"
import { recordEngineRun } from "@/lib/observability/metrics"
import { routeCall } from "./router"
import { zaiChat } from "./providers/zai"
import { compatibleChat } from "./providers/openai-compatible"

/**
 * Point d'entrée unique de l'inférence GEN3IA.
 * Routage automatique + basculement sur fournisseur de repli en cas d'échec
 * (résilience réelle : si le fournisseur principal échoue, le suivant est essayé).
 */

export async function chat(opts: LLMCallOptions): Promise<LLMResult> {
  // v3.6 — OpenTelemetry : span d'appel LLM (provider, repli, tokens).
  const span = otelStart("llm.chat", {
    "llm.task_type": opts.taskType ?? "CHAT",
    "llm.temperature": opts.temperature ?? 0.5,
    "llm.fallback_chain": routeCall(opts).fallbackChain.join(">"),
  })
  const started = Date.now()
  try {
    const result = await chatInner(opts)
    otelEnd(span, "OK", {
      "llm.provider": result.provider,
      "llm.model": result.model,
      "llm.tokens_in": result.tokensIn,
      "llm.tokens_out": result.tokensOut,
      "llm.duration_ms": Date.now() - started,
    })
    // v3.6 — télémétrie durable de santé des modèles (EngineRun LLM::*).
    void recordEngineRun({
      engine: `LLM::${result.provider}`,
      ok: true,
      durationMs: Date.now() - started,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      detail: { model: result.model },
    }).catch(() => undefined)
    return result
  } catch (err) {
    otelEnd(span, "ERROR", {}, err instanceof Error ? err.message : String(err))
    // v3.6 — l'échec compte aussi pour la santé du fournisseur visé.
    void recordEngineRun({
      engine: "LLM::routing",
      ok: false,
      durationMs: Date.now() - started,
      errorCode: err instanceof LLMError ? err.code : "LLM_FAILED",
      detail: { error: err instanceof Error ? err.message.slice(0, 300) : String(err) },
    }).catch(() => undefined)
    throw err
  }
}

async function chatInner(opts: LLMCallOptions): Promise<LLMResult> {
  const decision = routeCall(opts)
  const errors: string[] = []
  let lastCode = "ALL_PROVIDERS_FAILED"

  for (const provider of decision.fallbackChain) {
    try {
      const model =
        provider === decision.provider
          ? decision.model
          : routeCall({ ...opts, provider }).model
      if (provider === "zai") {
        return await zaiChat(opts, model || "glm-4.6")
      }
      return await compatibleChat(provider, opts, model || "glm-4.5")
    } catch (err) {
      if (err instanceof LLMError) {
        // Conserve le code de la dernière erreur (429/5xx restent TRANSIENT
        // pour l'auto-correction, même après épuisement des replis).
        lastCode = err.code
      }
      if (err instanceof LLMError && err.code === "MISSING_KEY") {
        errors.push(`${provider}: clé absente`)
        continue
      }
      errors.push(
        `${provider}: ${err instanceof Error ? err.message : String(err)}`
      )
      // On tente le fournisseur suivant du repli.
    }
  }

  // Un seul fournisseur disponible et transitoirement indisponible :
  // on relance l'erreur d'origine pour permettre RETRY par l'auto-correction.
  if (decision.fallbackChain.length === 1 && errors.length === 1) {
    throw new LLMError(decision.provider, errors[0], lastCode)
  }
  throw new LLMError(
    decision.provider,
    `Tous les fournisseurs ont échoué — ${errors.join(" | ")}`,
    /429/.test(errors.join("")) ? "HTTP_429" : "ALL_PROVIDERS_FAILED"
  )
}

export { MODEL_CATALOG, getAvailableProviders, isProviderAvailable, creditsForTokens } from "./router"
export { chatJSON, extractJson, StructuredOutputError } from "./structured"
export type { JSONCallResult } from "./structured"
export type { ModelInfo, TaskType } from "./types"
