import type { ChatMessage, TaskType } from "../types"

/**
 * Provider Abstraction — contrat commun à TOUS les fournisseurs de modèles
 * (v4.0 — Phase 3 de l'architecture Model & Compute Intelligence).
 *
 * RÈGLE ABSOLUE : ni le planner, ni l'orchestrateur, ni les agents n'appellent
 * jamais une API fournisseur directement. Ils passent par le Model Router,
 * qui ne connaît QUE cette abstraction. Ajouter un fournisseur = écrire un
 * adapter ici, jamais toucher au cœur.
 *
 * Les implémentations existantes (zai, openai-compatible) sont ENROBÉES par
 * des adapters (voir ./adapters.ts) — rien n'est recréé.
 */

/** Capacités déclarées d'un provider (pilotent le routage). */
export interface ProviderCapabilities {
  /** Génération de texte (chat/completions). */
  generation: boolean
/** Streaming token par token (SSE). */
  streaming: boolean
  /** Embeddings vectoriels. */
  embeddings: boolean
  /** Compréhension d'images (vision multimodale). */
  vision: boolean
  /** Mode JSON structuré garanti. */
  jsonMode: boolean
  /** Endpoints dédiés managés (compute garanti). */
  dedicatedEndpoints: boolean
  /** Jobs longs asynchrones (batch, fine-tuning…). */
  asyncJobs: boolean
  /** Stockage d'objets (buckets). */
  objectStorage: boolean
}

export interface ProviderMetadata {
  key: string
  name: string
  /** Variable d'environnement portant la clé API (jamais la clé elle-même). */
  envKey: string
  capabilities: ProviderCapabilities
}

/** Contexte d'un appel — enrichi par le Model Router avant exécution. */
export interface GenerateRequest {
  messages: ChatMessage[]
  model: string
  temperature?: number
  maxTokens?: number
  json?: boolean
  taskType?: TaskType
  /** Signal d'annulation (timeout, annulation utilisateur). */
  signal?: AbortSignal
}

export interface GenerateResult {
  content: string
  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  latencyMs: number
  /** Coût réel en crédits GEN3IA (calculé par le provider lui-même). */
  creditsCost?: number
}

export interface StreamChunk {
  delta: string
  done: boolean
  usage?: { tokensIn: number; tokensOut: number }
}

export interface EmbedRequest {
  texts: string[]
  model: string
  dimensions?: number
}

export interface EmbedResult {
  vectors: number[][]
  model: string
  dim: number
  tokens: number
}

export interface VisionRequest {
  /** Image encodée en base64 (sans préfixe data:) ou URL publique. */
  image: string
  /** Mime type quand image = base64 brut. */
  mimeType?: string
  prompt: string
  model: string
  maxTokens?: number
}

export interface VisionResult {
  description: string
  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  latencyMs?: number
}

export interface HealthStatus {
  provider: string
  healthy: boolean
  latencyMs: number
  detail?: string
}

export interface CostEstimate {
  provider: string
  model: string
  creditsIn: number
  creditsOut: number
  /** Estimation pour un appel type (tokensIn/tokensOut donnés). */
  creditsTotal: number
}

export interface ModelDescriptor {
  provider: string
  modelId: string
  name: string
  modality: "text" | "multimodal" | "image" | "audio" | "video"
  supportedTasks: TaskType[]
  contextLength: number
  capabilities: string[]
  license?: string
  tags?: string[]
}

/**
 * Contrat que tout fournisseur GEN3IA doit implémenter.
 * `stream` et `vision`/`embed` peuvent throw "UNSUPPORTED" — le router
 * filtre déjà sur getCapabilities() avant de sélectionner.
 */
export interface ModelProvider {
  readonly key: string
  readonly name: string

  /** Métadonnées + capacités déclarées. */
  getMetadata(): ProviderMetadata

  /** Génération de texte (REQUIS). */
  generate(req: GenerateRequest): Promise<GenerateResult>

  /** Streaming — UNSUPPORTED si le fournisseur ne le propose pas. */
  stream(req: GenerateRequest): AsyncIterable<StreamChunk>

  /** Embeddings — UNSUPPORTED sinon. */
  embed(req: EmbedRequest): Promise<EmbedResult>

  /** Vision multimodale — UNSUPPORTED sinon. */
  vision(req: VisionRequest): Promise<VisionResult>

  /** Ping santé (budget borné, JAMAIS de génération). */
  healthCheck(): Promise<HealthStatus>

  /** Estimation du coût en crédits avant exécution. */
  estimateCost(model: string, tokensIn: number, tokensOut: number): CostEstimate

  /** Catalogue des modèles exposés par ce provider (registre local). */
  listModels(): Promise<ModelDescriptor[]>

  /** Métadonnées d'un modèle précis (null si inconnu). */
  getModelMetadata(model: string): Promise<ModelDescriptor | null>
}

/** Erreur standard des providers non supportés. */
export class UnsupportedError extends Error {
  provider: string
  constructor(provider: string, feature: string) {
    super(`${provider} ne supporte pas « ${feature} ».`)
    this.provider = provider
    this.name = "UnsupportedError"
  }
}

/** Health check avec timeout borné (jamais de génération payante). */
export async function boundedHealthCheck(
  provider: string,
  probe: () => Promise<void>,
  timeoutMs = 8000
): Promise<HealthStatus> {
  const started = Date.now()
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs)
      ),
    ])
    return { provider, healthy: true, latencyMs: Date.now() - started }
  } catch (err) {
    return {
      provider,
      healthy: false,
      latencyMs: Date.now() - started,
      detail: err instanceof Error ? err.message.slice(0, 200) : String(err),
    }
  }
}
