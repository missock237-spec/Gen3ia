import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { MODEL_CATALOG } from "./router"
import { HF_MODEL_CATALOG } from "./providers/huggingface"
import { GeminiProvider } from "./providers/adapters"
import type { TaskType } from "./types"

/**
 * Model Registry (v4.0 — Phase 5) — source de vérité UNIFIÉE des modèles.
 *
 * Trois sources, une seule vue :
 *  1. La base (table AIModel) — éditable admin, synchronisable HF, fait
 *     évoluer le routage SANS toucher au code ;
 *  2. Le catalogue statique historique (MODEL_CATALOG v3.6) — repli hors-ligne ;
 *  3. Les descriptors des providers (HF, Gemini…) — extension dynamique.
 *
 * Les champs appris (successRate, qualityScore, avgLatencyMs, sampleCount)
 * sont portés par la base et mis à jour par la boucle de performance
 * (lib/ai/performance.ts) — jamais codés en dur.
 */

export interface RegistryModel {
  id: string
  provider: string
  modelId: string
  name: string
  modality: string
  supportedTasks: string[]
  contextLength: number
  parameterCount?: number | null
  quantization?: string | null
  vramGb?: number | null
  capabilities: string[]
  license?: string | null
  commercialUse: boolean
  availability: string
  endpointType: string
  endpointUrl?: string | null
  creditsPerKIn: number
  creditsPerKOut: number
  qualityScore: number
  successRate: number
  avgLatencyMs: number
  sampleCount: number
  lastEvaluated?: Date | null
  status: string
  isDefault: boolean
  priority: number
  tags: string[]
}

const log = logger.child({ component: "model-registry" })

/** Cache mémoire court (le registre est lu à chaque routage). */
let cache: { models: RegistryModel[]; at: number } | null = null
const CACHE_TTL_MS = 30_000

/** Auto-amorçage paresseux : registre vide → seed depuis les catalogues. */
let seeding: Promise<void> | null = null
async function ensureSeeded(): Promise<void> {
  if (seeding) return seeding
  seeding = (async () => {
    try {
      const count = await db.aIModel.count()
      if (count === 0) {
        await seedRegistry()
      }
    } catch {
      /* base indisponible — le routage repliera sur le catalogue statique */
    }
  })()
  return seeding
}

function fromDb(row: {
  id: string; provider: string; modelId: string; name: string; modality: string
  supportedTasks: string; contextLength: number; parameterCount: number | null
  quantization: string | null; vramGb: number | null; license: string | null
  commercialUse: boolean; availability: string; endpointType: string
  endpointUrl: string | null; creditsPerKIn: number; creditsPerKOut: number
  qualityScore: number; successRate: number; avgLatencyMs: number
  sampleCount: number; lastEvaluated: Date | null; status: string
  isDefault: boolean; priority: number; tags: string | null
  capabilities?: Array<{ key: string; value: string | null }>
}): RegistryModel {
  return {
    id: row.id,
    provider: row.provider,
    modelId: row.modelId,
    name: row.name,
    modality: row.modality,
    supportedTasks: parseStrings(row.supportedTasks),
    contextLength: row.contextLength,
    parameterCount: row.parameterCount,
    quantization: row.quantization,
    vramGb: row.vramGb,
    capabilities: (row.capabilities ?? []).map((c) => c.key),
    license: row.license,
    commercialUse: row.commercialUse,
    availability: row.availability,
    endpointType: row.endpointType,
    endpointUrl: row.endpointUrl,
    creditsPerKIn: row.creditsPerKIn,
    creditsPerKOut: row.creditsPerKOut,
    qualityScore: row.qualityScore,
    successRate: row.successRate,
    avgLatencyMs: row.avgLatencyMs,
    sampleCount: row.sampleCount,
    lastEvaluated: row.lastEvaluated,
    status: row.status,
    isDefault: row.isDefault,
    priority: row.priority,
    tags: parseStrings(row.tags),
  }
}

