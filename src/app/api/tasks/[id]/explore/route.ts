import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser, DEFAULT_USER_SETTINGS } from "@/lib/auth/guards"
import { ParallelExplorer } from "@/lib/engines/exploration"
import { listAvailableToolKeys, getToolCatalog } from "@/lib/tools/registry"
import { chargeCredits, InsufficientCreditsError } from "@/lib/credits/ledger"
import { recordStep } from "@/lib/engines/state-machine"
import { audit } from "@/lib/engines/audit"
import { creditsForTokens } from "@/lib/ai/router"
import { DEFAULT_WEIGHTS } from "@/lib/engines/types"
import { logger } from "@/lib/observability/logger"
import type { Plan, PromptAnalysis, EvaluationWeights, ExecutionLogEntry } from "@/lib/engines/types"

const exploreSchema = z.object({
  maxVariants: z.number().int().min(1).max(3).default(2),
})

function parseJsonField<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/**
 * POST /api/tasks/[id]/explore — Mode exploration réel.
 * Exécute en PARALLÈLE plusieurs variantes du plan de la tâche, évalue
 * chaque résultat avec les pondérations de l'utilisateur, conserve le
 * meilleur et facture les tokens réellement consommés.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(
    req,
    async () => {
      const user = await requireUser(req)
      const { id: taskId } = await params
      const body = await readJson(req, exploreSchema)

      const task = await db.task.findFirst({ where: { id: taskId, userId: user.id }, include: { agent: true } })
      if (!task) throw new ApiError(404, "Tâche introuvable.", "NOT_FOUND")
      if (["QUEUED", "RUNNING", "WAITING_FOR_HUMAN", "WAITING_PLAN_APPROVAL"].includes(task.status)) {
        throw new ApiError(409, "La tâche est en cours d'exécution — attendez sa fin avant d'explorer.", "TASK_ACTIVE")
      }

      const plans = parseJsonField<Plan[]>(task.plans, [])
      if (plans.length < 2) {
        throw new ApiError(409, "Pas assez de plans candidats (minimum 2) pour lancer une exploration.", "NO_PLANS")
      }

      const agent = task.agent
      let allowedTools = listAvailableToolKeys()
      if (agent?.config) {
        try {
          const cfg = JSON.parse(agent.config) as { tools?: string[] }
          if (Array.isArray(cfg.tools) && cfg.tools.length > 0) {
            allowedTools = cfg.tools.filter((t) => getToolCatalog().some((c) => c.key === t))
          }
        } catch {
          /* configuration illisible : tous les outils */
        }
      }

      const settings = { ...DEFAULT_USER_SETTINGS, ...parseJsonField(user.settings ?? "{}", {}) }
      let weights: EvaluationWeights = DEFAULT_WEIGHTS
      try {
        const s = user.settings ? JSON.parse(user.settings) : {}
        weights = { ...DEFAULT_WEIGHTS, ...(s.planWeights ?? {}) }
      } catch {
        weights = DEFAULT_WEIGHTS
      }
      const analysis = parseJsonField<PromptAnalysis>(task.analysis, {
        intent: task.prompt.slice(0, 200),
        goals: [],
        constraints: [],
        requiredCapabilities: [],
        risks: [],
        successCriteria: [],
        failureCriteria: [],
        estimatedComplexity: "MEDIUM",
        estimatedSteps: 3,
        language: "fr",
        clarificationNeeded: false,
      })

      const meter = { tokensIn: 0, tokensOut: 0 }
      const explorer = new ParallelExplorer()
      const run = await db.explorationRun.create({
        data: { taskId: task.id, variantCount: Math.min(body.maxVariants, plans.length), winnerPlanId: "", results: "[]", status: "RUNNING" },
      })

      try {
        const result = await explorer.explore({
          prompt: task.prompt,
          analysis,
          plans,
          executorCtx: {
            userId: user.id,
            taskId: task.id,
            agentId: agent?.id ?? null,
            agentSystemPrompt: agent?.systemPrompt ?? null,
            allowedTools,
          },
          callbacks: {
            onStepStart: async (i, title) => {
              await recordStep(task.id, "EXECUTING", i, `Exploration — Étape ${i + 1} : ${title}`, "RUNNING")
            },
            onStepDone: async (entry: ExecutionLogEntry) => {
              await recordStep(task.id, "EXECUTING", entry.stepIndex, `Exploration — Étape ${entry.stepIndex + 1} : ${entry.title}`, "DONE", {
                output: entry.output.slice(0, 2000),
                evidence: entry.evidence.length,
                latencyMs: entry.latencyMs,
              })
            },
            onStepFailed: async (i, error) => {
              await recordStep(task.id, "EXECUTING", i, `Exploration — Étape ${i + 1} : échec`, "FAILED", { error })
            },
            onLLMUsage: async (tIn, tOut) => {
              meter.tokensIn += tIn
              meter.tokensOut += tOut
            },
            authorizeDangerousTool: () => settings.confirmDangerousOps === false,
          },
          weights,
          maxVariants: body.maxVariants,
          userCredits: user.credits,
        })

        // Facturation réelle des tokens consommés par l'exploration.
        if (meter.tokensIn > 0 || meter.tokensOut > 0) {
          const credits = Math.max(0.01, creditsForTokens("auto", "auto", meter.tokensIn, meter.tokensOut))
          await chargeCredits(user.id, credits, {
            type: "TASK_EXECUTION",
            description: `Exploration parallèle — ${meter.tokensIn} tokens entrée / ${meter.tokensOut} sortie`,
            refType: "task",
            refId: task.id,
          })
          await db.task.update({
            where: { id: task.id },
            data: { costCredits: { increment: credits }, tokensIn: { increment: meter.tokensIn }, tokensOut: { increment: meter.tokensOut } },
          })
        }

        await db.explorationRun.update({
          where: { id: run.id },
          data: {
            winnerPlanId: result.winnerPlanId,
            results: JSON.stringify(result.variants),
            status: "COMPLETED",
          },
        })
        await audit(null, { userId: user.id, action: "EXPLORATION_COMPLETED", entityType: "task", entityId: task.id })

        return Response.json({
          ok: true,
          explorationRunId: run.id,
          winnerPlanId: result.winnerPlanId,
          winnerResult: result.winnerResult,
          variants: result.variants,
          tokensIn: meter.tokensIn,
          tokensOut: meter.tokensOut,
        })
      } catch (err) {
        await db.explorationRun.update({ where: { id: run.id }, data: { status: "FAILED", results: JSON.stringify({ error: String(err).slice(0, 500) }) } }).catch(() => undefined)
        logger.error("Exploration échouée", { taskId: task.id, error: String(err) })
        if (err instanceof InsufficientCreditsError) throw err
        throw new ApiError(502, `Exploration échouée : ${err instanceof Error ? err.message : String(err)}`, "EXPLORATION_FAILED")
      }
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}
