import { db } from "@/lib/db"
import { logger } from "./logger"
import { p95 } from "./alerting"

/**
 * Santé des modèles LLM (v3.6 — observabilité).
 *
 * Agrège les exécutions LLM réelles (EngineRun engine = "LLM::<provider>",
 * enregistrées par le routeur de chat) : taux de succès, latence (avg + p95),
 * tokens, crédits, coût, dernière erreur — par FOURNISSEUR (GLM/ZAI,
 * OpenRouter, Groq, OpenAI…).
 *
 * BASCULE MANUELLE : un fournisseur défaillant peut être désactivé par
 * l'admin (POST /api/admin/models { provider, disabled: true }) — la
 * désactivation est persistée (SystemConfig "llm.disabled_providers") et
 * effective immédiatement (cache mémoire + TTL de rafraîchissement) dans
 * la chaîne de repli du routeur. Un fournisseur désactivé reste utilisable
 * en EXPLICITE (opts.provider) — jamais de verrouillage total par accident.
 */

const CONFIG_KEY = "llm.disabled_providers"
const CACHE_TTL_MS = 60_000

const g = globalThis as unknown as {
  gen3iaDisabledProviders?: { value: Set<string>; loadedAt: number }
}

/** Fournisseurs désactivés (cache mémoire, TTL 60 s, cohérent multi-instances via DB). */
export async function getDisabledProviders(): Promise<Set<string>> {
  const cached = g.gen3iaDisabledProviders
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.value
  }
  try {
    const row = await db.systemConfig.findUnique({ where: { key: CONFIG_KEY } })
    const list = row?.value ? (JSON.parse(row.value) as string[]) : []
    const value = new Set(list.filter((x) => typeof x === "string"))
    g.gen3iaDisabledProviders = { value, loadedAt: Date.now() }
    return value
  } catch {
    // Fail-open : sans lecture DB, aucune désactivation.
    return cached?.value ?? new Set()
  }
}

/** Version SYNCHRONE (routeur) : utilise le cache sans y aller s'il est chaud. */
export function getDisabledProvidersSync(): Set<string> {
  return g.gen3iaDisabledProviders?.value ?? new Set()
}

/** Active/désactive un fournisseur (admin) — persiste + rafraîchit le cache. */
export async function setProviderDisabled(provider: string, disabled: boolean): Promise<string[]> {
  const current = await getDisabledProviders()
  if (disabled) current.add(provider)
  else current.delete(provider)
  const list = [...current]
  await db.systemConfig.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: JSON.stringify(list) },
    update: { value: JSON.stringify(list) },
  })
  g.gen3iaDisabledProviders = { value: new Set(list), loadedAt: Date.now() }
  logger.info("model-health: bascule fournisseur", { provider, disabled })
  return list
}

/** Force le rechargement du cache (après un changement externe). */
export function invalidateProviderCache(): void {
  g.gen3iaDisabledProviders = undefined
}

export interface ProviderHealth {
  provider: string
  runs: number
  okRate: number
  avgLatencyMs: number
  p95LatencyMs: number
  tokensIn: number
  tokensOut: number
  credits: number
  cost: number
  lastError: string | null
  lastRunAt: string | null
  disabled: boolean
}

/** Agrège la santé de chaque fournisseur sur la fenêtre donnée (défaut 24 h). */
export async function modelHealth(days = 1): Promise<ProviderHealth[]> {
  const since = new Date(Date.now() - days * 86_400_000)
  const runs = await db.engineRun.findMany({
    where: { engine: { startsWith: "LLM::" }, createdAt: { gte: since } },
    select: {
      engine: true, ok: true, durationMs: true, errorCode: true,
      tokensIn: true, tokensOut: true, credits: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20_000,
  })

  const disabled = await getDisabledProviders()
  const byProvider = new Map<string, { runs: number; ok: number; durations: number[]; tokensIn: number; tokensOut: number; credits: number; lastError: string | null; lastRunAt: string | null }>()
  for (const r of runs) {
    const provider = r.engine.slice(5) // "LLM::zai" → "zai"
    let entry = byProvider.get(provider)
    if (!entry) {
      entry = { runs: 0, ok: 0, durations: [], tokensIn: 0, tokensOut: 0, credits: 0, lastError: null, lastRunAt: null }
      byProvider.set(provider, entry)
    }
    entry.runs++
    if (r.ok) entry.ok++
    entry.durations.push(r.durationMs)
    entry.tokensIn += r.tokensIn
    entry.tokensOut += r.tokensOut
    entry.credits += r.credits
    if (!entry.lastRunAt) {
      entry.lastRunAt = r.createdAt.toISOString()
      entry.lastError = r.ok ? null : r.errorCode
    }
  }

  return [...byProvider.entries()]
    .map(([provider, e]) => ({
      provider,
      runs: e.runs,
      okRate: e.runs > 0 ? Math.round((e.ok / e.runs) * 1000) / 1000 : 0,
      avgLatencyMs: e.runs > 0 ? Math.round(e.durations.reduce((a, b) => a + b, 0) / e.runs) : 0,
      p95LatencyMs: p95(e.durations),
      tokensIn: e.tokensIn,
      tokensOut: e.tokensOut,
      credits: Math.round(e.credits * 1000) / 1000,
      // Coût métier : 1 crédit ≈ 1000 tokens de sortie (convention planner).
      cost: Math.round(e.credits * 1000) / 1000,
      lastError: e.lastError,
      lastRunAt: e.lastRunAt,
      disabled: disabled.has(provider),
    }))
    .sort((a, b) => b.runs - a.runs)
}
