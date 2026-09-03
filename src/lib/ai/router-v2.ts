import { db } from "@/lib/db"
import { listModels, staticModel, type RegistryModel } from "./model-registry"
import { taskSuccessRate, recordSelection } from "./performance"
import { isProviderConfigured, getProvider } from "./providers/adapters"
import { getDisabledProvidersSync } from "@/lib/observability/model-health"
import { hfDefaultModel } from "./providers/huggingface"
import type { TaskType } from "./types"

/**
 * Model Router intelligent (v4.0 — Phase 6/8).
 *
 * Entrée : TaskContext (prompt, type, capacités, budget, qualité voulue…).
 * Sortie : sélection justifiée { provider, model, raison, score,
 * alternatives, estimation de coût, confiance }.
 *
 * Critères de score (priorité décroissante — Phase 6) :
 *   1. adéquation au contexte (tâche supportée, fenêtre de contexte, modalité)
 *   2. taux historique de réussite (Model Performance Registry — appris)
 *   3. qualité (score d'évaluation observé)
 *   4. capacité technique (json/streaming/vision déclarés)
 *   5. disponibilité (clé configurée + santé du provider)
 *   6. latence
 *   7. coût
 *
 * La boucle d'apprentissage (Phase 8) : les exécutions alimentent
 * ModelPerformance → agrégats AIModel → scores futurs.
 */

export interface TaskContext {
  prompt?: string
  taskType?: TaskType
  requiredCapabilities?: string[] // ex: ["json-mode", "vision"]
  contextTokens?: number // taille estimée du contexte en tokens
  files?: Array<{ name: string; mimeType: string; bytes: number }>
  modalities?: Array<"text" | "image" | "audio" | "video">
  desiredQuality?: "fast" | "balanced" | "premium"
  latencyConstraintMs?: number
  budgetCredits?: number
  userPlan?: string // FREE | PRO | ENTERPRISE
  availableCredits?: number
  historicalSuccess?: boolean
  modelConstraints?: {
    providers?: string[] // liste blanche
    excludeProviders?: string[]
    excludeModels?: string[]
    requireCommercialUse?: boolean
    maxLatencyMs?: number
    maxCostPerKOut?: number
  }
}

export interface CandidateModel {
  provider: string
  model: string
  name: string
  score: number
  reason: string
  quality: number
  successRate: number
  latencyMs: number
  costPerKIn: number
  costPerKOut: number
  contextLength: number
  capabilities: string[]
  taskFit: boolean
  learned: boolean
}

export interface RoutingResultV2 {
  provider: string
  model: string
  name: string
  score: number
  confidence: number
  reason: string
  alternatives: CandidateModel[]
  costEstimate: RoutingCostEstimate
  fallbackChain: Array<{ provider: string; model: string }>
  selectionId?: string
}

export interface RoutingCostEstimate {
  creditsIn: number
  creditsOut: number
  creditsTotal: number
  baseTokensIn: number
  baseTokensOut: number
}

// Pondérations des critères (Phase 6 — ordre de priorité respecté).
const WEIGHTS = {
  taskFit: 0.30, // 1. adéquation tâche/contexte
  success: 0.22, // 2. taux de réussite historique
  quality: 0.16, // 3. qualité
  capability: 0.12, // 4. capacité technique
  availability: 0.08, // 5. disponibilité
  latency: 0.07, // 6. latence
  cost: 0.05, // 7. coût
}

/** Ajustements par profil de qualité souhaité. */
const QUALITY_PROFILE: Record<string, { latency: number; cost: number; quality: number }> = {
  fast: { latency: 0.22, cost: 0.08, quality: 0.08 },
  balanced: { latency: 0.07, cost: 0.05, quality: 0.16 },
  premium: { latency: 0.03, cost: 0.02, quality: 0.28 },
}

export interface RouterOptionsV2 {
  userId?: string | null
  taskId?: string
  agentId?: string
  requestId?: string
  traceSelection?: boolean
}

