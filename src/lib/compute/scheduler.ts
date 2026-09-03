import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { listModels } from "@/lib/ai/model-registry"

/**
 * Compute Scheduler (v4.0 — Phase 12).
 *
 * Choisit la MEILLEURE infrastructure de calcul pour une exécution :
 *  - HF Inference Providers (routeur partagé — défaut économique) ;
 *  - HF Inference Endpoints (compute garanti — latence/débit maîtrisés) ;
 *  - HF Jobs (tâches longues asynchrones) ;
 *  - repli multi-fournisseurs (Gemini, GLM, OpenRouter…) pour résilience.
 *
 * Critères : VRAM/RAM requises, modèle, quantization, durée, priorité,
 * coût, disponibilité, concurrence, type de tâche.
 *
 * HF reste la plateforme de compute PRINCIPALE ; l'abstraction
 * ComputeBackend permet d'ajouter d'autres providers SANS toucher
 * l'orchestrateur.
 */

export interface ComputeRequirements {
  model?: string
  taskKind?: "chat" | "embedding" | "batch" | "fine-tune" | "media" | "long-running"
  estimatedDurationMs?: number
  priority?: "low" | "normal" | "high" | "critical"
  vramGbRequired?: number
  contextTokens?: number
  budgetCredits?: number
  requiresGpu?: boolean
}

export interface ComputeDecision {
  backend: "hf-router" | "hf-endpoint" | "hf-job" | "external-provider"
  provider: string
  endpointUrl?: string
  reason: string
  estimatedCostCredits: number
  estimatedLatencyMs: number
  queuePosition?: number
}

export interface ComputeBackend {
  key: string
  label: string
  available(): Promise<boolean>
  scoreFor(req: ComputeRequirements): Promise<number>
  decide(req: ComputeRequirements): Promise<ComputeDecision>
}

const log = logger.child({ component: "compute-scheduler" })

// ─── Backend 1 : HF Inference Providers (routeur partagé) ───

const hfRouterBackend: ComputeBackend = {
  key: "hf-router",
  label: "HF Inference Providers (routeur partagé)",
  async available() {
    return Boolean(process.env.HF_TOKEN ?? process.env.HUGGINGFACE_API_KEY)
  },
  async scoreFor(req) {
    // Routeur partagé : économique et rapide à provisionner, idéal chat/embedding.
    let score = 0.7
    if (req.taskKind === "chat") score += 0.2
    if (req.taskKind === "embedding") score += 0.15
    if (req.priority === "critical") score -= 0.15 // pas de SLA garanti
    if (req.estimatedDurationMs && req.estimatedDurationMs > 120_000) score -= 0.4 // long → jobs
    if (req.requiresGpu) score -= 0.2 // GPU non garanti (file partagée)
    return score
  },
  async decide() {
    return {
      backend: "hf-router",
      provider: "huggingface",
      reason: "HF Inference Providers — routage partagé économique, latence réseau standard",
      estimatedCostCredits: 0,
      estimatedLatencyMs: 2500,
    }
  },
}

// ─── Backend 2 : HF Inference Endpoints (compute garanti) ───

const hfEndpointBackend: ComputeBackend = {
  key: "hf-endpoint",
  label: "HF Inference Endpoint dédié",
  async available() {
    const running = await db.inferenceEndpoint.count({
      where: { status: { in: ["RUNNING", "SCALED_TO_ZERO"] }, url: { not: null } },
    })
    return running > 0
  },
  async scoreFor(req) {
    let score = 0.6
    if (req.priority === "critical" || req.priority === "high") score += 0.25 // SLA
    if (req.taskKind === "chat") score += 0.1
    if (req.taskKind === "batch") score += 0.1
    if (req.requiresGpu) score += 0.1 // accélérateur dédié possible
    if (req.budgetCredits != null && req.budgetCredits < 1) score -= 0.2 // coût infra dédiée
    return score
  },
  async decide(req) {
    // Endpoint dédié qui sert ce modèle (ou le mieux dimensionné).
    const candidates = await db.inferenceEndpoint.findMany({
      where: { status: "RUNNING", url: { not: null } },
      orderBy: [{ currentReplicas: "desc" }, { minReplicas: "desc" }],
      take: 20,
    })
    const match = candidates.find((c) => c.modelId === req.model) ?? candidates[0]
    return {
      backend: "hf-endpoint",
      provider: "huggingface",
      endpointUrl: match?.url ?? undefined,
      reason: `Endpoint dédié « ${match?.name ?? "?"} » — compute garanti, replicas ${match?.currentReplicas ?? 0}`,
      estimatedCostCredits: 0.5,
      estimatedLatencyMs: 900,
    }
  },
}

// ─── Backend 3 : HF Jobs (tâches longues) ───

const hfJobBackend: ComputeBackend = {
  key: "hf-job",
  label: "HF Jobs (tâches longues asynchrones)",
  async available() {
    return Boolean(process.env.HF_TOKEN ?? process.env.HUGGINGFACE_API_KEY) || Boolean(process.env.REDIS_URL)
  },
  async scoreFor(req) {
    let score = 0.5
    if (req.taskKind === "batch" || req.taskKind === "fine-tune" || req.taskKind === "long-running") score += 0.4
    if (req.taskKind === "media") score += 0.3
    if (req.estimatedDurationMs && req.estimatedDurationMs > 120_000) score += 0.3
    if (req.taskKind === "chat") score -= 0.5 // le chat ne doit PAS passer par les jobs
    return score
  },
  async decide(req) {
    const pending = await db.hFJob.count({ where: { status: "PENDING" } })
    return {
      backend: "hf-job",
      provider: "huggingface",
      reason: `Job asynchrone — tâche longue (${Math.round((req.estimatedDurationMs ?? 300_000) / 1000)} s estimées)`,
      estimatedCostCredits: 2,
      estimatedLatencyMs: req.estimatedDurationMs ?? 600_000,
      queuePosition: pending,
    }
  },
}

