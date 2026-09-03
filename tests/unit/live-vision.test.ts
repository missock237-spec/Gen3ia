import { describe, test, expect, beforeEach, afterEach } from "bun:test"

/**
 * Tests du module vision (copilote live — partage d'écran avec l'agent IA) :
 * construction des messages multimodaux (texte + image), disponibilité de la
 * chaîne de fournisseurs, extraction de la commande /task.
 */

import { buildMessages, visionConfigured } from "@/lib/ai/vision"

const ENV_KEYS = ["GLM_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY"] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe("ai/vision — copilote live (partage d'écran avec l'agent)", () => {
  test("buildMessages — avec image : contenu multimodal (texte + image_url data URL)", () => {
    const msgs = buildMessages({
      system: "Tu es le copilote IA GEN3IA.",
      prompt: "Que vois-tu ?",
      imageDataUrl: "data:image/jpeg;base64,AAAA",
    })
    expect(msgs.length).toBe(2)
    expect((msgs[0] as { role: string }).role).toBe("system")
    expect((msgs[0] as { content: unknown }).content).toBe("Tu es le copilote IA GEN3IA.")
    const user = msgs[1] as { role: string; content: Array<{ type: string; [k: string]: unknown }> }
    expect(user.role).toBe("user")
    expect(Array.isArray(user.content)).toBe(true)
    expect(user.content[0]).toEqual({ type: "text", text: "Que vois-tu ?" })
    expect(user.content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AAAA" },
    })
  })

  test("buildMessages — sans image : contenu texte seul (pas de partie image)", () => {
    const msgs = buildMessages({ system: "S", prompt: "Résume" })
    const user = msgs[1] as { content: Array<{ type: string }> }
    expect(user.content.length).toBe(1)
    expect(user.content[0].type).toBe("text")
  })

  test("visionConfigured — ZAI intégré : la chaîne propose toujours un maillon", () => {
    expect(visionConfigured()).toBe(true)
    process.env.GLM_API_KEY = "test-key"
    expect(visionConfigured()).toBe(true)
  })

  test("commande /task — regex de la route agent : extraction de l'instruction", () => {
    const re = /^\/(?:task|t[âa]che)\s+([\s\S]+)$/i
    expect("Je code".match(re)).toBe(null)
    const m1 = "/task corrige le bug d'authentification ligne 42".match(re)
    expect(m1?.[1]).toBe("corrige le bug d'authentification ligne 42")
    const m2 = "/TACHE analyse ce dépôt\nde près".match(re)
    expect(m2?.[1]).toContain("de près")
  })
})
