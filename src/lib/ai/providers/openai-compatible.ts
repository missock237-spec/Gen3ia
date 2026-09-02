import type { LLMCallOptions, LLMResult } from "../types"
import { LLMError } from "../types"
import { estimateTokens } from "./zai"

/**
 * Client partagé pour tous les fournisseurs compatibles OpenAI
 * (Zhipu GLM, OpenRouter, Groq, OpenAI, HuggingFace Router).
 * Chaque fournisseur est activé par sa variable d'environnement.
 */

export interface CompatibleProviderConfig {
  key: string
  name: string
  baseUrl: string
  envKey: string
  supportsJsonMode: boolean
}

export const COMPATIBLE_PROVIDERS: Record<string, CompatibleProviderConfig> = {
  glm: {
    key: "glm",
    name: "GLM (Zhipu BigModel)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    envKey: "GLM_API_KEY",
    supportsJsonMode: true,
  },
  openrouter: {
    key: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENROUTER_API_KEY",
    supportsJsonMode: true,
  },
  groq: {
    key: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    supportsJsonMode: false,
  },
  openai: {
    key: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    supportsJsonMode: true,
  },
  huggingface: {
    key: "huggingface",
    name: "HuggingFace",
    baseUrl: "https://router.huggingface.co/v1",
    envKey: "HUGGINGFACE_API_KEY",
    supportsJsonMode: false,
  },
}

 
function extractJsonBody(raw: any): any {
  // Certains fournisseurs renvoient des erreurs applicatives avec HTTP 200.
  if (raw && typeof raw === "object" && raw.error && !raw.choices) {
    const msg = typeof raw.error === "string" ? raw.error : raw.error.message
    throw new LLMError("provider", String(msg ?? "Erreur du fournisseur."), "PROVIDER_ERROR")
  }
  return raw
}

export async function compatibleChat(
  providerKey: string,
  opts: LLMCallOptions,
  model: string
): Promise<LLMResult> {
  const cfg = COMPATIBLE_PROVIDERS[providerKey]
  const apiKey = process.env[cfg.envKey]
  if (!apiKey) {
    throw new LLMError(providerKey, `Clé ${cfg.envKey} absente.`, "MISSING_KEY")
  }

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 4096,
  }
  if (opts.json && cfg.supportsJsonMode) {
    body.response_format = { type: "json_object" }
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }
  if (providerKey === "openrouter") {
    headers["HTTP-Referer"] = "https://gen3ia.app"
    headers["X-Title"] = "GEN3IA"
  }

  const started = Date.now()
  let res: Response
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
  } catch (err) {
    throw new LLMError(
      providerKey,
      `Réseau indisponible : ${err instanceof Error ? err.message : String(err)}`,
      "NETWORK_ERROR"
    )
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new LLMError(
      providerKey,
      `HTTP ${res.status} — ${text.slice(0, 300)}`,
      `HTTP_${res.status}`
    )
  }

   
  const raw: any = await res.json().catch(() => null)
  if (!raw) throw new LLMError(providerKey, "Réponse JSON invalide.", "BAD_RESPONSE")
   
  const c = extractJsonBody(raw) as any
  const content: string = c?.choices?.[0]?.message?.content ?? ""
  if (!content) {
    throw new LLMError(providerKey, "Réponse vide du modèle.", "EMPTY_RESPONSE")
  }
  return {
    content,
    provider: providerKey,
    model,
    tokensIn: Number(c?.usage?.prompt_tokens ?? estimateTokens(opts.messages)),
    tokensOut: Number(c?.usage?.completion_tokens ?? estimateTokens([{ content }])),
    latencyMs: Date.now() - started,
  }
}