function parseStrings(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** Lit le registre (base d'abord, cache 30 s — uniquement pour la vue
 * par défaut ACTIF ; les vues avec statut explicite/étendues interrogent
 * toujours la base pour refléter les changements immédiatement). */
export async function listModels(options?: {
  provider?: string
  taskType?: string
  status?: string
  includeDisabled?: boolean
}): Promise<RegistryModel[]> {
  const status = options?.status ?? (options?.includeDisabled ? undefined : "ACTIVE")
  const cacheEligible = !options?.status && !options?.includeDisabled
  if (cacheEligible && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return filterModels(cache.models, options)
  }
  // v4.0 — premier usage : amorçage automatique du registre (idempotent).
  await ensureSeeded()
  const rows = await db.aIModel.findMany({
    where: status ? { status } : undefined,
    include: { capabilities: true },
    orderBy: [{ priority: "asc" }, { qualityScore: "desc" }],
  })
  const models = rows.map(fromDb)
  if (cacheEligible) {
    cache = { models, at: Date.now() }
  }
  return filterModels(models, options)
}

function filterModels(models: RegistryModel[], options?: { provider?: string; taskType?: string }): RegistryModel[] {
  let out = models
  if (options?.provider) out = out.filter((m) => m.provider === options.provider)
  if (options?.taskType) out = out.filter((m) => m.supportedTasks.includes(options.taskType!))
  return out
}

/** Un modèle précis (base puis catalogue statique). */
export async function getModel(provider: string, modelId: string): Promise<RegistryModel | null> {
  const row = await db.aIModel.findFirst({
    where: { provider, modelId },
    include: { capabilities: true },
  })
  if (row) return fromDb(row)
  return staticModel(provider, modelId)
}

/** Le modèle par défaut d'un provider. */
export async function getDefaultModel(provider: string): Promise<RegistryModel | null> {
  const row = await db.aIModel.findFirst({
    where: { provider, isDefault: true, status: "ACTIVE" },
    include: { capabilities: true },
  })
  if (row) return fromDb(row)
  const models = await listModels({ provider })
  return models[0] ?? null
}

/** Repli statique (registre vide / base injoignable — jamais de routage cassé). */
export function staticModel(provider: string, modelId: string): RegistryModel | null {
  const entry = MODEL_CATALOG.find((m) => m.provider === provider && (m.key.endsWith(modelId) || m.key.includes(modelId)))
  if (entry) {
    const id = entry.key.includes("/") ? entry.key.split("/").slice(1).join("/") : entry.key
    return {
      id: `static:${entry.key}`,
      provider: entry.provider,
      modelId: id,
      name: entry.name,
      modality: "text",
      supportedTasks: entry.strengths,
      contextLength: entry.contextTokens,
      capabilities: ["generation"],
      license: null,
      commercialUse: true,
      availability: "UNKNOWN",
      endpointType: "COMPATIBLE",
      endpointUrl: null,
      creditsPerKIn: entry.creditsPerKIn,
      creditsPerKOut: entry.creditsPerKOut,
      qualityScore: 0.5,
      successRate: 0.8,
      avgLatencyMs: 2000,
      sampleCount: 0,
      lastEvaluated: null,
      status: "ACTIVE",
      isDefault: false,
      priority: 100,
      tags: [],
    }
  }
  return null
}

/**
 * Amorce le registre depuis les catalogues statiques (HF, Gemini, historique).
 * Idempotent : upsert par (provider, modelId). Peut être rejoué à volonté.
 */
export async function seedRegistry(): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0

  type SeedEntry = {
    provider: string
    modelId: string
    name: string
    modality: string
    supportedTasks: string[]
    contextLength: number
    capabilities: string[]
    license?: string | null
    tags?: string[]
    creditsPerKIn: number
    creditsPerKOut: number
    priority: number
    isDefault?: boolean
  }

  const seeds: SeedEntry[] = []

  // HF — plateforme principale (catalogue des modèles éprouvés).
  for (const m of HF_MODEL_CATALOG) {
    seeds.push({
      provider: "huggingface",
      modelId: m.modelId,
      name: m.name,
      modality: m.modality,
      supportedTasks: m.supportedTasks,
      contextLength: m.contextLength,
      capabilities: m.capabilities,
      license: m.license ?? null,
      tags: m.tags ?? [],
      creditsPerKIn: 0.1,
      creditsPerKOut: 0.3,
      priority: m.tags?.includes("fast") ? 40 : m.modelId.includes("70B") ? 10 : 20,
      isDefault: m.modelId.includes("Llama-3.3-70B"),
    })
  }

  // Gemini.
  const gemini = new GeminiProvider()
  for (const m of await gemini.listModels()) {
    seeds.push({
      provider: "gemini",
      modelId: m.modelId,
      name: m.name,
      modality: m.modality,
      supportedTasks: m.supportedTasks,
      contextLength: m.contextLength,
      capabilities: m.capabilities,
      license: m.license ?? null,
      tags: m.tags ?? [],
      creditsPerKIn: m.modelId.includes("pro") ? 1.25 : 0.1,
      creditsPerKOut: m.modelId.includes("pro") ? 5 : 0.4,
      priority: 30,
      isDefault: m.modelId === "gemini-2.0-flash",
    })
  }

  // Catalogue historique (GLM, OpenRouter, Groq, OpenAI, ZAI).
  for (const m of MODEL_CATALOG) {
    const modelId = m.key.includes("/") ? m.key.split("/").slice(1).join("/") : m.key
    const alreadySeeded = seeds.some((s) => s.provider === m.provider && s.modelId === modelId)
    if (alreadySeeded) continue
    seeds.push({
      provider: m.provider,
      modelId,
      name: m.name,
      modality: "text",
      supportedTasks: m.strengths,
      contextLength: m.contextTokens,
      capabilities: ["generation"],
      tags: [],
      creditsPerKIn: m.creditsPerKIn,
      creditsPerKOut: m.creditsPerKOut,
      priority: 50,
      isDefault: m.provider === "zai" && m.key.includes("glm-4.6"),
    })
  }

  for (const s of seeds) {
    const existing = await db.aIModel.findFirst({ where: { provider: s.provider, modelId: s.modelId } })
    const data = {
      provider: s.provider,
      modelId: s.modelId,
      name: s.name,
      modality: s.modality,
      supportedTasks: JSON.stringify(s.supportedTasks),
      contextLength: s.contextLength,
      license: s.license ?? null,
      creditsPerKIn: s.creditsPerKIn,
      creditsPerKOut: s.creditsPerKOut,
      priority: s.priority,
      isDefault: Boolean(s.isDefault),
      tags: JSON.stringify(s.tags ?? []),
      status: "ACTIVE",
    }
    if (existing) {
      // Ne touche jamais aux champs APPRIS (successRate, qualityScore…) lors du re-seed.
      await db.aIModel.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await db.aIModel.create({ data })
      created++
    }
    // Capacités (upsert par (modelId, key)).
    const modelRow = await db.aIModel.findFirstOrThrow({ where: { provider: s.provider, modelId: s.modelId } })
    for (const cap of s.capabilities) {
      await db.modelCapability.upsert({
        where: { modelId_key: { modelId: modelRow.id, key: cap } },
        create: { modelId: modelRow.id, key: cap, source: "STATIC" },
        update: { source: "STATIC" },
      })
    }
  }

  cache = null
  log.info("model-registry: amorçage terminé", { created, updated })
  return { created, updated }
}