/**
 * Sélectionne le meilleur modèle pour un TaskContext.
 * Retourne TOUJOURS un résultat exploitable (repli statique garanti).
 */
export async function selectModel(
  ctx: TaskContext,
  options: RouterOptionsV2 = {}
): Promise<RoutingResultV2> {
  const taskType = ctx.taskType ?? "CHAT"
  const desiredQuality = ctx.desiredQuality ?? "balanced"
  const profile = QUALITY_PROFILE[desiredQuality] ?? QUALITY_PROFILE.balanced

  // 1. Candidats : registre actif (+ statique si base vide).
  let candidates = await listModels({ taskType, includeDisabled: false })
  if (candidates.length === 0) {
    candidates = fallbackStaticCandidates()
  }

  // 2. Filtres durs (contraintes = non négociables).
  const disabled = getDisabledProvidersSync()
  const configured = new Set(Object.keys(process.env).length > 0 ? configuredProviders() : [])
  const constraints = ctx.modelConstraints ?? {}

  let pool = candidates.filter((m) => {
    if (disabled.has(m.provider)) return false
    if (constraints.providers && !constraints.providers.includes(m.provider)) return false
    if (constraints.excludeProviders?.includes(m.provider)) return false
    if (constraints.excludeModels?.includes(`${m.provider}/${m.modelId}`)) return false
    if (constraints.requireCommercialUse && !m.commercialUse) return false
    // Disponibilité : clé du provider présente (sauf pool explicitement élargi).
    if (configured.size > 0 && !configured.has(m.provider)) return false
    // Fenêtre de contexte : le prompt + réponse doit tenir.
    const needed = (ctx.contextTokens ?? estimateTokens(ctx.prompt ?? "")) + 1024
    if (needed > m.contextLength) return false
    // Modalités.
    if (ctx.modalities?.includes("image") && !["multimodal", "image"].includes(m.modality) && !m.capabilities.includes("vision")) return false
    return true
  })

  // Aucun survivant : relâche les contraintes souples (jamais de routage cassé).
  if (pool.length === 0) {
    pool = candidates.filter((m) => !disabled.has(m.provider) && (configured.size === 0 || configured.has(m.provider)))
  }
  if (pool.length === 0) {
    pool = candidates.filter((m) => !disabled.has(m.provider))
  }
  if (pool.length === 0) {
    pool = candidates
  }

  // 3. Score de chaque candidat.
  const scored: CandidateModel[] = await Promise.all(
    pool.map(async (m) => scoreCandidate(m, ctx, taskType, profile, configured))
  )
  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (!best) {
    // Repli absolu : modèle historique du catalogue.
    return absoluteFallback(ctx, taskType)
  }

  const runnerUps = scored.slice(1, 4)
  const confidence = computeConfidence(best, runnerUps[0])

  const result: RoutingResultV2 = {
    provider: best.provider,
    model: best.model,
    name: best.name,
    score: Math.round(best.score * 1000) / 1000,
    confidence,
    reason: best.reason,
    alternatives: runnerUps,
    costEstimate: estimateRoutingCost(best, ctx),
    fallbackChain: [
      { provider: best.provider, model: best.model },
      ...runnerUps.slice(0, 2).map((a) => ({ provider: a.provider, model: a.model })),
    ],
  }

  // 4. Traçabilité (pourquoi CE modèle — Phase 22 corrélation requestId).
  if (options.traceSelection !== false) {
    await recordSelection({
      userId: options.userId ?? null,
      provider: result.provider,
      model: result.model,
      taskType,
      score: result.score,
      confidence: result.confidence,
      reason: result.reason,
      alternatives: result.alternatives.map((a) => ({
        provider: a.provider,
        model: a.model,
        score: a.score,
        reason: a.reason,
      })),
      costEstimate: result.costEstimate.creditsTotal,
      requestId: options.requestId,
      taskId: options.taskId,
      agentId: options.agentId,
    }).catch(() => undefined)
  }

  return result
}

