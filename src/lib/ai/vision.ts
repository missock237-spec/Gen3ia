import type { LLMResult } from "./types"
import { LLMError } from "./types"
import { getZai } from "./providers/zai"
import { estimateTokens } from "./providers/zai"
import { COMPATIBLE_PROVIDERS } from "./providers/openai-compatible"

/**
 * Vision — inférence multimodale (image + texte) pour le copilote live.
 * Chaîne de repli réelle : ZAI (GLM multimodal intégré) → Zhipu GLM-4V →
 * OpenRouter (modèles vision) → OpenAI (gpt-4o). Chaque maillon est tenté
 * avec le contenu image ; si aucun n'est disponible, erreur explicite.
 */

/** Partie de contenu multimodal au format OpenAI. */
export type VisionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export interface VisionCallOptions {
  system: string
  prompt: string
  /** Data URL (data:image/jpeg;base64,…) — la capture d'écran courante. */
  imageDataUrl?: string
  temperature?: number
  maxTokens?: number
}

/** Fournisseurs capables de vision : modèle vision par fournisseur. */
const VISION_CHAIN: Array<{ provider: string; model: string; envKey?: string }> = [
  { provider: "zai", model: "glm-4.6" },
  { provider: "glm", model: "glm-4v-flash", envKey: "GLM_API_KEY" },
  { provider: "openrouter", model: "openai/gpt-4o-mini", envKey: "OPENROUTER_API_KEY" },
  { provider: "openai", model: "gpt-4o", envKey: "OPENAI_API_KEY" },
]

/** Construit le tableau de messages multimodal (système + utilisateur + image). */
export function buildMessages(opts: VisionCallOptions): Array<Record<string, unknown>> {
  const userContent: VisionContentPart[] = [{ type: "text", text: opts.prompt }]
  if (opts.imageDataUrl) {
    userContent.push({ type: "image_url", image_url: { url: opts.imageDataUrl } })
  }
  return [
    { role: "system", content: opts.system },
    { role: "user", content: userContent },
  ]
}

/** Appel ZAI (SDK intégré) — supporte le contenu multimodal nativement. */
async function zaiVision(opts: VisionCallOptions, model: string): Promise<LLMResult> {
  const zai = await getZai()
  const started = Date.now()
  const completion = await zai.chat.completions.create({
    model,
    messages: buildMessages(opts),
    thinking: { type: "disabled" },
    temperature: opts.temperature ?? 0.5,
    max_tokens: opts.maxTokens ?? 700,
  })
  const c = completion as any
  const content: string = c?.choices?.[0]?.message?.content ?? ""
  if (!content) {
    throw new LLMError("zai", "Réponse vision vide du modèle GLM.", "EMPTY_RESPONSE")
  }
  return {
    content,
    provider: "zai",
    model,
    tokensIn: Number(c?.usage?.prompt_tokens ?? estimateTokens([{ content: opts.prompt }])),
    tokensOut: Number(c?.usage?.completion_tokens ?? estimateTokens([{ content }])),
    latencyMs: Date.now() - started,
  }
}

/** Appel fournisseur compatible OpenAI (Zhipu GLM-4V / OpenRouter / OpenAI). */
async function compatibleVision(
  providerKey: string,
  model: string,
  opts: VisionCallOptions,
  apiKey: string
): Promise<LLMResult> {
  const cfg = COMPATIBLE_PROVIDERS[providerKey]
  const started = Date.now()

  const body: Record<string, unknown> = {
    model,
    messages: buildMessages(opts),
    temperature: opts.temperature ?? 0.5,
    max_tokens: opts.maxTokens ?? 700,
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }
  if (providerKey === "openrouter") {
    headers["HTTP-Referer"] = "https://gen3ia.app"
    headers["X-Title"] = "GEN3IA"
  }

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new LLMError(providerKey, `HTTP ${res.status} — ${text.slice(0, 250)}`, `HTTP_${res.status}`)
  }
  const raw: any = await res.json().catch(() => null)
  if (!raw) throw new LLMError(providerKey, "Réponse JSON invalide.", "BAD_RESPONSE")
  const content: string = raw?.choices?.[0]?.message?.content ?? ""
  if (!content) throw new LLMError(providerKey, "Réponse vision vide du modèle.", "EMPTY_RESPONSE")
  return {
    content,
    provider: providerKey,
    model,
    tokensIn: Number(raw?.usage?.prompt_tokens ?? estimateTokens([{ content: opts.prompt }])),
    tokensOut: Number(raw?.usage?.completion_tokens ?? estimateTokens([{ content }])),
    latencyMs: Date.now() - started,
  }
}

/** Vision chat — tente toute la chaîne, erreur actionnable si aucune config. */
export async function visionChat(opts: VisionCallOptions): Promise<LLMResult> {
  const errors: string[] = []

  for (const link of VISION_CHAIN) {
    try {
      if (link.provider === "zai") {
        return await zaiVision(opts, link.model)
      }
      const apiKey = link.envKey ? process.env[link.envKey] : undefined
      if (!apiKey) {
        errors.push(`${link.provider}: clé ${link.envKey} absente`)
        continue
      }
      return await compatibleVision(link.provider, link.model, opts, apiKey)
    } catch (err) {
      errors.push(`${link.provider}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  throw new LLMError(
    "vision",
    `Aucun fournisseur vision disponible — ${errors.join(" | ")}`,
    "VISION_NO_PROVIDER"
  )
}

/** Un fournisseur vision est-il configuré ? (health check UI) */
export function visionConfigured(): boolean {
  return VISION_CHAIN.some(
    (l) => l.provider === "zai" || (l.envKey ? Boolean(process.env[l.envKey]) : false)
  )
}
