import { db } from "@/lib/db"
import type { Agent, Task, User } from "@prisma/client"
import { chat } from "@/lib/ai"
import { creditsForTokens } from "@/lib/ai/router"
import { NoProviderError } from "@/lib/ai/types"
import { chargeCredits, InsufficientCreditsError } from "@/lib/credits/ledger"
import { searchKnowledge } from "@/lib/rag/retriever"
import { recallMemories } from "@/lib/memory/store"
import { TOOL_CATALOG, listAvailableToolKeys } from "@/lib/tools/registry"
import { analyzePrompt } from "./prompt-analysis"
import { generatePlans } from "./planner"
import { evaluatePlans } from "./evaluator"
import { executePlan } from "./executor"
import { verifyResult } from "./verification"
import { extractLearning } from "./learning"
import { runWithSelfCorrection, analyzeError, ReplanRequiredError } from "./self-correction"
import { transitionTask, recordStep, mergeTaskJson, type PipelinePhase } from "./state-machine"
import { audit } from "./audit"
import type {
  CorrectionLogEntry,
  EvaluationWeights,
  ExecutionLogEntry,
  Plan,
  PromptAnalysis,
  VerificationReport,
} from "./types"
import { DEFAULT_WEIGHTS } from "./types"
import { getUserSettings, DEFAULT_USER_SETTINGS } from "@/lib/auth/guards"

/**
 * Orchestrator — moteur central de GEN3IA.
 * Pipeline : ANALYZING → PLANNING → SIMULATING → EXECUTING → VERIFYING → LEARNING → COMPLETED
 *
 * Conception reprise-ez : chaque phase persiste ses sorties dans la tâche
 * (checkpoint). advanceTask() peut donc être appelé plusieurs fois (requête
 * HTTP initiale + sondages) : le pipeline reprend exactement là où il s'est
 * arrêté — compatible serverless, sans file d'attente externe obligatoire.
 */

const PHASE_BUDGET_MS = 50_000 // budget par appel advanceTask (compatible Vercel)
const MAX_VERIFICATION_ROUNDS = 2
const DEFAULT_MAX_EXECUTION_ATTEMPTS = 3

interface TaskAgent extends Agent {
  config: string | null
}

interface LoadedTask {
  task: Task
  user: User
  agent: TaskAgent | null
}

async function loadTask(taskId: string): Promise<LoadedTask | null> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { user: true, agent: true },
  })
  if (!task) return null
  return { task, user: task.user, agent: (task.agent as TaskAgent | null) ?? null }
}

function agentAllowedTools(agent: TaskAgent | null): string[] {
  if (!agent?.config) return listAvailableToolKeys()
  try {
    const cfg = JSON.parse(agent.config) as { tools?: string[] }
    if (Array.isArray(cfg.tools) && cfg.tools.length > 0) {
      return cfg.tools.filter((t) => TOOL_CATALOG.some((c) => c.key === t))
    }
  } catch {
    /* configuration illisible : tous les outils */
  }
  return listAvailableToolKeys()
}

function userWeights(user: User): EvaluationWeights {
  try {
    const settings = user.settings ? JSON.parse(user.settings) : {}
    return { ...DEFAULT_WEIGHTS, ...(settings.planWeights ?? {}) }
  } catch {
    return DEFAULT_WEIGHTS
  }
}

interface TokenMeter {
  tokensIn: number
  tokensOut: number
}

async function chargePhase(
  task: Task,
  user: User,
  meter: TokenMeter,
  phase: string,
  providerLabel: string
): Promise<void> {
  if (meter.tokensIn === 0 && meter.tokensOut === 0) return
  const credits = Math.max(0.01, creditsForTokens(providerLabel, "auto", meter.tokensIn, meter.tokensOut))
  try {
    await chargeCredits(user.id, credits, {
      type: phase === "PLANNING" ? "PLAN_GENERATION" : "TASK_EXECUTION",
      description: `Phase ${phase} — ${meter.tokensIn} tokens entrée / ${meter.tokensOut} sortie`,
      refType: "task",
      refId: task.id,
    })
    await db.task.update({
      where: { id: task.id },
      data: {
        costCredits: { increment: credits },
        tokensIn: { increment: meter.tokensIn },
        tokensOut: { increment: meter.tokensOut },
      },
    })
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      throw err
    }
    throw err
  }
}