async function scoreCandidate(
  m: RegistryModel,
  ctx: TaskContext,
  taskType: string,
  profile: { latency: number; cost: number; quality: number },
  configured: Set<string>
): Promise<CandidateModel> {
  const reasons: string[] = []

  // — 1. Adéquation tâche + contexte —
  let taskFit = m.supportedTasks.includes(taskType)
  if (!taskFit && m.supportedTasks.includes("CHAT")) taskFit = false // pas de bonus
  const contextNeeded = ctx.contextTokens ?? estimateTokens(ctx.prompt ?? "")
  const contextOk = contextNeeded + 1024 <= m.contextLength
  const fitScore = taskFit ? (contextOk ? 1 : 0.4) : 0.15
  if (taskFit) reasons.push(`spécialisé ${taskLabel(taskType)}`)
  if (!contextOk) reasons.push("fenêtre de contexte limite")

  // — 2. Réussite historique (appris en direct, sinon agrégat du registre) —
  const live = await taskSuccessRate(m.provider, m.modelId, taskType)
  const successRate = live ? live.rate : m.successRate
  const learned = Boolean(live && live.samples >= 3)
  if (learned) reasons.push(`${Math.round(live!.rate * 100)}% de réussite mesurée (${live!.samples} exécutions)`)

  // — 3. Qualité (score évaluateur observé). —
  const qualityScore = live && live.samples >= 3 ? live.avgQuality : m.qualityScore

  // — 4. Capacité technique (json-mode, vision, streaming…). —
  const required = ctx.requiredCapabilities ?? []
  const capabilityMatch = required.filter((c) => m.capabilities.includes(c)).length
  const capabilityScore = required.length > 0 ? capabilityMatch / required.length : 0.7
  if (required.length > 0 && capabilityMatch === required.length) reasons.push("capacités requises présentes")

  // — 5. Disponibilité (clé + statut). —
  const hasKey = configured.size === 0 || configured.has(m.provider)
  const availabilityScore = (hasKey ? 0.6 : 0) + (m.availability === "AVAILABLE" ? 0.4 : m.availability === "UNKNOWN" ? 0.2 : 0)
  if (!hasKey) reasons.push("clé absente (repli)")

  // — 6. Latence (référence 2000 ms, décroissance douce). —
  const latencyMs = live && live.samples >= 3 ? live.avgLatencyMs : m.avgLatencyMs
  const latencyScore = Math.max(0.05, 1 / (1 + latencyMs / 2000))
  if (latencyMs < 1000) reasons.push("latence < 1 s")

  // — 7. Coût (référence : 1 crédit/1k tokens). —
  const blendedCost = (m.creditsPerKIn + m.creditsPerKOut) / 2
  const costScore = Math.max(0.05, 1 / (1 + blendedCost))
  if (blendedCost < 0.2) reasons.push("économique")

  // Priorité statique du registre (administration) : bonus borné.
  const priorityBonus = Math.max(0, Math.min(0.1, (150 - Math.min(m.priority, 150)) / 1000))
  if (m.priority <= 10) reasons.push("priorité registre")

  // Score final pondéré (les poids de profil remplacent ceux de base).
  const score =
    WEIGHTS.taskFit * fitScore +
    WEIGHTS.success * successRate +
    profile.quality * qualityScore +
    WEIGHTS.capability * capabilityScore +
    WEIGHTS.availability * availabilityScore +
    profile.latency * latencyScore +
    profile.cost * costScore +
    priorityBonus

  // Bonus qualité premium : les gros modèles gagnent quand demandé.
  if (ctx.desiredQuality === "premium" && (m.parameterCount ?? 0) >= 60) {
    reasons.push("modèle large privilégié (qualité premium)")
  }

  return {
    provider: m.provider,
    model: m.modelId,
    name: m.name,
    score: Math.min(1, score),
    reason: reasons.join(", ") || `candidat actif pour ${taskLabel(taskType)}`,
    quality: qualityScore,
    successRate,
    latencyMs,
    costPerKIn: m.creditsPerKIn,
    costPerKOut: m.creditsPerKOut,
    contextLength: m.contextLength,
    capabilities: m.capabilities,
    taskFit,
    learned,
  }
}

