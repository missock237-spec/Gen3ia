import fs from "fs"

/**
 * Configuration centrale GEN3IA.
 * Toutes les clés sensibles proviennent EXCLUSIVEMENT de variables d'environnement.
 * Aucune clé n'est écrite en dur, aucun secret n'est exposé au client.
 */

export const APP_NAME = "GEN3IA"
export const APP_TAGLINE =
  "Plateforme de construction et d'orchestration d'agents IA autonomes"

export interface ProviderStatus {
  key: string
  name: string
  available: boolean
  note: string
}

/** Chemins de configuration recherchés par le SDK z-ai. */
const ZAI_CONFIG_PATHS = [
  process.cwd() + "/.z-ai-config",
  (process.env.HOME ?? "/root") + "/.z-ai-config",
  "/etc/.z-ai-config",
]

/** Le fournisseur ZAI (GLM) est actif si un fichier de configuration existe. */
export function hasZaiConfig(): boolean {
  try {
    return ZAI_CONFIG_PATHS.some((p) => fs.existsSync(p))
  } catch {
    return false
  }
}

export interface EnvConfig {
  glmApiKey: boolean
  openrouterApiKey: boolean
  groqApiKey: boolean
  openaiApiKey: boolean
  huggingfaceApiKey: boolean
  chariowApiKey: boolean
  chariowWebhookSecret: boolean
  zai: boolean
}

export function getEnvConfig(): EnvConfig {
  return {
    glmApiKey: Boolean(process.env.GLM_API_KEY),
    openrouterApiKey: Boolean(process.env.OPENROUTER_API_KEY),
    groqApiKey: Boolean(process.env.GROQ_API_KEY),
    openaiApiKey: Boolean(process.env.OPENAI_API_KEY),
    huggingfaceApiKey: Boolean(process.env.HUGGINGFACE_API_KEY),
    chariowApiKey: Boolean(process.env.CHARIOW_API_KEY),
    chariowWebhookSecret: Boolean(process.env.CHARIOW_WEBHOOK_SECRET),
    zai: hasZaiConfig(),
  }
}

/** Liste des fournisseurs LLM réellement configurés (pour l'UI et le routeur). */
export function getProviderStatuses(): ProviderStatus[] {
  const c = getEnvConfig()
  return [
    {
      key: "zai",
      name: "GLM (Z.AI intégré)",
      available: c.zai,
      note: "Moteur GLM par défaut de la plateforme",
    },
    {
      key: "glm",
      name: "GLM (Zhipu BigModel)",
      available: c.glmApiKey,
      note: "Requiert GLM_API_KEY",
    },
    {
      key: "openrouter",
      name: "OpenRouter",
      available: c.openrouterApiKey,
      note: "Requiert OPENROUTER_API_KEY",
    },
    {
      key: "groq",
      name: "Groq",
      available: c.groqApiKey,
      note: "Requiert GROQ_API_KEY",
    },
    {
      key: "openai",
      name: "OpenAI",
      available: c.openaiApiKey,
      note: "Requiert OPENAI_API_KEY",
    },
    {
      key: "huggingface",
      name: "HuggingFace",
      available: c.huggingfaceApiKey,
      note: "Requiert HUGGINGFACE_API_KEY",
    },
  ]
}

/** URL publique de l'application (utilisée pour les endpoints d'agents publiés). */
export function getAppUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  )
}

/** Limites du plan gratuit. */
export const FREE_PLAN_CREDITS = 25
export const SIGNUP_BONUS_CREDITS = 25

/** Réglages d'autonomie par défaut du moteur d'auto-correction. */
export const DEFAULT_MAX_ATTEMPTS = 3
