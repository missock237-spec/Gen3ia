import type { LLMCallOptions, ModelInfo, TaskType } from "./types"
import { NoProviderError } from "./types"
import { hasZaiConfig } from "@/lib/config"
import { COMPATIBLE_PROVIDERS } from "./providers/openai-compatible"

/**
 * Model Router — sélectionne le fournisseur et le modèle optimaux
 * selon le type de tâche, la disponibilité (clés présentes) et le coût.
 */

export const MODEL_CATALOG: ModelInfo[] = [
  {
    key: "zai/glm-4.6",
    name: "GLM-4.6 (intégré)",
    provider: "zai",
    strengths: ["ANALYSIS", "PLANNING", "EXECUTION", "VERIFICATION", "LEARNING", "CHAT"],
    creditsPerKIn: 0.4,
    creditsPerKOut: 1.2,
    contextTokens: 128000,
  },
  {
    key: "glm/glm-4.5",
    name: "GLM-4.5 (Zhipu)",
    provider: "glm",
    strengths: ["ANALYSIS", "PLANNING", "EXECUTION", "CHAT"],
    creditsPerKIn: 0.4,
    creditsPerKOut: 1.2,
    contextTokens: 128000,
  },
  {
    key: "glm/glm-4-flash",
    name: "GLM-4-Flash (Zhipu)",
    provider: "glm",
    strengths: ["VERIFICATION", "SUMMARIZATION", "LEARNING"],
    creditsPerKIn: 0.05,
    creditsPerKOut: 0.15,
    contextTokens: 128000,
  },
  {
    key: "openrouter/z-ai/glm-4.6",
    name: "GLM-4.6 (OpenRouter)",
    provider: "openrouter",
    strengths: ["ANALYSIS", "PLANNING", "EXECUTION", "CHAT"],
    creditsPerKIn: 0.5,
    creditsPerKOut: 1.5,
    contextTokens: 128000,
  },
  {
    key: "openrouter/openai/gpt-4o-mini",
    name: "GPT-4o-mini (OpenRouter)",
    provider: "openrouter",
    strengths: ["VERIFICATION", "SUMMARIZATION"],
    creditsPerKIn: 0.15,
    creditsPerKOut: 0.6,
    contextTokens: 128000,
  },
  {
    key: "groq/llama-3.3-70b-versatile",
    name: "Llama 3.3 70B (Groq)",
    provider: "groq",
    strengths: ["EXECUTION", "VERIFICATION", "SUMMARIZATION", "LEARNING"],
    creditsPerKIn: 0.06,
    creditsPerKOut: 0.2,
    contextTokens: 128000,
  },
  {
    key: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    strengths: ["ANALYSIS", "PLANNING", "EXECUTION", "CHAT"],
    creditsPerKIn: 2.5,
    creditsPerKOut: 10,
    contextTokens: 128000,
  },
  {
    key: "huggingface/meta-llama/Llama-3.3-70B-Instruct",
    name: "Llama 3.3 70B (HF)",
    provider: "huggingface",
    strengths: ["EXECUTION", "SUMMARIZATION"],
    creditsPerKIn: 0.1,
    creditsPerKOut: 0.3,
    contextTokens: 32000,
  },
]

/** Priorité des fournisseurs par type de tâche (le meilleur en premier). */
const PROVIDER_PRIORITY: Record<TaskType, string[]> = {
  ANALYSIS: ["zai", "glm", "openrouter", "groq", "openai", "huggingface"],
  PLANNING: ["zai", "glm", "openrouter", "groq", "openai", "huggingface"],
  EXECUTION: ["zai", "groq", "glm", "openrouter", "openai", "huggingface"],
  VERIFICATION: ["zai", "glm", "groq", "openrouter", "openai", "huggingface"],
  LEARNING: ["zai", "groq", "glm", "openrouter", "openai", "huggingface"],
  CHAT: ["zai", "glm", "openrouter", "groq", "openai", "huggingface"],
  SUMMARIZATION: ["zai", "groq", "glm", "openrouter", "openai", "huggingface"],
  EMBEDDING: ["openai", "huggingface", "zai", "glm", "openrouter", "groq"],
  VISION: ["gemini", "zai", "huggingface", "openrouter", "openai", "glm"],
}