function computeConfidence(best: CandidateModel, second?: CandidateModel): number {
  if (!second) return 0.9
  const gap = best.score - second.score
  // Écart net + évidence : confiance entre 0.3 (ambigu) et 0.95 (net).
  return Math.round(Math.min(0.95, Math.max(0.3, 0.5 + gap * 2 + (best.learned ? 0.1 : 0))) * 100) / 100
}

function estimateRoutingCost(best: CandidateModel, ctx: TaskContext): RoutingCostEstimate {
  const baseTokensIn = ctx.contextTokens ?? estimateTokens(ctx.prompt ?? "")
  const baseTokensOut = 1500 // estimation médiane de sortie
  const creditsIn = (baseTokensIn / 1000) * best.costPerKIn
  const creditsOut = (baseTokensOut / 1000) * best.costPerKOut
  return {
    creditsIn: Math.round(creditsIn * 1000) / 1000,
    creditsOut: Math.round(creditsOut * 1000) / 1000,
    creditsTotal: Math.round((creditsIn + creditsOut) * 1000) / 1000,
    baseTokensIn,
    baseTokensOut,
  }
}

function absoluteFallback(ctx: TaskContext, taskType: string): RoutingResultV2 {
  const provider = process.env.GLM_API_KEY ? "glm" : "huggingface"
  const fallbackStatic = staticModel(provider, "glm-4.5") ?? staticModel("huggingface", hfDefaultModel())
  const model = fallbackStatic?.modelId ?? (provider === "glm" ? "glm-4.5" : hfDefaultModel())
  return {
    provider,
    model,
    name: fallbackStatic?.name ?? "Repli statique",
    score: 0.1,
    confidence: 0.3,
    reason: "Registre vide — repli sur le catalogue statique",
    alternatives: [],
    costEstimate: { creditsIn: 0, creditsOut: 0, creditsTotal: 0, baseTokensIn: estimateTokens(ctx.prompt ?? ""), baseTokensOut: 1500 },
    fallbackChain: [{ provider, model }],
  }
}

function fallbackStaticCandidates(): RegistryModel[] {
  const out: RegistryModel[] = []
  for (const provider of ["zai", "glm", "openrouter", "groq", "openai", "huggingface", "gemini"]) {
    const defaults =
      provider === "huggingface"
        ? [hfDefaultModel()]
        : provider === "gemini"
          ? ["gemini-2.0-flash"]
          : provider === "zai"
            ? ["glm-4.6"]
            : provider === "glm"
              ? ["glm-4.5"]
              : provider === "openrouter"
                ? ["z-ai/glm-4.6"]
                : provider === "groq"
                  ? ["llama-3.3-70b-versatile"]
                  : ["gpt-4o-mini"]
    for (const modelId of defaults) {
      const m = staticModel(provider, modelId)
      if (m) out.push(m)
    }
  }
  return out
}

function configuredProviders(): string[] {
  const keys: string[] = []
  const check: Record<string, string> = {
    zai: "ZAI_API_KEY",
    glm: "GLM_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    groq: "GROQ_API_KEY",
    openai: "OPENAI_API_KEY",
    huggingface: "HF_TOKEN",
    gemini: "GEMINI_API_KEY",
  }
  for (const [provider, envKey] of Object.entries(check)) {
    if (process.env[envKey] || process.env[envKey.replace("HF_TOKEN", "HUGGINGFACE_API_KEY")]) keys.push(provider)
  }
  // Providers custom.
  for (const name of Object.keys(process.env)) {
    if (/^CUSTOM_PROVIDER_[A-Z0-9_]+_KEY$/.test(name)) {
      keys.push(name.replace(/^CUSTOM_PROVIDER_/, "").replace(/_KEY$/, "").toLowerCase())
    }
  }
  return keys
}

export function estimateTokens(text: string): number {
  // Estimation prudente : ~3.5 caractères/token (fr) + marge structuration.
  return Math.ceil(text.length / 3.5) + 32
}

