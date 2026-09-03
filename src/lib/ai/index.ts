import type { LLMCallOptions, LLMResult, RoutingCallOptions } from "./types"
import { LLMError } from "./types"
import { startSpan as otelStart, endSpan as otelEnd } from "@/lib/observability/otel"
import { recordEngineRun } from "@/lib/observability/metrics"
import { routeCall } from "./router"
import { selectModel } from "./router-v2"
import { recordPerformance } from "./performance"
import { zaiChat } from "./providers/zai"
import { compatibleChat } from "./providers/openai-compatible"

/**
 * Point d'entrée unique de l'inférence GEN3IA.
 * v4.0 — Model & Compute Intelligence Layer :
 *  1. Model Router intelligent (registre + performance + contraintes) ;
 *  2. Basculement fournisseurs de repli (résilience réelle) ;
 *  3. Mesure de performance après CHAQUE appel (boucle d'apprentissage) ;
 *  4. Télémétrie OpenTelemetry + santé durable des moteurs.
 *
 * Compatibilité : routeCall() historique reste utilisé comme repli si le
 * registre intelligent est indisponible (base injoignable).
 */

export async function chat(opts: RoutingCallOptions): Promise<LLMResult> {
  const span = otelStart("llm.chat", {
    "llm.task_type": opts.taskType ?? "CHAT",
    "llm.temperature": opts.temperature ?? 0.5,
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
    void recordEngineRun({
      engine: `LLM::${result.provider}`,
      ok: true,
      durationMs: Date.now() - started,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      detail: { model: result.model },
    }).catch(() => undefined)
    // v4.0 — Phase 7 : chaque succès alimente le Performance Registry.
    void recordPerformance({
      provider: result.provider,
      model: result.model,
      taskType: opts.taskType ?? "CHAT",
      success: true,
      executionMs: result.latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      taskId: opts.taskId,
      userId: opts.userId,
    }).catch(() => undefined)
    return result
  } catch (err) {
    otelEnd(span, "ERROR", {}, err instanceof Error ? err.message : String(err))
    void recordEngineRun({
      engine: "LLM::routing",
      ok: false,
      durationMs: Date.now() - started,
      errorCode: err instanceof LLMError ? err.code : "LLM_FAILED",
      detail: { error: err instanceof Error ? err.message.slice(0, 300) : String(err) },
    }).catch(() => undefined)
    // v4.0 — l'échec compte AUSSI pour l'apprentissage du routage.
    if (err instanceof LLMError && err.provider) {
      void recordPerformance({
        provider: err.provider,
        model: opts.model ?? "auto",
        taskType: opts.taskType ?? "CHAT",
        success: false,
        executionMs: Date.now() - started,
        errorType: err.code,
        taskId: opts.taskId,
        userId: opts.userId,
      }).catch(() => undefined)
    }
    throw err
  }
}
async function chatInner(opts: RoutingCallOptions): Promise<LLMResult> {
  // v4.0 — Phase 6 : routage INTELLIGENT (registre + performance apprise).
  // En cas d'indisponibilité du registre (base injoignable), repli sur le
  // routeCall() historique — le pipeline ne casse jamais.
  let decision: { provider: string; model: string; fallbackChain: string[] }
  let routingReason = ""
  let routedByV2 = false
  try {
    const intelligent = await selectModel(
      {
        prompt: opts.messages.map((m) => m.content).join("\n").slice(0, 8000),
        taskType: opts.taskType,
        requiredCapabilities: opts.json ? ["json-mode"] : undefined,
      },
      { userId: opts.userId, taskId: opts.taskId, traceSelection: true }
    )
    decision = {
      provider: intelligent.provider,
      model: intelligent.model,
      fallbackChain: intelligent.fallbackChain.map((f) => f.provider),
    }
    routingReason = intelligent.reason
    routedByV2 = true
  } catch {
    decision = routeCall(opts)
  }

  // Choix EXPLICITE de l'appelant : toujours honoré (surcouche utilisateur).
  if (opts.provider && opts.provider !== "auto") {
    decision = routeCall(opts)
    routedByV2 = false
  }

  // Modèle explicite : honoré sur le provider choisi.
  if (opts.model && opts.model !== "auto") {
    decision = { ...decision, model: opts.model }
  }

  const errors: string[] = []
  let lastCode = "ALL_PROVIDERS_FAILED"
  let lastProvider = decision.provider

  for (const provider of decision.fallbackChain) {
    try {
      const model =
        provider === decision.provider
          ? decision.model
          : routeCall({ ...opts, provider }).model
      let result: LLMResult
      if (provider === "zai") {
        result = await zaiChat(opts, model || "glm-4.6")
      } else if (provider === "gemini") {
        result = await geminiChat(opts, model || "gemini-2.0-flash")
      } else {
        result = await compatibleChat(provider, opts, model || "glm-4.5")
      }
      if (routedByV2 && routingReason) {
        // La raison de sélection est exposée via result (transparence v4).
        ;(result as LLMResult & { routingReason?: string }).routingReason = routingReason
      }
      return result
    } catch (err) {
      lastProvider = provider
      if (err instanceof LLMError) {
        lastCode = err.code
      }
      if (err instanceof LLMError && err.code === "MISSING_KEY") {
        errors.push(`${provider}: clé absente`)
        continue
      }
      errors.push(`${provider}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (decision.fallbackChain.length === 1 && errors.length === 1) {
    throw new LLMError(lastProvider, errors[0], lastCode)
  }
  throw new LLMError(
    lastProvider,
    `Tous les fournisseurs ont échoué — ${errors.join(" | ")}`,
    /429/.test(errors.join("")) ? "HTTP_429" : "ALL_PROVIDERS_FAILED"
  )
}

/** Gemini via l'adapter natif (generateContent). */
async function geminiChat(opts: LLMCallOptions, model: string): Promise<LLMResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new LLMError("gemini", "GEMINI_API_KEY absente.", "MISSING_KEY")
  const baseUrl = (process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "")
  const body = {
    contents: opts.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 4096,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  }
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
  } catch (err) {
    throw new LLMError("gemini", `Réseau indisponible : ${err instanceof Error ? err.message : String(err)}`, "NETWORK_ERROR")
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new LLMError("gemini", `HTTP ${res.status} — ${text.slice(0, 300)}`, `HTTP_${res.status}`)
  }
  const json = (await res.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  } | null
  if (!json) throw new LLMError("gemini", "Réponse JSON invalide.", "BAD_RESPONSE")
  const content = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
  if (!content) throw new LLMError("gemini", "Réponse vide du modèle.", "EMPTY_RESPONSE")
  return {
    content,
    provider: "gemini",
    model,
    tokensIn: Number(json.usageMetadata?.promptTokenCount ?? 0),
    tokensOut: Number(json.usageMetadata?.candidatesTokenCount ?? 0),
    latencyMs: Date.now() - started,
  }
}

export { MODEL_CATALOG, getAvailableProviders, isProviderAvailable, creditsForTokens } from "./router"
export { chatJSON, extractJson, StructuredOutputError } from "./structured"
export type { JSONCallResult } from "./structured"
export type { ModelInfo, TaskType, RoutingCallOptions } from "./types"
export { selectModel, selectModelDiversity } from "./router-v2"
export type { TaskContext, RoutingResultV2, CandidateModel } from "./router-v2"
export { recordPerformance, modelRanking, taskSuccessRate } from "./performance"
export { listModels as listRegistryModels, seedRegistry, syncFromHuggingFace, registryStats, invalidateRegistryCache, getModel as getRegistryModel } from "./model-registry"
export { huggingFaceProvider } from "./providers/huggingface"
export { getProvider, listProviders, isProviderConfigured } from "./providers/adapters"
export type { ModelProvider, ProviderCapabilities, ModelDescriptor } from "./providers/base"
