import type {
  ModelProvider,
  ProviderCapabilities,
  ProviderMetadata,
  GenerateRequest,
  GenerateResult,
  StreamChunk,
  EmbedRequest,
  EmbedResult,
  VisionRequest,
  VisionResult,
  HealthStatus,
  CostEstimate,
  ModelDescriptor,
} from "./base"
import { UnsupportedError, boundedHealthCheck } from "./base"
import { zaiChat } from "./zai"
import { compatibleChat, COMPATIBLE_PROVIDERS } from "./openai-compatible"
import { MODEL_CATALOG } from "../router"
import type { TaskType, LLMCallOptions } from "../types"
import { LLMError } from "../types"

/**
 * Adapters des fournisseurs existants (v4.0 — Phase 3).
 *
 * Les implémentations zai/openai-compatible SONT réutilisées telles quelles
 * (aucune réécriture) : ces classes ne font que les projeter dans le contrat
 * ModelProvider pour que le Model Router v4 puisse raisonner uniformément.
 */

function catalogFor(provider: string): ModelDescriptor[] {
  return MODEL_CATALOG.filter((m) => m.provider === provider).map((m) => ({
    provider: m.provider,
    modelId: m.key.includes("/") ? m.key.split("/").slice(1).join("/") : m.key,
    name: m.name,
    modality: "text" as const,
    supportedTasks: m.strengths as TaskType[],
    contextLength: m.contextTokens,
    capabilities: ["generation"],
    tags: [],
  }))
}

function toLlmOptions(req: GenerateRequest): LLMCallOptions {
  return {
    messages: req.messages,
    temperature: req.temperature,
    maxTokens: req.maxTokens,
    json: req.json,
    taskType: req.taskType,
    signal: req.signal,
  } as LLMCallOptions
}

function estimateFromCatalog(
  providerKey: string,
  model: string,
  tokensIn: number,
  tokensOut: number
): CostEstimate {
  const entry = MODEL_CATALOG.find(
    (m) => m.provider === providerKey && (m.key.endsWith(model) || model.endsWith(m.key.split("/").pop() ?? "@@"))
  )
  const creditsIn = entry ? (tokensIn / 1000) * entry.creditsPerKIn : tokensIn / 4000
  const creditsOut = entry ? (tokensOut / 1000) * entry.creditsPerKOut : tokensOut / 4000
  return {
    provider: providerKey,
    model,
    creditsIn: Math.round(creditsIn * 1000) / 1000,
    creditsOut: Math.round(creditsOut * 1000) / 1000,
    creditsTotal: Math.round((creditsIn + creditsOut) * 1000) / 1000,
  }
}

/** Base commune aux fournisseurs compatibles OpenAI existants. */
class CompatibleAdapter implements ModelProvider {
  readonly key: string
  readonly name: string
  private readonly capabilities: ProviderCapabilities

  constructor(providerKey: string, capabilities?: Partial<ProviderCapabilities>) {
    const cfg = COMPATIBLE_PROVIDERS[providerKey]
    if (!cfg) throw new Error(`Fournisseur inconnu: ${providerKey}`)
    this.key = cfg.key
    this.name = cfg.name
    this.capabilities = {
      generation: true,
      streaming: false,
      embeddings: false,
      vision: false,
      jsonMode: cfg.supportsJsonMode,
      dedicatedEndpoints: false,
      asyncJobs: false,
      objectStorage: false,
      ...capabilities,
    }
  }

  getMetadata(): ProviderMetadata {
    return {
      key: this.key,
      name: this.name,
      envKey: COMPATIBLE_PROVIDERS[this.key].envKey,
      capabilities: this.capabilities,
    }
  }

  isConfigured(): boolean {
    return Boolean(process.env[COMPATIBLE_PROVIDERS[this.key].envKey])
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    // Réutilise l'implémentation existante (repli, erreurs, timing identiques).
    const result = await compatibleChat(this.key, toLlmOptions(req), req.model)
    return { ...result, provider: this.key }
  }

  async *stream(_req: GenerateRequest): AsyncIterable<StreamChunk> {
    throw new UnsupportedError(this.key, "streaming")
  }

  async embed(_req: EmbedRequest): Promise<EmbedResult> {
    throw new UnsupportedError(this.key, "embeddings")
  }

