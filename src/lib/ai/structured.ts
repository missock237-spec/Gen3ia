import type { z } from "zod"
import { chat } from "./index"
import type { ChatMessage, LLMCallOptions } from "./types"
import { LLMError } from "./types"

/**
 * Sortie structurée : exige du modèle un JSON valide, l'extrait, le valide
 * par un schéma Zod et déclenche une tentative de réparation si nécessaire.
 * Échec avéré => StructuredOutputError (traité par le moteur d'auto-correction).
 */

export class StructuredOutputError extends LLMError {
  raw: string

  constructor(message: string, raw: string) {
    super("structured", message, "STRUCTURED_OUTPUT_FAILED")
    this.raw = raw
  }
}

const JSON_GUARD_SYSTEM: ChatMessage = {
  role: "system",
  content:
    "Tu réponds EXCLUSIVEMENT avec un objet JSON valide, sans texte avant ni après, sans balises de code. " +
    "Respecte exactement le schéma demandé. Aucun commentaire, aucun markdown, uniquement le JSON.",
}

/** Extrait le premier objet/tableau JSON d'un texte de modèle (gère les fences ```json). */
export function extractJson(raw: string): unknown {
  // Retire les balises de code éventuelles.
  const unfenced = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim()

  for (const candidate of [unfenced, raw.trim()]) {
    // 1. Parse direct.
    try {
      return JSON.parse(candidate)
    } catch {
      /* on continue */
    }
    // 2. Extraction du premier bloc équilibré {…} ou […].
    const start = candidate.search(/[{[]/)
    if (start >= 0) {
      const open = candidate[start]
      const close = open === "{" ? "}" : "]"
      let depth = 0
      let inString = false
      let escaped = false
      for (let i = start; i < candidate.length; i++) {
        const ch = candidate[i]
        if (escaped) {
          escaped = false
          continue
        }
        if (ch === "\\") {
          escaped = true
          continue
        }
        if (ch === '"') inString = !inString
        if (inString) continue
        if (ch === open) depth++
        else if (ch === close) {
          depth--
          if (depth === 0) {
            const block = candidate.slice(start, i + 1)
            try {
              return JSON.parse(block)
            } catch {
              break
            }
          }
        }
      }
    }
  }
  throw new SyntaxError("Aucun JSON exploitable dans la réponse du modèle.")
}

export interface JSONCallResult<T> {
  data: T
  raw: string
  tokensIn: number
  tokensOut: number
  provider: string
  model: string
  repairUsed: boolean
}

/** Désencapsule un wrapper à clé unique (ex. {"analyse": {...}} → {...}). */
 
function tryUnwrap(parsed: any): any {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const keys = Object.keys(parsed)
    if (keys.length === 1) {
      const inner = parsed[keys[0]]
      if (inner && typeof inner === "object") return inner
    }
  }
  return parsed
}

/** Appel LLM avec sortie JSON validée (une tentative de réparation incluse). */
export async function chatJSON<T>(
  opts: LLMCallOptions,
  schema: z.ZodType<T>
): Promise<JSONCallResult<T>> {
  const messages: ChatMessage[] = [JSON_GUARD_SYSTEM, ...opts.messages]

  const first = await chat({ ...opts, messages, json: true })
  let parsed: unknown
  try {
    parsed = extractJson(first.content)
  } catch {
    parsed = null
  }

  if (parsed !== null) {
    let check = schema.safeParse(parsed)
    if (!check.success) {
      // Tentative de désencapsulage d'un wrapper éventuel.
      const unwrapped = tryUnwrap(parsed)
      if (unwrapped !== parsed) {
        const check2 = schema.safeParse(unwrapped)
        if (check2.success) check = check2
      }
    }
    if (check.success) {
      return {
        data: check.data,
        raw: first.content,
        tokensIn: first.tokensIn,
        tokensOut: first.tokensOut,
        provider: first.provider,
        model: first.model,
        repairUsed: false,
      }
    }
  }

  // Tentative de réparation : on montre les erreurs exactes au modèle.
   
  const issues: { path: string[]; message: string }[] = parsed !== null
    ? (schema.safeParse(tryUnwrap(parsed)).error?.issues ?? []).map((i) => ({
        path: i.path.map((p) => String(p)),
        message: i.message,
      }))
    : []
  const issueList = issues
    .slice(0, 8)
    .map((i) => `- champ « ${i.path.join(".") || "(racine)"} » : ${i.message}`)
    .join("\n")

  const repairMessages: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: first.content.slice(0, 2000) },
    {
      role: "user",
      content:
        "Ta réponse précédente est invalide. " +
        (issueList
          ? `Erreurs de validation :\n${issueList}\n`
          : "Elle n'est pas du JSON exploitable.\n") +
        "Renvoie UNIQUEMENT l'objet JSON corrigé et COMPLET, avec exactement les clés attendues, sans texte autour.",
    },
  ]
  const second = await chat({ ...opts, messages: repairMessages, json: true })
  try {
    parsed = extractJson(second.content)
  } catch {
    throw new StructuredOutputError(
      "Le modèle n'a pas produit de JSON exploitable après réparation.",
      second.content
    )
  }
  const unwrapped2 = tryUnwrap(parsed)
  const check = schema.safeParse(unwrapped2)
  if (!check.success) {
    throw new StructuredOutputError(
      `JSON reçu mais non conforme : ${check.error.issues[0]?.message ?? "schéma invalide"}`,
      second.content
    )
  }
  return {
    data: check.data,
    raw: second.content,
    tokensIn: first.tokensIn + second.tokensIn,
    tokensOut: first.tokensOut + second.tokensOut,
    provider: second.provider,
    model: second.model,
    repairUsed: true,
  }
}