function taskLabel(taskType: string): string {
  const labels: Record<string, string> = {
    ANALYSIS: "analyse",
    PLANNING: "planification",
    EXECUTION: "exécution",
    VERIFICATION: "vérification",
    LEARNING: "apprentissage",
    CHAT: "conversation",
    SUMMARIZATION: "synthèse",
    EMBEDDING: "embedding",
    VISION: "vision",
  }
  return labels[taskType] ?? taskType.toLowerCase()
}

/**
 * Diversité pour le système des 5 plans (Phase 10) : sélectionne jusqu'à N
 * modèles DIFFÉRENTS (provider/model distincts) pour les plans A-E.
 * Ex : A→HF 70B, B→HF 8B, C→Gemini Flash, D→GLM, E→Qwen coder.
 */
export async function selectModelDiversity(
  ctx: TaskContext,
  count: number,
  options: RouterOptionsV2 = {}
): Promise<CandidateModel[]> {
  const first = await selectModel(ctx, { ...options, traceSelection: false })
  const picked: CandidateModel[] = [{
    provider: first.provider,
    model: first.model,
    name: first.name,
    score: first.score,
    reason: first.reason,
    quality: 0.5,
    successRate: 0.8,
    latencyMs: 2000,
    costPerKIn: 0.1,
    costPerKOut: 0.3,
    contextLength: 32768,
    capabilities: [],
    taskFit: true,
    learned: false,
  }]
  const seen = new Set([`${first.provider}/${first.model}`])

  // Élargit le pool : tous les modèles actifs (pas filtrés par tâche) pour
  // couvrir des modèles complémentaires — UNIQUEMENT les providers configurés.
  const configuredKeys = new Set(configuredProviders())
  const all = (await listModels({ includeDisabled: false })).filter(
    (m) => configuredKeys.size === 0 || configuredKeys.has(m.provider)
  )
  const getDisabled = getDisabledProvidersSync()
  const scoredPool = all
    .filter((m) => !getDisabled.has(m.provider))
    .filter((m) => !seen.has(`${m.provider}/${m.modelId}`))
    .sort((a, b) => a.priority - b.priority || b.qualityScore - a.qualityScore)

  for (const m of scoredPool) {
    if (picked.length >= count) break
    if (seen.has(`${m.provider}/${m.modelId}`)) continue
    // Contrainte de diversité : au maximum 2 modèles du même provider.
    const sameProviderCount = picked.filter((p) => p.provider === m.provider).length
    if (sameProviderCount >= 2) continue
    if (ctx.modelConstraints?.excludeModels?.includes(`${m.provider}/${m.modelId}`)) continue
    seen.add(`${m.provider}/${m.modelId}`)
    picked.push({
      provider: m.provider,
      model: m.modelId,
      name: m.name,
      score: Math.max(0.3, m.qualityScore),
      reason: `diversité des plans (${m.name})`,
      quality: m.qualityScore,
      successRate: m.successRate,
      latencyMs: m.avgLatencyMs,
      costPerKIn: m.creditsPerKIn,
      costPerKOut: m.creditsPerKOut,
      contextLength: m.contextLength,
      capabilities: m.capabilities,
      taskFit: m.supportedTasks.includes(ctx.taskType ?? "CHAT"),
      learned: m.sampleCount > 0,
    })
  }

  // Complétion si moins que demandé (modèles identiques acceptés en dernier recours).
  while (picked.length < count && all.length > 0) {
    const m = all[picked.length % all.length]
    picked.push({
      provider: m.provider,
      model: m.modelId,
      name: m.name,
      score: 0.3,
      reason: "complétion (pool limité)",
      quality: m.qualityScore,
      successRate: m.successRate,
      latencyMs: m.avgLatencyMs,
      costPerKIn: m.creditsPerKIn,
      costPerKOut: m.creditsPerKOut,
      contextLength: m.contextLength,
      capabilities: m.capabilities,
      taskFit: false,
      learned: false,
    })
  }
  return picked.slice(0, count)
}

export { isProviderConfigured, getProvider }