  async vision(_req: VisionRequest): Promise<VisionResult> {
    throw new UnsupportedError(this.key, "vision")
  }

  async healthCheck(): Promise<HealthStatus> {
    const envKey = COMPATIBLE_PROVIDERS[this.key].envKey
    if (!process.env[envKey]) {
      return { provider: this.key, healthy: false, latencyMs: 0, detail: `Clé ${envKey} absente` }
    }
    const baseUrl = COMPATIBLE_PROVIDERS[this.key].baseUrl
    // Ping léger : liste des modèles (coût nul, typique /v1/models).
    return boundedHealthCheck(this.key, async () => {
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${process.env[envKey]}` },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    })
  }

  estimateCost(model: string, tokensIn: number, tokensOut: number): CostEstimate {
    return estimateFromCatalog(this.key, model, tokensIn, tokensOut)
  }

  async listModels(): Promise<ModelDescriptor[]> {
    return catalogFor(this.key)
  }

  async getModelMetadata(model: string): Promise<ModelDescriptor | null> {
    return catalogFor(this.key).find((m) => m.modelId === model) ?? null
  }
}

/** GLM (Zhipu) — via l'implémentation compatible existante. */
export class GLMProvider extends CompatibleAdapter {
  constructor() {
    super("glm")
  }
}

/** OpenRouter — multi-modèles (catalogue large). */
export class OpenRouterProvider extends CompatibleAdapter {
  constructor() {
    super("openrouter", { streaming: true })
  }
}

/** Groq — inférence ultra-rapide. */
export class GroqProvider extends CompatibleAdapter {
  constructor() {
    super("groq", { streaming: true })
  }
}

/** OpenAI — générations + embeddings + vision. */
export class OpenAIProvider extends CompatibleAdapter {
  constructor() {
    super("openai", { streaming: true, embeddings: true, vision: true })
  }

  async embed(req: EmbedRequest): Promise<EmbedResult> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new UnsupportedError(this.key, "embeddings (clé absente)")
    const baseUrl = (process.env.EMBEDDINGS_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "")
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: req.model,
        input: req.texts,
        ...(req.dimensions ? { dimensions: req.dimensions } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new LLMError(this.key, `Embeddings HTTP ${res.status}`, `HTTP_${res.status}`)
    const body = (await res.json()) as { data: Array<{ embedding: number[] }> }
    return {
      vectors: body.data.map((d) => d.embedding),
      model: req.model,
      dim: body.data[0]?.embedding.length ?? 0,
      tokens: req.texts.reduce((a, t) => a + Math.ceil(t.length / 4), 0),
    }
  }

  async vision(req: VisionRequest): Promise<VisionResult> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new UnsupportedError(this.key, "vision (clé absente)")
    const started = Date.now()
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: req.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: req.prompt },
              {
                type: "image_url",
                image_url: {
                  url: req.mimeType ? `data:${req.mimeType};base64,${req.image}` : req.image,
                },
              },
            ],
          },
        ],
        max_tokens: req.maxTokens ?? 1024,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw new LLMError(this.key, `Vision HTTP ${res.status}`, `HTTP_${res.status}`)
    const body = (await res.json()) as {
      choices: Array<{ message: { content: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    return {
      description: body.choices?.[0]?.message?.content ?? "",
      provider: this.key,
      model: req.model,
      tokensIn: Number(body.usage?.prompt_tokens ?? 0),
      tokensOut: Number(body.usage?.completion_tokens ?? 0),
      latencyMs: Date.now() - started,
    }
  }
}

/** ZAI (GLM intégré) — via l'implémentation SDK existante. */
export class ZaiProvider implements ModelProvider {
  readonly key = "zai"
  readonly name = "GLM intégré (ZAI)"

  getMetadata(): ProviderMetadata {
    return {
      key: this.key,
      name: this.name,
      envKey: "ZAI_API_KEY",
      capabilities: {
        generation: true,
        streaming: false,
        embeddings: false,
        vision: true,
        jsonMode: true,
        dedicatedEndpoints: false,
        asyncJobs: false,
        objectStorage: false,
      },
    }
  }

  isConfigured(): boolean {
    return Boolean(process.env.ZAI_API_KEY ?? process.env.Z_AI_API_KEY)
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const result = await zaiChat(toLlmOptions(req), req.model || "glm-4.6")
    return { ...result, provider: this.key }
  }

  async *stream(_req: GenerateRequest): AsyncIterable<StreamChunk> {
    throw new UnsupportedError(this.key, "streaming")
  }

  async embed(_req: EmbedRequest): Promise<EmbedResult> {
    throw new UnsupportedError(this.key, "embeddings")
  }

  async vision(_req: VisionRequest): Promise<VisionResult> {
    throw new UnsupportedError(this.key, "vision (utiliser l'API multimodale dédiée)")
  }

  async healthCheck(): Promise<HealthStatus> {
    // Le SDK ZAI exige une clé — présence = prêt (le ping réel se fait au 1er appel).
    const has = Boolean(process.env.ZAI_API_KEY ?? process.env.Z_AI_API_KEY)
    return {
      provider: this.key,
      healthy: has,
      latencyMs: 0,
      detail: has ? "Clé présente" : "ZAI_API_KEY absente",
    }
  }

  estimateCost(model: string, tokensIn: number, tokensOut: number): CostEstimate {
    return estimateFromCatalog(this.key, model, tokensIn, tokensOut)
  }

  async listModels(): Promise<ModelDescriptor[]> {
    return catalogFor(this.key)
  }

  async getModelMetadata(model: string): Promise<ModelDescriptor | null> {
    return catalogFor(this.key).find((m) => m.modelId === model) ?? null
  }
}

/** Gemini (Google) — adapter natif (API generateContent officielle). */
export class GeminiProvider implements ModelProvider {
  readonly key = "gemini"
  readonly name = "Google Gemini"

  private static readonly MODELS: ModelDescriptor[] = [
    {
      provider: "gemini",
      modelId: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      modality: "multimodal",
      supportedTasks: ["ANALYSIS", "PLANNING", "EXECUTION", "CHAT", "VISION", "SUMMARIZATION"],
      contextLength: 1048576,
      capabilities: ["generation", "streaming", "vision", "long-context"],
      license: "google-apis-terms",
      tags: ["multimodal", "long-context", "fast"],
    },
    {
      provider: "gemini",
      modelId: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      modality: "multimodal",
      supportedTasks: ["ANALYSIS", "PLANNING", "EXECUTION", "CHAT", "VISION", "SUMMARIZATION"],
      contextLength: 1048576,
      capabilities: ["generation", "streaming", "vision", "long-context", "json-mode"],
      license: "google-apis-terms",
      tags: ["multimodal", "long-context"],
    },
    {
      provider: "gemini",
      modelId: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      modality: "multimodal",
      supportedTasks: ["ANALYSIS", "PLANNING", "VERIFICATION", "SUMMARIZATION"],
      contextLength: 1048576,
      capabilities: ["generation", "vision", "long-context", "reasoning"],
      license: "google-apis-terms",
      tags: ["reasoning", "premium"],
    },
  ]

  private baseUrl(): string {
    return (process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "")
  }

  private apiKey(): string | undefined {
    return process.env.GEMINI_API_KEY?.trim() || undefined
  }

  getMetadata(): ProviderMetadata {
    return {
      key: this.key,
      name: this.name,
      envKey: "GEMINI_API_KEY",
      capabilities: {
        generation: true,
        streaming: true,
        embeddings: false,
        vision: true,
        jsonMode: true,
        dedicatedEndpoints: false,
        asyncJobs: false,
        objectStorage: false,
      },
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey())
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const apiKey = this.apiKey()
    if (!apiKey) throw new LLMError(this.key, "GEMINI_API_KEY absente", "MISSING_KEY")
    const started = Date.now()
    const body = {
      contents: req.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens ?? 4096,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    }
    const res = await fetch(
      `${this.baseUrl()}/models/${req.model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: req.signal ?? AbortSignal.timeout(120_000),
      }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new LLMError(this.key, `HTTP ${res.status} — ${text.slice(0, 300)}`, `HTTP_${res.status}`)
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    }
    const content = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
    if (!content) throw new LLMError(this.key, "Réponse vide du modèle.", "EMPTY_RESPONSE")
    return {
      content,
      provider: this.key,
      model: req.model,
      tokensIn: Number(json.usageMetadata?.promptTokenCount ?? 0),
      tokensOut: Number(json.usageMetadata?.candidatesTokenCount ?? 0),
      latencyMs: Date.now() - started,
    }
  }

  async *stream(_req: GenerateRequest): AsyncIterable<StreamChunk> {
    // Streaming natif streamGenerateContent — implémenté à la demande du routeur.
    throw new UnsupportedError(this.key, "streaming (prévu : streamGenerateContent)")
  }

  async embed(_req: EmbedRequest): Promise<EmbedResult> {
    // Gemini text-embedding via :embedContent — réservé au RAG (voir lib/rag).
    throw new UnsupportedError(this.key, "embeddings (prévu : embedContent)")
  }

  async vision(req: VisionRequest): Promise<VisionResult> {
    const apiKey = this.apiKey()
    if (!apiKey) throw new LLMError(this.key, "GEMINI_API_KEY absente", "MISSING_KEY")
    const started = Date.now()
    const res = await fetch(
      `${this.baseUrl()}/models/${req.model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: req.prompt },
                {
                  inlineData: req.mimeType
                    ? { mimeType: req.mimeType, data: req.image }
                    : { fileData: { fileUri: req.image } },
                },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: req.maxTokens ?? 1024 },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new LLMError(this.key, `Vision HTTP ${res.status} — ${text.slice(0, 200)}`, `HTTP_${res.status}`)
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    }
    return {
      description: json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
      provider: this.key,
      model: req.model,
      tokensIn: Number(json.usageMetadata?.promptTokenCount ?? 0),
      tokensOut: Number(json.usageMetadata?.candidatesTokenCount ?? 0),
      latencyMs: Date.now() - started,
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const apiKey = this.apiKey()
    if (!apiKey) return { provider: this.key, healthy: false, latencyMs: 0, detail: "GEMINI_API_KEY absente" }
    return boundedHealthCheck(this.key, async () => {
      const res = await fetch(`${this.baseUrl()}/models?key=${apiKey}`, {
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    })
  }

  estimateCost(model: string, tokensIn: number, tokensOut: number): CostEstimate {
    const premium = model.includes("pro")
    const creditsIn = (tokensIn / 1000) * (premium ? 1.25 : 0.1)
    const creditsOut = (tokensOut / 1000) * (premium ? 5 : 0.4)
    return {
      provider: this.key,
      model,
      creditsIn: Math.round(creditsIn * 1000) / 1000,
      creditsOut: Math.round(creditsOut * 1000) / 1000,
      creditsTotal: Math.round((creditsIn + creditsOut) * 1000) / 1000,
    }
  }

  async listModels(): Promise<ModelDescriptor[]> {
    return GeminiProvider.MODELS
  }

  async getModelMetadata(model: string): Promise<ModelDescriptor | null> {
    return GeminiProvider.MODELS.find((m) => m.modelId === model) ?? null
  }
}

/** Provider générique configurable par variables d'environnement (aucun code). */
export class CustomProvider implements ModelProvider {
  readonly key: string
  readonly name: string

  constructor(
    key: string,
    private readonly baseUrl: string,
    private readonly envKey: string,
    private readonly defaultModel: string
  ) {
    this.key = key
    this.name = `Custom (${key})`
  }

  getMetadata(): ProviderMetadata {
    return {
      key: this.key,
      name: this.name,
      envKey: this.envKey,
      capabilities: {
        generation: true,
        streaming: false,
        embeddings: false,
        vision: false,
        jsonMode: false,
        dedicatedEndpoints: false,
        asyncJobs: false,
        objectStorage: false,
      },
    }
  }

  isConfigured(): boolean {
    return Boolean(process.env[this.envKey] && process.env[this.baseUrl] === undefined ? false : process.env[this.envKey])
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const apiKey = process.env[this.envKey]
    const url = (process.env[this.baseUrl] ?? "").replace(/\/$/, "")
    if (!apiKey || !url) {
      throw new LLMError(this.key, `${this.envKey}/${this.baseUrl} absents`, "MISSING_KEY")
    }
    const started = Date.now()
    const res = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: req.model || this.defaultModel,
        messages: req.messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 4096,
      }),
      signal: req.signal ?? AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new LLMError(this.key, `HTTP ${res.status} — ${text.slice(0, 300)}`, `HTTP_${res.status}`)
    }
    const raw = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const content = raw.choices?.[0]?.message?.content ?? ""
    if (!content) throw new LLMError(this.key, "Réponse vide.", "EMPTY_RESPONSE")
    return {
      content,
      provider: this.key,
      model: req.model || this.defaultModel,
      tokensIn: Number(raw.usage?.prompt_tokens ?? 0),
      tokensOut: Number(raw.usage?.completion_tokens ?? 0),
      latencyMs: Date.now() - started,
    }
  }

  async *stream(_req: GenerateRequest): AsyncIterable<StreamChunk> {
    throw new UnsupportedError(this.key, "streaming")
  }

  async embed(_req: EmbedRequest): Promise<EmbedResult> {
    throw new UnsupportedError(this.key, "embeddings")
  }

  async vision(_req: VisionRequest): Promise<VisionResult> {
    throw new UnsupportedError(this.key, "vision")
  }

  async healthCheck(): Promise<HealthStatus> {
    const apiKey = process.env[this.envKey]
    const url = process.env[this.baseUrl]
    if (!apiKey || !url) {
      return { provider: this.key, healthy: false, latencyMs: 0, detail: "non configuré" }
    }
    return boundedHealthCheck(this.key, async () => {
      const res = await fetch(`${url.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    })
  }

  estimateCost(model: string, tokensIn: number, tokensOut: number): CostEstimate {
    const credits = Math.max(0.01, (tokensIn + tokensOut) / 4000)
    return { provider: this.key, model, creditsIn: credits / 2, creditsOut: credits / 2, creditsTotal: Math.round(credits * 1000) / 1000 }
  }

  async listModels(): Promise<ModelDescriptor[]> {
    return [
      {
        provider: this.key,
        modelId: this.defaultModel,
        name: `Modèle par défaut ${this.key}`,
        modality: "text",
        supportedTasks: ["EXECUTION", "CHAT"],
        contextLength: 32768,
        capabilities: ["generation"],
        tags: [],
      },
    ]
  }

  async getModelMetadata(model: string): Promise<ModelDescriptor | null> {
    const models = await this.listModels()
    return models.find((m) => m.modelId === model) ?? null
  }
}

// ─────────────────────────────────────────────────────────────
// Registre des providers (source unique pour le Model Router)
// ─────────────────────────────────────────────────────────────

import { huggingFaceProvider } from "./huggingface"
import { hasZaiConfig } from "@/lib/config"

const registry = new Map<string, ModelProvider>()

function register(p: ModelProvider) {
  registry.set(p.key, p)
}

register(huggingFaceProvider)
register(new GeminiProvider())
register(new ZaiProvider())
register(new GLMProvider())
register(new OpenRouterProvider())
register(new GroqProvider())
register(new OpenAIProvider())

// Providers custom configurables : CUSTOM_PROVIDER_<KEY>_URL + CUSTOM_PROVIDER_<KEY>_KEY
// (ex: CUSTOM_PROVIDER_MISTRAL_URL, CUSTOM_PROVIDER_MISTRAL_KEY, CUSTOM_PROVIDER_MISTRAL_MODEL)
for (const [envName] of Object.entries(process.env)) {
  const m = /^CUSTOM_PROVIDER_([A-Z0-9_]+)_URL$/.exec(envName)
  if (m) {
    const key = m[1].toLowerCase()
    register(
      new CustomProvider(
        key,
        `CUSTOM_PROVIDER_${m[1]}_URL`,
        `CUSTOM_PROVIDER_${m[1]}_KEY`,
        process.env[`CUSTOM_PROVIDER_${m[1]}_MODEL`] ?? "default"
      )
    )
  }
}

export function getProvider(key: string): ModelProvider | undefined {
  return registry.get(key)
}

export function listProviders(): ModelProvider[] {
  return [...registry.values()]
}

export function isProviderConfigured(key: string): boolean {
  const p = registry.get(key)
  if (!p) return false
  const anyP = p as unknown as { isConfigured?: () => boolean }
  if (typeof anyP.isConfigured === "function") return anyP.isConfigured()
  const meta = p.getMetadata()
  return Boolean(process.env[meta.envKey])
}

export { registry as providerRegistry }