/** Ordre de repli global. */
const FALLBACK_ORDER = ["zai", "glm", "openrouter", "groq", "openai", "huggingface"]

import { getDisabledProvidersSync } from "@/lib/observability/model-health"

export function getAvailableProviders(): string[] {
  const available: string[] = []
  if (hasZaiConfig()) available.push("zai")
  for (const cfg of Object.values(COMPATIBLE_PROVIDERS)) {
    if (process.env[cfg.envKey]) available.push(cfg.key)
  }
  return available
}

export function isProviderAvailable(provider: string): boolean {
  return getAvailableProviders().includes(provider)
}

export interface RoutingDecision {
  provider: string
  model: string
  fallbackChain: string[]
}

/** Choisit le modèle pour un appel : explicite > modèle par défaut utilisateur > routage par tâche. */
export function routeCall(opts: LLMCallOptions): RoutingDecision {
  // v3.6 — bascule manuelle admin : les fournisseurs désactivés sortent
  // de la chaîne de repli (l'EXPLICITE opts.provider reste prioritaire).
  const disabled = getDisabledProvidersSync()
  const all = getAvailableProviders()
  const available = disabled.size > 0 ? all.filter((p) => !disabled.has(p) || p === opts.provider) : all

  if (available.length === 0) {
    throw new NoProviderError()
  }

  // 1. Choix explicite du fournisseur.
  if (opts.provider && opts.provider !== "auto") {
    const provider = opts.provider
    if (!available.includes(provider)) {
      throw new Error(
        `Fournisseur « ${provider} » non configuré. Ajoutez la clé correspondante dans les variables d'environnement.`
      )
    }
    const model =
      opts.model && opts.model !== "auto"
        ? opts.model
        : defaultModelFor(provider, opts.taskType ?? "CHAT")
    return { provider, model, fallbackChain: buildChain(available, provider) }
  }

  // 2. Routage par type de tâche.
  const taskType: TaskType = opts.taskType ?? "CHAT"
  for (const provider of PROVIDER_PRIORITY[taskType]) {
    if (available.includes(provider)) {
      const model =
        opts.model && opts.model !== "auto"
          ? opts.model
          : defaultModelFor(provider, taskType)
      return { provider, model, fallbackChain: buildChain(available, provider) }
    }
  }

  // 3. Repli global.
  const provider = available[0]
  return {
    provider,
    model: opts.model && opts.model !== "auto" ? opts.model : defaultModelFor(provider, taskType),
    fallbackChain: buildChain(available, provider),
  }
}

function defaultModelFor(provider: string, taskType: TaskType): string {
  const models = MODEL_CATALOG.filter((m) => m.provider === provider)
  if (models.length === 0) {
    // Modèle raisonnable par défaut si absent du catalogue.
    return provider === "groq"
      ? "llama-3.3-70b-versatile"
      : provider === "openai"
        ? "gpt-4o-mini"
        : provider === "huggingface"
          ? "meta-llama/Llama-3.3-70B-Instruct"
          : provider === "openrouter"
            ? "z-ai/glm-4.6"
            : "glm-4.5"
  }
  const byStrength = models.find((m) => m.strengths.includes(taskType))
  return (byStrength ?? models[0]).key.split("/").slice(1).join("/") || models[0].key
}

function buildChain(available: string[], primary: string): string[] {
  return [primary, ...available.filter((p) => p !== primary)].slice(0, 3)
}

/** Coût en crédits d'un appel (utilisé par le Credit Ledger). */
export function creditsForTokens(
  provider: string,
  model: string,
  tokensIn: number,
  tokensOut: number
): number {
  const entry = MODEL_CATALOG.find(
    (m) => m.provider === provider && (m.key.endsWith(model) || model.endsWith(m.key.split("/").pop() ?? "@@"))
  )
  if (!entry) return Math.max(0.01, (tokensIn + tokensOut) / 4000)
  const cost =
    (tokensIn / 1000) * entry.creditsPerKIn + (tokensOut / 1000) * entry.creditsPerKOut
  return Math.round(cost * 1000) / 1000
}