// ─── Backend 4 : repli fournisseurs externes ───

const externalBackend: ComputeBackend = {
  key: "external-provider",
  label: "Fournisseurs externes (repli)",
  async available() {
    return Boolean(
      process.env.GLM_API_KEY ?? process.env.OPENROUTER_API_KEY ?? process.env.GEMINI_API_KEY ?? process.env.GROQ_API_KEY
    )
  },
  async scoreFor(req) {
    // Repli : seulement si HF indisponible (score neutre bas).
    return 0.2 + (req.taskKind === "chat" ? 0.1 : 0)
  },
  async decide() {
    const provider =
      process.env.GLM_API_KEY ? "glm" :
      process.env.OPENROUTER_API_KEY ? "openrouter" :
      process.env.GEMINI_API_KEY ? "gemini" : "groq"
    return {
      backend: "external-provider",
      provider,
      reason: "HF indisponible — repli fournisseur externe (politique de résilience)",
      estimatedCostCredits: 0,
      estimatedLatencyMs: 2000,
    }
  },
}

const BACKENDS: ComputeBackend[] = [hfRouterBackend, hfEndpointBackend, hfJobBackend, externalBackend]

/**
 * Décision de compute : chaque backend propose un score pour les besoins ;
 * le meilleur DISPONIBLE gagne. HF reste principal — les externes ne
 * servent qu'au repli (Phase 24).
 */
export async function scheduleCompute(req: ComputeRequirements): Promise<ComputeDecision> {
  const scored: Array<{ backend: ComputeBackend; score: number }> = []
  for (const backend of BACKENDS) {
    if (!(await backend.available().catch(() => false))) continue
    scored.push({ backend, score: await backend.scoreFor(req).catch(() => 0) })
  }
  scored.sort((a, b) => b.score - a.score)
  const winner = scored[0]?.backend ?? externalBackend
  const decision = await winner.decide(req)
  log.info("compute-scheduler: décision", {
    backend: decision.backend,
    provider: decision.provider,
    taskKind: req.taskKind ?? "chat",
    reason: decision.reason,
  })
  return decision
}

/** Vue synthétique pour le dashboard admin (occupation compute). */
export async function computeOverview(): Promise<{
  hfRouter: { available: boolean }
  endpoints: { running: number; scaledToZero: number; total: number }
  jobs: { pending: number; running: number; completed: number; failed: number }
  models: { active: number; experimental: number }
}> {
  const [endpoints, jobs, models] = await Promise.all([
    db.inferenceEndpoint.groupBy({ by: ["status"], _count: { _all: true } }),
    db.hFJob.groupBy({ by: ["status"], _count: { _all: true } }),
    db.aIModel.groupBy({ by: ["status"], _count: { _all: true } }),
  ])
  const byStatus = (rows: Array<{ status: string; _count: { _all: number } }>) =>
    Object.fromEntries(rows.map((r) => [r.status, r._count._all]))
  const ep = byStatus(endpoints)
  const jb = byStatus(jobs)
  const mo = byStatus(models)
  return {
    hfRouter: { available: Boolean(process.env.HF_TOKEN ?? process.env.HUGGINGFACE_API_KEY) },
    endpoints: {
      running: ep.RUNNING ?? 0,
      scaledToZero: ep.SCALED_TO_ZERO ?? 0,
      total: Object.values(ep).reduce((a, b) => a + b, 0),
    },
    jobs: {
      pending: jb.PENDING ?? 0,
      running: jb.RUNNING ?? 0,
      completed: jb.COMPLETED ?? 0,
      failed: jb.FAILED ?? 0,
    },
    models: { active: mo.ACTIVE ?? 0, experimental: mo.EXPERIMENTAL ?? 0 },
  }
}

/** Recommandation VRAM/hardware pour un modèle (aide au choix d'endpoint). */
export function hardwareRecommendation(params: { parameterCountB?: number; quantization?: string }): {
  instanceSize: string
  instanceType: string
  accelerator: "cpu" | "gpu"
  vramGb: number
} {
  const paramsB = params.parameterCountB ?? 8
  const bitsPerWeight = params.quantization === "int4" ? 4 : params.quantization === "int8" ? 8 : 16
  const vramGb = Math.max(2, Math.ceil((paramsB * bitsPerWeight) / 8) + 2) // + overhead KV-cache
  if (paramsB <= 3) {
    return { instanceSize: "small", instanceType: "basic", accelerator: "cpu", vramGb }
  }
  if (paramsB <= 8) {
    return { instanceSize: "small", instanceType: "t4", accelerator: "gpu", vramGb }
  }
  if (paramsB <= 35) {
    return { instanceSize: "medium", instanceType: "t4", accelerator: "gpu", vramGb }
  }
  return { instanceSize: "large", instanceType: "a100", accelerator: "gpu", vramGb }
}

export { listModels }