function parseJsonField<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/** Ajoute une entrée au journal des corrections (persisté). */
async function appendCorrection(taskId: string, entry: CorrectionLogEntry): Promise<void> {
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId }, select: { correctionLog: true } })
  const log = parseJsonField<CorrectionLogEntry[]>(task.correctionLog, [])
  log.push(entry)
  await mergeTaskJson(taskId, "correctionLog", log)
}

/**
 * Fait avancer la tâche d'autant de phases que le budget temporel le permet.
 * Retourne la tâche mise à jour. Idempotent : sans effet sur une tâche
 * terminée, annulée ou en attente d'approbation humaine.
 */
export async function advanceTask(
  taskId: string,
  options?: { budgetMs?: number }
): Promise<Task | null> {
  const loaded = await loadTask(taskId)
  if (!loaded) return null
  let { task, user, agent } = loaded

  const budgetEnd = Date.now() + (options?.budgetMs ?? PHASE_BUDGET_MS)
  const settings = { ...DEFAULT_USER_SETTINGS, ...parseJsonField(user.settings ?? "{}", {}) }
  const maxAttempts = Math.max(1, Math.min(5, settings.maxAttempts ?? DEFAULT_MAX_EXECUTION_ATTEMPTS))
  const allowedTools = agentAllowedTools(agent)

  // Tâche déjà terminée / en attente : rien à faire.
  if (["COMPLETED", "FAILED", "CANCELLED", "WAITING_FOR_HUMAN"].includes(task.status)) {
    return task
  }

  const memories = await recallMemories(user.id, { query: task.prompt, agentId: agent?.id, limit: 5 })
  const memoryStrings = memories.map((m) => m.content)

  // Contexte RAG : documents de l'utilisateur (et de l'agent si défini).
  let knowledgeContext = ""
  try {
    const hits = await searchKnowledge(user.id, task.prompt, 3)
    if (hits.length > 0) {
      knowledgeContext = hits.map((h) => `[${h.title}] ${h.text.slice(0, 900)}`).join("\n\n")
    }
  } catch {
    /* pas de base de connaissances */
  }

  try {
    // ---------------- Phase ANALYZING ----------------
    if (task.status === "QUEUED") {
      task = await transitionTask(task, "ANALYZING")
      await recordStep(task.id, "ANALYZING", 0, "Analyse de la demande", "RUNNING")
    }
    if (task.status === "ANALYZING") {
      if (!task.analysis) {
        const meter: TokenMeter = { tokensIn: 0, tokensOut: 0 }
        const { value: analysis } = await runWithSelfCorrection(
          async () => {
            const r = await analyzePrompt(task.prompt, {
              agentName: agent?.name,
              agentSystemPrompt: agent?.systemPrompt ?? undefined,
              memories: memoryStrings,
            })
            meter.tokensIn += r.tokensIn
            meter.tokensOut += r.tokensOut
            return r.analysis
          },
          {
            phase: "ANALYZING",
            maxAttempts: 2,
            attempt: 0,
            onCorrection: (e) => appendCorrection(task.id, e),
          }
        )
        await mergeTaskJson(task.id, "analysis", analysis)
        await chargePhase(task, user, meter, "ANALYZING", "zai")
        await recordStep(task.id, "ANALYZING", 0, "Analyse de la demande", "DONE", analysis)
      }
      task = await transitionTask(task, "PLANNING")
      await recordStep(task.id, "PLANNING", 0, "Génération des 5 plans", "RUNNING")
    }

    // ---------------- Phase PLANNING ----------------
    if (task.status === "PLANNING") {
      if (!task.plans) {
        const meter: TokenMeter = { tokensIn: 0, tokensOut: 0 }
        const previousFailure = parseJsonField<CorrectionLogEntry[]>(task.correctionLog, [])
          .filter((c) => c.strategy === "REPLAN")
          .map((c) => c.error)
          .pop()
        const { value: plans } = await runWithSelfCorrection(
          async () => {
            const r = await generatePlans(task.prompt, parseJsonField<PromptAnalysis>(task.analysis, {
              intent: "", goals: [], constraints: [], requiredCapabilities: [], risks: [],
              successCriteria: [], failureCriteria: [], estimatedComplexity: "MEDIUM",
              estimatedSteps: 3, language: "fr", clarificationNeeded: false,
            }), { previousFailure, memories: memoryStrings })
            meter.tokensIn += r.tokensIn
            meter.tokensOut += r.tokensOut
            return r.plans
          },
          {
            phase: "PLANNING",
            maxAttempts: 2,
            attempt: 0,
            onCorrection: (e) => appendCorrection(task.id, e),
          }
        )
        await mergeTaskJson(task.id, "plans", plans)
        await chargePhase(task, user, meter, "PLANNING", "zai")
        await recordStep(task.id, "PLANNING", 0, "Génération des 5 plans", "DONE", {
          plans: plans.map((p) => ({ id: p.id, name: p.name })),
        })
      }
      task = await transitionTask(task, "SIMULATING")
      await recordStep(task.id, "SIMULATING", 0, "Évaluation et sélection du plan optimal", "RUNNING")
    }

    // ---------------- Phase SIMULATING (évaluation + validation pré-exécution) ----------------
    if (task.status === "SIMULATING") {
      if (!task.planScores) {
        const plans = parseJsonField<Plan[]>(task.plans, [])
        const evaluation = evaluatePlans({
          plans,
          weights: userWeights(user),
          availableTools: allowedTools,
          userCredits: user.credits,
        })
        await mergeTaskJson(task.id, "planScores", {
          scores: evaluation.scores,
          selectedPlanId: evaluation.selectedPlanId,
          rationale: evaluation.rationale,
          weights: userWeights(user),
        })
        await db.task.update({ where: { id: task.id }, data: { selectedPlanId: evaluation.selectedPlanId } })
        await recordStep(task.id, "SIMULATING", 0, "Évaluation et sélection du plan optimal", "DONE", evaluation)
        task = await db.task.findUniqueOrThrow({ where: { id: task.id } })

        // Validation pré-exécution : opération sensible → approbation humaine.
        const selected = plans.find((p) => p.id === evaluation.selectedPlanId)
        const dangerousTools = (selected?.requiredTools ?? []).filter((t) =>
          TOOL_CATALOG.find((c) => c.key === t)?.dangerous
        )
        if (
          selected?.requiresHumanConfirmation ||
          (dangerousTools.length > 0 && settings.confirmDangerousOps !== false)
        ) {
          await transitionTask(task, "WAITING_FOR_HUMAN", {
            pendingApproval: JSON.stringify({
              reason:
                `Le plan ${selected?.id} (« ${selected?.name} ») implique des opérations sensibles nécessitant votre confirmation.`,
              planId: selected?.id ?? "?",
              dangerousOperations: dangerousTools.length > 0 ? dangerousTools : ["opération déclarée sensible"],
              askedAt: new Date().toISOString(),
            }),
          })
          await audit(null, {
            userId: user.id,
            action: "TASK_WAITING_FOR_HUMAN",
            entityType: "task",
            entityId: task.id,
            detail: { planId: selected?.id, dangerousTools },
          })
          return await db.task.findUniqueOrThrow({ where: { id: task.id } })
        }
      }
      task = await transitionTask(task, "EXECUTING")
    }

    // ---------------- Phase EXECUTING ----------------
    if (task.status === "EXECUTING") {
      if (!task.executionLog) {
        const plans = parseJsonField<Plan[]>(task.plans, [])
        const analysis = parseJsonField<PromptAnalysis>(task.analysis, {
          intent: "", goals: [], constraints: [], requiredCapabilities: [], risks: [],
          successCriteria: [], failureCriteria: [], estimatedComplexity: "MEDIUM",
          estimatedSteps: 3, language: "fr", clarificationNeeded: false,
        })
        const selected = plans.find((p) => p.id === task.selectedPlanId) ?? plans[0]
        if (!selected) throw new Error("Aucun plan sélectionné pour l'exécution.")

        const meter: TokenMeter = { tokensIn: 0, tokensOut: 0 }

        const attemptCount = 0
        const correctiveInstruction = (() => {
          try {
            const log = task.executionLog ? JSON.parse(task.executionLog) : null
            return log && typeof log.corrective === "string" ? log.corrective : undefined
          } catch {
            return undefined
          }
        })()

        const outcome = await executePlan(
          task.prompt,
          analysis,
          selected,
          {
            userId: user.id,
            taskId: task.id,
            agentId: agent?.id ?? null,
            agentSystemPrompt: agent?.systemPrompt ?? null,
            allowedTools,
            knowledgeContext,
            memories: memoryStrings,
          },
          {
            onStepStart: async (i, title) => {
              await recordStep(task.id, "EXECUTING", i, `Étape ${i + 1} : ${title}`, "RUNNING")
            },
            onStepDone: async (entry: ExecutionLogEntry) => {
              await recordStep(task.id, "EXECUTING", entry.stepIndex, `Étape ${entry.stepIndex + 1} : ${entry.title}`, "DONE", {
                output: entry.output.slice(0, 2000),
                evidence: entry.evidence.length,
              })
            },
            onStepFailed: async (i, error) => {
              await recordStep(task.id, "EXECUTING", i, `Étape ${i + 1} : échec`, "FAILED", { error })
            },
            onLLMUsage: async (tIn, tOut) => {
              meter.tokensIn += tIn
              meter.tokensOut += tOut
            },
            authorizeDangerousTool: () => {
              // Approbation déjà donnée via HITL (le plan a été validé) OU
              // confirmations désactivées par l'utilisateur.
              return settings.confirmDangerousOps === false
            },
          },
          correctiveInstruction
        ).catch(async (err) => {
          const analysis2 = analyzeError(err)
          await appendCorrection(task.id, {
            attempt: 0,
            phase: "EXECUTING",
            error: analysis2.reason.slice(0, 400),
            classification: analysis2.classification,
            attribution: analysis2.attribution,
            strategy: analysis2.strategy,
            action: analysis2.attribution,
            outcome: "ESCALATED",
          })
          throw err
        })

        await mergeTaskJson(task.id, "executionLog", {
          steps: outcome.steps,
          finalAnswer: outcome.finalAnswer,
          evidence: outcome.evidence,
        })
        await chargePhase(task, user, meter, "EXECUTING", "zai")
        await db.task.update({
          where: { id: task.id },
          data: { attempts: { increment: 1 } },
        })
        task = await db.task.findUniqueOrThrow({ where: { id: task.id } })
      }
      task = await transitionTask(task, "VERIFYING")
      await recordStep(task.id, "VERIFYING", 0, "Vérification du résultat", "RUNNING")
    }

    // ---------------- Phase VERIFYING ----------------
    if (task.status === "VERIFYING") {
      if (!task.verification) {
        const analysis = parseJsonField<PromptAnalysis>(task.analysis, {
          intent: "", goals: [], constraints: [], requiredCapabilities: [], risks: [],
          successCriteria: [], failureCriteria: [], estimatedComplexity: "MEDIUM",
          estimatedSteps: 3, language: "fr", clarificationNeeded: false,
        })
        const execution = parseJsonField<{ finalAnswer: string; evidence: { type: string; description: string; content: string }[] }>(
          task.executionLog,
          { finalAnswer: "", evidence: [] }
        )
        const meter: TokenMeter = { tokensIn: 0, tokensOut: 0 }
        const { value: report } = await runWithSelfCorrection(
          async () => {
            const r = await verifyResult({
              prompt: task.prompt,
              analysis,
              answer: execution.finalAnswer,
              evidence: execution.evidence as never,
            })
            meter.tokensIn += r.tokensIn
            meter.tokensOut += r.tokensOut
            return r.report
          },
          {
            phase: "VERIFYING",
            maxAttempts: 2,
            attempt: 0,
            onCorrection: (e) => appendCorrection(task.id, e),
          }
        )
        await mergeTaskJson(task.id, "verification", report)
        await chargePhase(task, user, meter, "VERIFYING", "zai")
        await recordStep(task.id, "VERIFYING", 0, "Vérification du résultat", "DONE", report)
        task = await db.task.findUniqueOrThrow({ where: { id: task.id } })
      }

      const report = parseJsonField<VerificationReport>(task.verification, {
        verified: false, confidence: 0, criteria: [], gaps: [], verdict: "",
      })
      const verificationRounds = parseJsonField<CorrectionLogEntry[]>(task.correctionLog, []).filter(
        (c) => c.phase === "VERIFYING" && c.classification === "LOGIC"
      ).length

      if (!report.verified && verificationRounds < MAX_VERIFICATION_ROUNDS && task.attempts < maxAttempts) {
        // Boucle corrective : on ré-exécute avec une instruction ciblée sur les manques.
        await appendCorrection(task.id, {
          attempt: task.attempts,
          phase: "VERIFYING",
          error: `Critères non atteints : ${report.gaps.join(" ; ").slice(0, 300)}`,
          classification: "LOGIC",
          attribution: "Le résultat ne satisfait pas les critères de succès.",
          strategy: "RETRY",
          action: "Ré-exécution avec instruction corrective ciblée sur les manques.",
          outcome: "ESCALATED",
        })
        const previousExecution = parseJsonField<{ finalAnswer: string }>(task.executionLog, { finalAnswer: "" })
        await mergeTaskJson(task.id, "executionLog", {
          corrective: `La tentative précédente était insuffisante. Gaps identifiés : ${report.gaps.join(" ; ")}. Corrige précisément ces manques.`,
          previousAnswer: previousExecution.finalAnswer.slice(0, 1500),
        })
        await transitionTask(task, "EXECUTING")
        return advanceTask(task.id, options) // le budget est réinitialisé volontairement
      }

      if (!report.verified) {
        // Échec honnête : on ne déclare JAMAIS une tâche réussie sans preuve.
        await transitionTask(task, "FAILED", {
          error: `Vérification non conclue : ${report.gaps.join(" ; ") || report.verdict}`.slice(0, 500),
        })
        await audit(null, {
          userId: user.id, action: "TASK_FAILED_VERIFICATION", entityType: "task", entityId: task.id,
        })
        return await db.task.findUniqueOrThrow({ where: { id: task.id } })
      }
      task = await transitionTask(task, "LEARNING")
      await recordStep(task.id, "LEARNING", 0, "Apprentissage et mémorisation", "RUNNING")
    }

    // ---------------- Phase LEARNING ----------------
    if (task.status === "LEARNING") {
      if (!task.learning) {
        const plans = parseJsonField<Plan[]>(task.plans, [])
        const selected = plans.find((p) => p.id === task.selectedPlanId) ?? plans[0]
        const report = parseJsonField<VerificationReport>(task.verification, {
          verified: true, confidence: 1, criteria: [], gaps: [], verdict: "",
        })
        try {
          const { learning } = await extractLearning(user.id, task.id, {
            prompt: task.prompt,
            analysis: parseJsonField<PromptAnalysis>(task.analysis, {
              intent: "", goals: [], constraints: [], requiredCapabilities: [], risks: [],
              successCriteria: [], failureCriteria: [], estimatedComplexity: "MEDIUM",
              estimatedSteps: 3, language: "fr", clarificationNeeded: false,
            }),
            plan: selected ?? { id: "A", name: "", strategy: "", steps: [], requiredTools: [], risks: [], estimatedCostCredits: 0, successProbability: 0.5, rationale: "", requiresHumanConfirmation: false },
            outcome: "SUCCESS",
            verification: report,
          })
          await mergeTaskJson(task.id, "learning", learning)
        } catch {
          // L'apprentissage ne doit jamais faire échouer une tâche réussie.
        }
        await recordStep(task.id, "LEARNING", 0, "Apprentissage et mémorisation", "DONE")
      }

      // ---------------- Livraison ----------------
      await recordStep(task.id, "DELIVERING", 0, "Assemblage du livrable", "RUNNING")
      const execution = parseJsonField<{ finalAnswer: string; evidence: { type: string; description: string; content: string }[] }>(
        task.executionLog,
        { finalAnswer: "", evidence: [] }
      )
      const plans = parseJsonField<Plan[]>(task.plans, [])
      const selected = plans.find((p) => p.id === task.selectedPlanId)
      const result = {
        answer: execution.finalAnswer,
        summary: selected?.name ?? "",
        plan: { id: selected?.id, name: selected?.name, strategy: selected?.strategy },
        steps: execution.steps?.map((s: { stepIndex: number; title: string; output: string; status: string }) => ({
          index: s.stepIndex, title: s.title, status: s.status,
        })),
        evidence: execution.evidence,
        verification: parseJsonField<VerificationReport>(task.verification, null as unknown as VerificationReport),
        metrics: {
          tokensIn: task.tokensIn,
          tokensOut: task.tokensOut,
          credits: task.costCredits,
          attempts: task.attempts,
        },
      }
      await mergeTaskJson(task.id, "result", result)
      await recordStep(task.id, "DELIVERING", 0, "Assemblage du livrable", "DONE", {
        tokens: task.tokensIn + task.tokensOut,
        credits: task.costCredits,
      })
      task = await transitionTask(task, "COMPLETED")
      await audit(null, {
        userId: user.id, action: "TASK_COMPLETED", entityType: "task", entityId: task.id,
        detail: { credits: task.costCredits, attempts: task.attempts },
      })
      if (agent) {
        // Mise à jour des statistiques de l'agent.
        const stats = parseJsonField<{ runs: number; success: number; failed: number; tokens: number; credits: number }>(
          agent.stats,
          { runs: 0, success: 0, failed: 0, tokens: 0, credits: 0 }
        )
        stats.runs++
        stats.success++
        stats.tokens += task.tokensIn + task.tokensOut
        stats.credits += task.costCredits
        await db.agent.update({ where: { id: agent.id }, data: { stats: JSON.stringify(stats) } })
      }
      return await db.task.findUniqueOrThrow({ where: { id: task.id } })
    }

    return task
  } catch (err) {
    // ---- Gestion des échecs de phase ----
    if (err instanceof InsufficientCreditsError) {
      await transitionTask(task, "FAILED", { error: err.message }).catch(() => undefined)
      return await db.task.findUniqueOrThrow({ where: { id: task.id } })
    }
    if (err instanceof ReplanRequiredError) {
      // Le replan est déjà comptabilisé dans les corrections ; on relance la planification.
      await mergeTaskJson(task.id, "plans", null as unknown as string).catch(() => undefined)
      await db.task.update({ where: { id: task.id }, data: { plans: null, planScores: null, selectedPlanId: null, executionLog: null } })
      const fresh = await db.task.findUniqueOrThrow({ where: { id: task.id } })
      if (fresh.status === "EXECUTING" || fresh.status === "VERIFYING") {
        await transitionTask(fresh, "PLANNING").catch(() => undefined)
        const current = await db.task.findUniqueOrThrow({ where: { id: task.id } })
        if (Date.now() < budgetEnd && current.status === "PLANNING") {
          return advanceTask(task.id, { budgetMs: Math.max(5000, budgetEnd - Date.now()) })
        }
        return current
      }
      return fresh
    }
    const analysis = analyzeError(err)
    const message = err instanceof Error ? err.message : String(err)
    await appendCorrection(task.id, {
      attempt: task.attempts,
      phase: task.status,
      error: message.slice(0, 400),
      classification: analysis.classification,
      attribution: analysis.attribution,
      strategy: analysis.strategy,
      action: "Arrêt de la tâche après épuisement des stratégies de correction.",
      outcome: "ABORTED",
    })
    await transitionTask(task, "FAILED", { error: message.slice(0, 500) }).catch(() => undefined)
    await audit(null, {
      userId: user.id, action: "TASK_FAILED", entityType: "task", entityId: task.id, detail: { message },
    })
    if (agent) {
      const stats = parseJsonField<{ runs: number; success: number; failed: number; tokens: number; credits: number }>(
        agent.stats,
        { runs: 0, success: 0, failed: 0, tokens: 0, credits: 0 }
      )
      stats.runs++
      stats.failed++
      await db.agent.update({ where: { id: agent.id }, data: { stats: JSON.stringify(stats) } })
    }
    return await db.task.findUniqueOrThrow({ where: { id: task.id } })
  }
}

/** Approuve ou refuse une tâche en attente d'humain (HITL). */
export async function resolveHumanApproval(
  taskId: string,
  userId: string,
  approved: boolean,
  reason?: string
): Promise<Task> {
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } })
  if (task.userId !== userId) {
    throw new Error("Tâche non autorisée.")
  }
  if (task.status !== "WAITING_FOR_HUMAN") {
    throw new Error("Cette tâche n'est pas en attente d'approbation.")
  }
  await audit(null, {
    userId, action: approved ? "TASK_APPROVED" : "TASK_REJECTED",
    entityType: "task", entityId: taskId, detail: { reason },
  })
  if (approved) {
    return transitionTask(task, "EXECUTING")
  }
  return transitionTask(task, "CANCELLED", { error: reason ?? "Refusé par l'utilisateur." })
}

export { NoProviderError }
