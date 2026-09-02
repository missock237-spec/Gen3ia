import type { LLMCallOptions, LLMResult } from "../types"
import { LLMError } from "../types"

/**
 * Fournisseur ZAI (GLM) — moteur d'inférence intégré à la plateforme.
 * Utilisé côté serveur uniquement ; la configuration (baseUrl/apiKey) est lue
 * par le SDK depuis les fichiers .z-ai-config, jamais exposée au client.
 */

 
let zaiInstance: any = null
let zaiInitPromise: Promise<unknown> | null = null

 
async function getZai(): Promise<any> {
  if (zaiInstance) return zaiInstance
  if (!zaiInitPromise) {
    zaiInitPromise = (async () => {
      const mod = await import("z-ai-web-dev-sdk")
      const ZAI = mod.default
      zaiInstance = await ZAI.create()
      return zaiInstance
    })().catch((err) => {
      zaiInitPromise = null
      throw new LLMError(
        "zai",
        `Initialisation ZAI impossible : ${err instanceof Error ? err.message : String(err)}`,
        "ZAI_INIT_FAILED"
      )
    })
  }
  await zaiInitPromise
  return zaiInstance
}

export async function isZaiAvailable(): Promise<boolean> {
  try {
    await getZai()
    return true
  } catch {
    return false
  }
}

export async function zaiChat(opts: LLMCallOptions, model: string): Promise<LLMResult> {
  const zai = await getZai()
  const started = Date.now()
   
  const attemptCall = async (): Promise<any> => {
    try {
      return await zai.chat.completions.create({
        messages: opts.messages,
        thinking: { type: "disabled" },
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4096,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Classe l'erreur pour l'auto-correction (429/5xx = transitoire).
      if (/status\s*429/i.test(msg)) {
        throw new LLMError("zai", `Limite de débit GLM (429) : ${msg.slice(0, 200)}`, "HTTP_429")
      }
      if (/status\s*5\d\d/i.test(msg)) {
        throw new LLMError("zai", `Erreur serveur GLM : ${msg.slice(0, 200)}`, "HTTP_500")
      }
      throw new LLMError("zai", `Appel GLM échoué : ${msg.slice(0, 200)}`, "ZAI_CALL_FAILED")
    }
  }

  let completion: unknown
  try {
    completion = await attemptCall()
  } catch (err) {
    if (err instanceof LLMError && (err.code === "HTTP_429" || err.code === "HTTP_500")) {
      // Une seule nouvelle tentative après temporisation (backoff).
      await new Promise((r) => setTimeout(r, 4000))
      completion = await attemptCall()
    } else {
      throw err
    }
  }

   
  const c = completion as any
  const content: string = c?.choices?.[0]?.message?.content ?? ""
  if (!content) {
    throw new LLMError("zai", "Réponse vide du modèle GLM.", "ZAI_EMPTY_RESPONSE")
  }
  return {
    content,
    provider: "zai",
    model,
    tokensIn: Number(c?.usage?.prompt_tokens ?? estimateTokens(opts.messages)),
    tokensOut: Number(c?.usage?.completion_tokens ?? estimateTokens([{ content }])),
    latencyMs: Date.now() - started,
  }
}

/** Recherche web réelle via le moteur intégré. */
export interface WebSearchResult {
  url: string
  name: string
  snippet: string
  host_name: string
  date?: string
}

export async function zaiWebSearch(query: string, num = 5): Promise<WebSearchResult[]> {
  const zai = await getZai()
  try {
    return await zai.functions.invoke("web_search", { query, num })
  } catch (err) {
    throw new LLMError(
      "zai",
      `Recherche web échouée : ${err instanceof Error ? err.message : String(err)}`,
      "ZAI_SEARCH_FAILED"
    )
  }
}

/** Lecture de page web réelle via le moteur intégré. */
export async function zaiPageReader(url: string): Promise<{ title: string; html: string; text: string }> {
  const zai = await getZai()
  try {
    const r = await zai.functions.invoke("page_reader", { url })
    const html: string = r?.data?.html ?? ""
    const text = htmlToText(html)
    return { title: r?.data?.title ?? url, html, text }
  } catch (err) {
    throw new LLMError(
      "zai",
      `Lecture de page échouée : ${err instanceof Error ? err.message : String(err)}`,
      "ZAI_READ_FAILED"
    )
  }
}

/** Convertit un HTML en texte lisible (approximation robuste, sans dépendance). */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
}

/** Estimation de tokens (~4 caractères/token) quand l'API ne renvoie pas l'usage. */
export function estimateTokens(messages: { content: string }[]): number {
  const chars = messages.reduce((acc, m) => acc + m.content.length, 0)
  return Math.max(1, Math.ceil(chars / 4))
}