/**
 * Synchronise le registre avec le HF Hub (top modèles text-generation).
 * Ajoute les nouveaux modèles (statut EXPERIMENTAL) et rafraîchit les
 * métadonnées — n'écrase JAMAIS les champs appris.
 */
export async function syncFromHuggingFace(limit = 30): Promise<{
  discovered: number
  refreshed: number
  models: Array<{ provider: string; modelId: string; name: string; downloads?: number }>
}> {
  const { huggingFaceProvider } = await import("./providers/huggingface")
  const discovered = await huggingFaceProvider.discoverPopularModels(limit)
  let added = 0
  let refreshed = 0
  const out: Array<{ provider: string; modelId: string; name: string; downloads?: number }> = []

  for (const m of discovered) {
    const existing = await db.aIModel.findFirst({ where: { provider: "huggingface", modelId: m.modelId } })
    if (!existing) {
      await db.aIModel.create({
        data: {
          provider: "huggingface",
          modelId: m.modelId,
          name: m.name,
          modality: m.modality,
          supportedTasks: JSON.stringify(m.supportedTasks),
          contextLength: m.contextLength,
          license: m.license ?? null,
          creditsPerKIn: 0.1,
          creditsPerKOut: 0.3,
          priority: 200,
          tags: JSON.stringify(m.tags ?? []),
          status: "EXPERIMENTAL", // promotion ACTIVE après validation de performance
          availability: "UNKNOWN",
        },
      })
      added++
    } else {
      await db.aIModel.update({
        where: { id: existing.id },
        data: {
          name: m.name,
          modality: m.modality,
          supportedTasks: JSON.stringify(m.supportedTasks),
          license: m.license ?? existing.license,
          tags: JSON.stringify(m.tags ?? parseStrings(existing.tags)),
        },
      })
      refreshed++
    }
    out.push({ provider: "huggingface", modelId: m.modelId, name: m.name })
  }

  cache = null
  log.info("model-registry: synchronisation HF terminée", { added, refreshed })
  return { discovered: added, refreshed, models: out }
}

/** Invalide le cache (après édition admin / apprentissage). */
export function invalidateRegistryCache(): void {
  cache = null
}

/** Statistiques du registre (tableau de bord admin). */
export async function registryStats(): Promise<{
  total: number
  byProvider: Record<string, number>
  byStatus: Record<string, number>
  learned: number
}> {
  const [total, byProvider, byStatus] = await Promise.all([
    db.aIModel.count(),
    db.aIModel.groupBy({ by: ["provider"], _count: { _all: true } }),
    db.aIModel.groupBy({ by: ["status"], _count: { _all: true } }),
  ])
  const learned = await db.aIModel.count({ where: { sampleCount: { gt: 0 } } })
  return {
    total,
    byProvider: Object.fromEntries(byProvider.map((g) => [g.provider, g._count._all])),
    byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
    learned,
  }
}
