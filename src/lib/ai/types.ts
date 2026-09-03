/** Types partagés de la couche IA GEN3IA. */

export type ChatRole = "system" | "user" | "assistant"

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface LLMCallOptions {
  messages: ChatMessage[]
  provider?: string // forcé par l'appelant, sinon routage automatique
  model?: string
  temperature?: number
  maxTokens?: number
  json?: boolean // indique au modèle qu'une sortie JSON est attendue
  taskType?: TaskType
}

/** Options d'appel étendues (traçabilité v4.0 — jamais requises par les moteurs). */
export type RoutingCallOptions = LLMCallOptions & {
  userId?: string
  taskId?: string
  agentId?: string
}

export type TaskType =
  | "ANALYSIS"
  | "PLANNING"
  | "EXECUTION"
  | "VERIFICATION"
  | "LEARNING"
  | "CHAT"
  | "SUMMARIZATION"
  | "EMBEDDING"
  | "VISION"

export interface LLMResult {
  content: string
  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  latencyMs: number
}

export class LLMError extends Error {
  code: string
  provider: string

  constructor(provider: string, message: string, code = "LLM_ERROR") {
    super(message)
    this.provider = provider
    this.code = code
  }
}

/** Aucun fournisseur LLM configuré — erreur explicite et actionnable. */
export class NoProviderError extends Error {
  constructor() {
    super(
      "Aucun fournisseur de modèle n'est configuré. Ajoutez GLM_API_KEY (ou OPENROUTER_API_KEY, GROQ_API_KEY, OPENAI_API_KEY, HUGGINGFACE_API_KEY) dans les variables d'environnement."
    )
  }
}

export interface ModelInfo {
  key: string
  name: string
  provider: string
  strengths: TaskType[]
  creditsPerKIn: number
  creditsPerKOut: number
  contextTokens: number
}
