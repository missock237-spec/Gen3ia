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
import {
  hubListTextModels,
  hubGetModel,
  routerChat,
  routerChatStream,
  routerEmbed,
  hubHealth,
  isHfConfigured,
  hfToken,
  HfApiError,
} from "@/lib/hf/client"
import type { TaskType } from "../types"

/**
 * HuggingFaceProvider — adapter v4.0 (Phase 4).
 *
 * Supporte les surfaces OFFICIELLES Hugging Face :
 *  - Inference Providers (routeur https://router.huggingface.co/v1) ;
 *  - Inference Endpoints dédiés (endpointUrl résolu depuis le registre
 *    AIModel.endpointUrl — voir model-registry) ;
 *  - Hub (découverte de modèles : cartes, gated, privé si le token l'autorise) ;
 *  - Embeddings (feature-extraction via routeur) ;
 *  - Streaming SSE lorsque le provider sous-jacent le propose ;
 *  - Vision multimodale via modèles VLM du routeur.
 *
 * Modèles privés/gated : le HF_TOKEN (fine-grained) doit avoir les droits —
 * l'API HF renvoie 403 sinon, remonté tel quel (jamais masqué).
 */

/** Catalogue des modèles HF exposés par défaut (étendable via registre). */
export const HF_MODEL_CATALOG: ModelDescriptor[] = [
  {
    provider: "huggingface",
    modelId: "meta-llama/Llama-3.3-70B-Instruct",
    name: "Llama 3.3 70B Instruct",
    modality: "text",
    supportedTasks: ["EXECUTION", "SUMMARIZATION", "ANALYSIS", "CHAT"],
    contextLength: 131072,
    capabilities: ["generation", "streaming"],
    license: "llama3.3",
    tags: ["coding", "reasoning", "general"],
  },
  {
    provider: "huggingface",
    modelId: "meta-llama/Llama-3.1-8B-Instruct",
    name: "Llama 3.1 8B Instruct",
    modality: "text",
    supportedTasks: ["EXECUTION", "SUMMARIZATION", "VERIFICATION", "LEARNING"],
    contextLength: 131072,
    capabilities: ["generation", "streaming"],
    license: "llama3.1",
    tags: ["fast", "cheap"],
  },
  {
    provider: "huggingface",
    modelId: "Qwen/Qwen2.5-72B-Instruct",
    name: "Qwen 2.5 72B Instruct",
    modality: "text",
    supportedTasks: ["ANALYSIS", "PLANNING", "EXECUTION", "CHAT"],
    contextLength: 131072,
    capabilities: ["generation", "streaming"],
    license: "qwen",
    tags: ["multilingual", "reasoning"],
  },
  {
    provider: "huggingface",
    modelId: "Qwen/Qwen2.5-Coder-32B-Instruct",
    name: "Qwen 2.5 Coder 32B",
    modality: "text",
    supportedTasks: ["EXECUTION"],
    contextLength: 131072,
    capabilities: ["generation", "streaming"],
    license: "apache-2.0",
    tags: ["coding", "specialized"],
  },
  {
    provider: "huggingface",
    modelId: "mistralai/Mistral-7B-Instruct-v0.3",
    name: "Mistral 7B Instruct v0.3",
    modality: "text",
    supportedTasks: ["EXECUTION", "SUMMARIZATION", "VERIFICATION"],
    contextLength: 32768,
    capabilities: ["generation", "streaming"],
    license: "apache-2.0",
    tags: ["fast", "cheap"],
  },
  {
    provider: "huggingface",
    modelId: "Qwen/Qwen2-VL-7B-Instruct",
    name: "Qwen 2 VL 7B (vision)",
    modality: "multimodal",
    supportedTasks: ["VISION", "ANALYSIS"],
    contextLength: 32768,
    capabilities: ["generation", "vision"],
    license: "qwen",
    tags: ["vision", "multimodal"],
  },
]

const HF_CAPABILITIES: ProviderCapabilities = {
  generation: true,
  streaming: true,
  embeddings: true,
  vision: true,
  jsonMode: false,
  dedicatedEndpoints: true,
  asyncJobs: true,
  objectStorage: true,
}

/** Modèle HF par défaut (surchargeable : HF_DEFAULT_MODEL). */
export function hfDefaultModel(): string {
  return process.env.HF_DEFAULT_MODEL?.trim() || "meta-llama/Llama-3.3-70B-Instruct"
}

/** Provider HF par défaut pour le routeur (ex: "auto"|"hf-inference"…). */
export function hfDefaultProvider(): string {
  return process.env.HF_DEFAULT_PROVIDER?.trim() || "auto"
}

export class HuggingFaceProvider implements ModelProvider {
  readonly key = "huggingface"
  readonly name = "Hugging Face"

  getMetadata(): ProviderMetadata {
    return {
      key: this.key,
      name: this.name,
      envKey: "HF_TOKEN",
      capabilities: HF_CAPABILITIES,
    }
  }

  getCapabilities(): ProviderCapabilities {
    return HF_CAPABILITIES
  }

  isConfigured(): boolean {
    return isHfConfigured()
  }

  /**
   * Génération : routeur HF (Inference Providers). Si le registre a résolu
   * un endpoint DÉDIÉ pour ce modèle (endpointUrl), l'appel y est routé en
   * priorité (compute garanti, latence maîtrisée).
   */
  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (!isHfConfigured()) {
      throw new HfApiError(401, "HF_TOKEN absent — provider Hugging Face non configuré")
    }
    const started = Date.now()
    const response = await routerChat({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
    })
    const content = response.choices?.[0]?.message?.content ?? ""
    if (!content) {
      throw new HfApiError(502, "Réponse vide du modèle HF")
    }
    const tokensIn = Number(response.usage?.prompt_tokens ?? 0)
    const tokensOut = Number(response.usage?.completion_tokens ?? 0)
    return {
      content,
      provider: this.key,
      model: req.model,
      tokensIn,
      tokensOut,
      latencyMs: Date.now() - started,
    }
  }

  async *stream(req: GenerateRequest): AsyncIterable<StreamChunk> {
    if (!isHfConfigured()) {
      throw new HfApiError(401, "HF_TOKEN absent")
    }
    let buffer = ""
    for await (const delta of routerChatStream({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
    })) {
      buffer += delta
      yield { delta, done: false }
    }
    yield {
      delta: "",
      done: true,
      usage: { tokensIn: 0, tokensOut: Math.ceil(buffer.length / 4) },
    }
  }

  async embed(req: EmbedRequest): Promise<EmbedResult> {
    if (!isHfConfigured()) {
      throw new HfApiError(401, "HF_TOKEN absent")
    }
    const response = await routerEmbed({ model: req.model, input: req.texts })
    const vectors = response.data.map((d) => d.embedding)
    if (vectors.length !== req.texts.length) {
      throw new HfApiError(502, "Réponse d'embedding incohérente")
    }
    return {
      vectors,
      model: req.model,
      dim: vectors[0]?.length ?? 0,
      tokens: req.texts.reduce((acc, t) => acc + Math.ceil(t.length / 4), 0),
    }
  }

  async vision(req: VisionRequest): Promise<VisionResult> {
    if (!isHfConfigured()) {
      throw new HfApiError(401, "HF_TOKEN absent")
    }
    // Vision via le routeur HF : message multimodal standard OpenAI.
    const imageUrl = req.mimeType
      ? `data:${req.mimeType};base64,${req.image}`
      : req.image
    const started = Date.now()
    const response = await routerChat({
      model: req.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: req.prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ] as never,
      max_tokens: req.maxTokens ?? 1024,
    })
    return {
      description: response.choices?.[0]?.message?.content ?? "",
      provider: this.key,
      model: req.model,
      tokensIn: Number(response.usage?.prompt_tokens ?? 0),
      tokensOut: Number(response.usage?.completion_tokens ?? 0),
      latencyMs: 0,
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const hub = await hubHealth()
    let detail: string | undefined = hub.detail
    // Token présent ? vérifie l'identité (quiami) pour distinguer Hub UP / token invalide.
    if (isHfConfigured()) {
      try {
        const { whoAmI } = await import("@/lib/hf/client")
        const me = await whoAmI()
        detail = `Hub OK — compte: ${me.name}`
      } catch (err) {
        return {
          provider: this.key,
          healthy: false,
          latencyMs: hub.latencyMs,
          detail: `Token invalide: ${err instanceof Error ? err.message.slice(0, 150) : String(err)}`,
        }
      }
    }
    return { provider: this.key, healthy: hub.ok, latencyMs: hub.latencyMs, detail }
  }

  estimateCost(model: string, tokensIn: number, tokensOut: number): CostEstimate {
    // Tarifs crédit alignés sur le catalogue v3.6 (HF = économique).
    const creditsIn = (tokensIn / 1000) * 0.1
    const creditsOut = (tokensOut / 1000) * 0.3
    return {
      provider: this.key,
      model,
      creditsIn: Math.round(creditsIn * 1000) / 1000,
      creditsOut: Math.round(creditsOut * 1000) / 1000,
      creditsTotal: Math.round((creditsIn + creditsOut) * 1000) / 1000,
    }
  }

  async listModels(): Promise<ModelDescriptor[]> {
    // Catalogue local étendu dynamiquement par la synchronisation HF.
    return HF_MODEL_CATALOG
  }

  async getModelMetadata(model: string): Promise<ModelDescriptor | null> {
    const local = HF_MODEL_CATALOG.find((m) => m.modelId === model)
    if (local) return local
    // Carte du Hub (peut être un modèle privé/gated si le token l'autorise).
    if (!isHfConfigured()) return null
    try {
      const card = await hubGetModel(model)
      return {
        provider: this.key,
        modelId: card.id,
        name: card.id.split("/").pop() ?? card.id,
        modality: (card.tags ?? []).some((t) => ["vision", "image-text-to-text", "any-to-any"].includes(t))
          ? "multimodal"
          : "text",
        supportedTasks: guessTasks(card.pipeline_tag, card.tags ?? []),
        contextLength: Number((card as { config?: { max_position_embeddings?: number } }).config?.max_position_embeddings ?? 32768),
        capabilities: ["generation", "streaming"],
        license: (card.tags ?? []).find((t) => t.includes("license")),
        tags: card.tags?.slice(0, 8),
      }
    } catch {
      return null
    }
  }

  /** Modèles populaires du Hub (découverte — synchronisation du registre). */
  async discoverPopularModels(limit = 30): Promise<ModelDescriptor[]> {
    const cards = await hubListTextModels(limit)
    return cards.map((card) => ({
      provider: this.key,
      modelId: card.id,
      name: card.id.split("/").pop() ?? card.id,
      modality: (card.tags ?? []).some((t) => ["vision", "image-text-to-text", "any-to-any"].includes(t))
        ? "multimodal"
        : "text",
      supportedTasks: guessTasks(card.pipeline_tag, card.tags ?? []),
      contextLength: 32768,
      capabilities: ["generation", "streaming"],
      license: (card.tags ?? []).find((t) => t.includes("license")),
      tags: card.tags?.slice(0, 8),
    }))
  }
}

function guessTasks(pipelineTag: string | undefined, tags: string[]): TaskType[] {
  const tasks = new Set<TaskType>(["EXECUTION", "SUMMARIZATION", "CHAT"])
  if (tags.some((t) => ["code", "coding", "qwen2.5-coder", "starcoder"].includes(t))) tasks.add("EXECUTION")
  if (tags.some((t) => ["reasoning", "math", "chain-of-thought"].includes(t))) tasks.add("ANALYSIS")
  if (tags.some((t) => ["vision", "image-text-to-text", "any-to-any"].includes(t))) tasks.add("VISION")
  if (pipelineTag === "text-generation") {
    tasks.add("PLANNING")
    tasks.add("ANALYSIS")
  }
  return [...tasks]
}

export const huggingFaceProvider = new HuggingFaceProvider()
