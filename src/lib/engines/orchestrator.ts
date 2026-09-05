import { db } from "@/lib/db"
import type { Agent, Task, User } from "@prisma/client"
import { NoProviderError } from "@/lib/ai/types"
import { chargeCredits, InsufficientCreditsError } from "@/lib/credits/ledger"
import { creditsForTokens } from "@/lib/ai/router"
import { searchKnowledge } from "@/lib/rag/retriever"
import { recallMemories } from "@/lib/memory/store"
import { getToolCatalog, listAvailableToolKeys } from "@/lib/tools/registry"
import { parseConnectorToolKey } from "@/lib/connectors/core/types"
import { assessToolKeyRisk, isPlanRiskyTool } from "@/lib/connectors/gateway/risk-engine"
import { checkConnectorPermission } from "@/lib/connectors/gateway/permissions"
import { runEngine, type EngineContext } from "./sdk"
import { engines, recordOrchestratorRun } from "./engines"
import { feedbackSnapshot, plannerFeedbackBlock } from "./feedback"
import { getSystemSettings } from "@/lib/system/config"
import { externalizeEvidence, hydrateEvidence } from "@/lib/tasks/artifacts"
import { analyzeError, ReplanRequiredError, RetryBudgetExceededError } from "./self-correction"
import { transitionTask, recordStep, mergeTaskJson } from "./state-machine"
import { audit } from "./audit"
import type {
  CorrectionLogEntry,
  EvaluationWeights,
  ExecutionLogEntry,
  Plan,
  PlanStep,
  PromptAnalysis,
  VerificationReport,
} from "./types"
import { DEFAULT_WEIGHTS } from "./types"
import { getUserSettings, DEFAULT_USER_SETTINGS } from "@/lib/auth/guards"
import { logger as rootLogger } from "@/lib/observability/logger"
import { AppError, EngineError } from "@/lib/errors"
import { buildPendingApproval, isApprovalExpired, approvalTtlMs, type ApprovalDecisionMeta } from "@/lib/security/hitl"
import { crossAgentPatternsBlock, recordCrossAgentPatterns } from "@/lib/learning/meta-learning"
import { emitPipelineEvent } from "@/lib/webhooks/outbound"

/**
 * Orchestrator — moteur central de GEN3IA.
 * Pipeline : ANALYZING → PLANNING → SIMULATING [→ WAITING_PLAN_APPROVAL]
 *   → EXECUTING → VERIFYING → LEARNING → COMPLETED
 *
 * Conception reprise-ez : chaque phase persiste ses sorties dans la tâche
 * (checkpoint). advanceTask() peut donc être appelé plusieurs fois (requête
 * HTTP initiale + sondages) : le pipeline reprend exactement là où il s'est
 * arrêté — compatible serverless, sans file d'attente externe obligatoire.
 *
 * Améliorations v3.1 :
 *  - chaque phase passe par le SDK de moteurs (contrat execute/rollback/
 *    getStatus) avec télémétrie EngineRun systématique ;
 *  - éthique : l'EthicsEngine bloque les usages interdits avant exécution ;
 *  - mode Explain : approbation manuelle des plans (WAITING_PLAN_APPROVAL) ;
 *  - budget global de retries persisté (Task.totalRetries) — circuit breaker ;
 *  - boucle de feedback : l'historique module l'évaluateur et le planificateur ;
 *  - apprentissage sur les ÉCHECS en plus des succès ;
 *  - preuves volumineuses externalisées (TaskArtifact gzip) ;
 *  - journalisation structurée JSON de bout en bout.
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
  // Sans restriction explicite : catalogue complet + apps connectées.
  if (!agent?.config) return [...listAvailableToolKeys(), "connectors"]
  try {
    const cfg = JSON.parse(agent.config) as { tools?: string[] }
    if (Array.isArray(cfg.tools) && cfg.tools.length > 0) {
      return cfg.tools.filter(
        (t) =>
          // Outils statiques du catalogue.
          getToolCatalog().some((c) => c.key === t) ||
          // Outils connector : joker global, préfixe d'app ou action exacte.
          t === "connectors" ||
          t === "connector" ||
          /^connector[:_]/.test(t)
      )
    }
  } catch {
    /* configuration illisible : tous les outils */
  }
  return [...listAvailableToolKeys(), "connectors"]
}

/** Pondérations : utilisateur > système (admin) > défauts. */
function resolveWeights(user: User): EvaluationWeights {
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
  /** v4.0 — fournisseur/modèle réellement utilisé (facturation juste). */
  provider?: string
  model?: string
}

async function chargePhase(
  task: Task,
  user: User,
  meter: TokenMeter,
  phase: string,
  providerLabel: string
): Promise<void> {
  if (meter.tokensIn === 0 && meter.tokensOut === 0) return
  // v4.0 — le fournisseur RÉELLEMENT utilisé fixe le tarif (plus de « zai »
  // codé en dur : les exécutions HF/Gemini sont facturées au bon prix).
  const effectiveProvider = meter.provider || providerLabel || "auto"
  const credits = Math.max(0.01, creditsForTokens(effectiveProvider, meter.model ?? "auto", meter.tokensIn, meter.tokensOut))
  await chargeCredits(user.id, credits, {
    type: phase === "PLANNING" ? "PLAN_GENERATION" : "TASK_EXECUTION",
    description: `Phase ${phase} (${effectiveProvider}${meter.model ? ` · ${meter.model}` : ""}) — ${meter.tokensIn} tokens entrée / ${meter.tokensOut} sortie`,
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
}

function parseJsonField<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const EMPTY_ANALYSIS: PromptAnalysis = {
  intent: "", goals: [], constraints: [], requiredCapabilities: [], risks: [],
  successCriteria: [], failureCriteria: [], estimatedComplexity: "MEDIUM",
  estimatedSteps: 3, language: "fr", clarificationNeeded: false,
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
 * terminée, annulée ou en attente (humain ou approbation de plan).
 */
export async function advanceTask(
  taskId: string,
  options?: { budgetMs?: number }
): Promise<Task | null> {
  const loaded = await loadTask(taskId)
  if (!loaded) return null
  let { task, user, agent } = loaded
  const startedAt = Date.now()

  const budgetEnd = Date.now() + (options?.budgetMs ?? PHASE_BUDGET_MS)
  const settings = { ...DEFAULT_USER_SETTINGS, ...parseJsonField(user.settings ?? "{}", {}) }
  const maxAttempts = Math.max(1, Math.min(5, settings.maxAttempts ?? DEFAULT_MAX_EXECUTION_ATTEMPTS))
  const allowedTools = agentAllowedTools(agent)
  const log = rootLogger.child({ taskId: task.id, userId: user.id, phase: "ORCHESTRATOR" })

  // Tâche déjà terminée / en attente : rien à faire.
  if (["COMPLETED", "FAILED", "CANCELLED", "WAITING_FOR_HUMAN", "WAITING_PLAN_APPROVAL"].includes(task.status)) {
    return task
  }

  // v3.1 — circuit breaker global : budget de retries persisté épuisé.
  const systemSettings = await getSystemSettings()
  const retryBudget = {
    spent: task.totalRetries,
    max: systemSettings.maxTotalRetries,
    onSpend: async (total: number) => {
      await db.task.update({ where: { id: task.id }, data: { totalRetries: total } }).catch(() => undefined)
    },
  }
  if (task.totalRetries >= retryBudget.max) {
    const err = new RetryBudgetExceededError(task.totalRetries, retryBudget.max)
    await transitionTask(task, "FAILED", { error: err.userMessage.slice(0, 500) }).catch(() => undefined)
    await audit(null, {
      userId: user.id, action: "TASK_FAILED_RETRY_BUDGET", entityType: "task", entityId: task.id,
    })
    await recordOrchestratorRun({
      taskId: task.id, userId: user.id, ok: false, durationMs: 0,
      errorCode: "RETRY_BUDGET_EXCEEDED", detail: { totalRetries: task.totalRetries },
    })
    return await db.task.findUniqueOrThrow({ where: { id: task.id } })
  }

  const memories = await recallMemories(user.id, { query: task.prompt, agentId: agent?.id, limit: 5 })
  const memoryStrings = memories.map((m) => m.content)

  // Contexte RAG : documents de l'utilisateur (et de l'agent si défini).
  let knowledgeContext = ""
  try {
    // v3.6 — RAG ajustable par agent : poids sémantique/lexical + re-rank.
    const agentRagConfig = agent
      ? parseJsonField<{ rag?: { semanticWeight?: number; rerank?: boolean } }>(agent.config, {})
      : {}
    const hits = await searchKnowledge(user.id, task.prompt, 3, {
      semanticWeight: agentRagConfig.rag?.semanticWeight,
      rerank: agentRagConfig.rag?.rerank,
      userId: user.id,
    })
    if (hits.length > 0) {
      knowledgeContext = hits.map((h) => `[${h.title}] ${h.text.slice(0, 900)}`).join("\n\n")
    }
  } catch {
    /* pas de base de connaissances */
  }

  // v3.1 — boucle de feedback : l'historique influence planification + évaluation.
  const feedback = await feedbackSnapshot(user.id)

  const ctx: EngineContext = {
    taskId: task.id,
    userId: user.id,
    agentId: agent?.id ?? null,
    plan: user.plan,
    settings: {
      maxAttempts,
      confirmDangerousOps: settings.confirmDangerousOps,
      planApproval: settings.planApproval ?? "auto",
    },
    allowedTools,
    memories: memoryStrings,
    knowledgeContext,
    logger: log,
    retryBudget,
  }

  const { analysis: analysisEngine, planner: plannerEngine, evaluator: evaluatorEngine, ethics: ethicsEngine, executor: executorEngine, verification: verificationEngine, learning: learningEngine } = engines()

  try {
    // ---------------- Phase ANALYZING ----------------
    if (task.status === "QUEUED") {
      task = await transitionTask(task, "ANALYZING")
      await recordStep(task.id, "ANALYZING", 0, "Analyse de la demande", "RUNNING")
    }
    if (task.status === "ANALYZING") {
      if (!task.analysis) {
        const execution = await runEngine(analysisEngine, {
          prompt: task.prompt,
          agentName: agent?.name,
          agentSystemPrompt: agent?.systemPrompt ?? undefined,
          memories: memoryStrings,
        }, ctx)
        await mergeTaskJson(task.id, "analysis", execution.value)
        await chargePhase(task, user, execution, "ANALYZING", "zai")
        await recordStep(task.id, "ANALYZING", 0, "Analyse de la demande", "DONE", execution.value)
      }
      task = await transitionTask(task, "PLANNING")
      await recordStep(task.id, "PLANNING", 0, "Génération des 5 plans", "RUNNING")
    }

    // ---------------- Phase PLANNING ----------------
    if (task.status === "PLANNING") {
      if (!task.plans) {
        const previousFailure = parseJsonField<CorrectionLogEntry[]>(task.correctionLog, [])
          .filter((c) => c.strategy === "REPLAN")
          .map((c) => c.error)
          .pop()
        const execution = await runEngine(plannerEngine, {
          prompt: task.prompt,
          analysis: parseJsonField<PromptAnalysis>(task.analysis, EMPTY_ANALYSIS),
          previousFailure,
          memories: memoryStrings,
          feedbackBlock: plannerFeedbackBlock(feedback),
          crossAgentBlock: await crossAgentPatternsBlock(5).catch(() => ""),
          allowedTools,
          // v4.0 — Phase 10 : traçabilité de la sélection multi-modèles.
          userId: user.id,
          taskId: task.id,
          agentId: agent?.id ?? undefined,
          // v4.1 — modèle choisi par l'utilisateur (barre de saisie enrichie).
          preferredModel: task.preferredModel ?? undefined,
        }, ctx)
        if (execution.value.length === 0) {
          throw new EngineError("PLANNING_FAILED", "Le planificateur n'a produit aucun plan exploitable.")
        }
        await mergeTaskJson(task.id, "plans", execution.value)
        await chargePhase(task, user, execution, "PLANNING", "zai")
        await recordStep(task.id, "PLANNING", 0, "Génération des 5 plans", "DONE", {
          plans: execution.value.map((p) => ({ id: p.id, name: p.name })),
          fromCache: (execution.meta?.planCache as string | undefined) ?? null,
        })
      }
      task = await transitionTask(task, "SIMULATING")
      await recordStep(task.id, "SIMULATING", 0, "Évaluation, éthique et sélection du plan optimal", "RUNNING")
    }

    // ---------------- Phase SIMULATING (évaluation + éthique + validation) ----------------
    if (task.status === "SIMULATING") {
      if (!task.planScores) {
        const plans = parseJsonField<Plan[]>(task.plans, [])
        if (plans.length === 0) {
          throw new EngineError("PLANNING_FAILED", "Aucun plan disponible pour l'évaluation.")
        }
        const weights = resolveWeights(user)
        const evaluation = await runEngine(evaluatorEngine, {
          plans,
          weights,
          availableTools: allowedTools,
          userCredits: user.credits,
          feedback,
        }, ctx)

        await mergeTaskJson(task.id, "planScores", {
          scores: evaluation.value.scores,
          selectedPlanId: evaluation.value.selectedPlanId,
          rationale: evaluation.value.rationale,
          weights,
        })
        await db.task.update({ where: { id: task.id }, data: { selectedPlanId: evaluation.value.selectedPlanId } })
        await recordStep(task.id, "SIMULATING", 0, "Évaluation et sélection du plan optimal", "DONE", evaluation.value)
        task = await db.task.findUniqueOrThrow({ where: { id: task.id } })

        // v3.1 — Ethics Engine : usages interdits bloqués avant exécution.
        const ethics = await runEngine(ethicsEngine, {
          prompt: task.prompt,
          plans,
          selectedPlanId: evaluation.value.selectedPlanId,
        }, ctx)
        const blocking = ethics.value.violations.filter((v) => v.severity === "BLOCK")
        const flagged = ethics.value.violations.filter((v) => v.severity === "FLAG")
        if (blocking.length > 0) {
          await mergeTaskJson(task.id, "planScores", {
            scores: evaluation.value.scores,
            selectedPlanId: evaluation.value.selectedPlanId,
            rationale: evaluation.value.rationale,
            weights,
            ethicsViolations: blocking,
          })
          await transitionTask(task, "FAILED", {
            error: `Politique d'éthique : demande refusée (${blocking.map((v) => v.rule).join(", ")}).`,
          })
          await audit(null, {
            userId: user.id, action: "TASK_BLOCKED_ETHICS", entityType: "task", entityId: task.id,
            detail: { rules: blocking.map((v) => v.rule) },
          })
          log.warn("ethics: tâche bloquée", { rules: blocking.map((v) => v.rule) })
          return await db.task.findUniqueOrThrow({ where: { id: task.id } })
        }

        // v3.1 — cache de plans (après validation éthique).
        await plannerEngine.persistCache(ctx, { prompt: task.prompt, analysis: parseJsonField<PromptAnalysis>(task.analysis, EMPTY_ANALYSIS), memories: memoryStrings, allowedTools }, plans, { scores: evaluation.value.scores, rationale: evaluation.value.rationale }, evaluation.value.selectedPlanId)

        // v3.6 — webhook sortant : plans générés et évalués.
        emitPipelineEvent({
          userId: user.id,
          event: "plan.generated",
          payload: {
            taskId: task.id,
            plans: plans.map((p) => ({ id: p.id, name: p.name, steps: p.steps.length, estimatedCostCredits: p.estimatedCostCredits })),
            selectedPlanId: evaluation.value.selectedPlanId,
          },
          agentId: agent?.id ?? null,
          taskId: task.id,
        })

        // v3.1 — mode Explain : approbation manuelle des plans demandée.
        if (ctx.settings.planApproval === "manual") {
          await transitionTask(task, "WAITING_PLAN_APPROVAL")
          await recordStep(task.id, "SIMULATING", 0, "Évaluation et sélection du plan optimal", "DONE", {
            ...evaluation.value,
            awaitingPlanApproval: true,
          })
          await audit(null, {
            userId: user.id, action: "TASK_WAITING_PLAN_APPROVAL", entityType: "task", entityId: task.id,
            detail: { selectedPlanId: evaluation.value.selectedPlanId },
          })
          return await db.task.findUniqueOrThrow({ where: { id: task.id } })
        }

        // Validation pré-exécution : opération sensible → approbation humaine.
        // v4.3 — les outils CONNECTOR participent enfin à cette détection :
        // risque HIGH/CRITICAL du Risk Engine (envoi, suppression…) au lieu
        // du catalogue statique seul (les clés connector_* n'y figurent pas).
        const selected = plans.find((p) => p.id === evaluation.value.selectedPlanId)
        const dangerousTools = (selected?.requiredTools ?? []).filter((t) =>
          parseConnectorToolKey(t)
            ? isPlanRiskyTool(t)
            : getToolCatalog().find((c) => c.key === t)?.dangerous ?? false
        )
        if (
          selected?.requiresHumanConfirmation ||
          (dangerousTools.length > 0 && settings.confirmDangerousOps !== false)
        ) {
          await transitionTask(task, "WAITING_FOR_HUMAN", {
            pendingApproval: JSON.stringify(
              buildPendingApproval({
                reason: `Le plan ${selected?.id} (« ${selected?.name} ») implique des opérations sensibles nécessitant votre confirmation.`,
                planId: selected?.id ?? "?",
                dangerousOperations: dangerousTools.length > 0 ? dangerousTools : ["opération déclarée sensible"],
              })
            ),
          })
          await audit(null, {
            userId: user.id,
            action: "TASK_WAITING_FOR_HUMAN",
            entityType: "task",
            entityId: task.id,
            detail: { planId: selected?.id, dangerousTools, ttlMinutes: Math.round(approvalTtlMs() / 60000) },
          })
          emitPipelineEvent({
            userId: user.id,
            event: "task.awaiting_human",
            payload: { taskId: task.id, planId: selected?.id ?? null, dangerousTools, ttlMinutes: Math.round(approvalTtlMs() / 60000) },
            agentId: agent?.id ?? null,
            taskId: task.id,
          })
          return await db.task.findUniqueOrThrow({ where: { id: task.id } })
        }
        void flagged // les violations FLAG sont visibles dans le rapport d'éthique (détail de l'étape)
      }
      task = await transitionTask(task, "EXECUTING")
    }

    // ---------------- Phase EXECUTING ----------------
    if (task.status === "EXECUTING") {
      const priorExecution = parseJsonField<{ finalAnswer?: string; steps?: ExecutionLogEntry[]; corrective?: string; previousAnswer?: string }>(task.executionLog, {})
      if (!task.executionLog || !priorExecution.finalAnswer) {
        // v3.1 : reprise après crash — les étapes déjà checkpointées sont
        // signalées comme contexte (instruction corrective de reprise).
        const resumeNote = task.executionLog && (priorExecution.steps?.length ?? 0) > 0
          ? `Reprise après interruption : ${priorExecution.steps?.length ?? 0} étape(s) déjà réalisée(s) (${(priorExecution.steps ?? []).slice(-2).map((s) => s.title).join(" ; ")}). Reprends à la suite, sans répéter le travail accompli.`
          : undefined
        const correctiveInstruction = priorExecution.corrective ?? resumeNote

        const plans = parseJsonField<Plan[]>(task.plans, [])
        const analysis = parseJsonField<PromptAnalysis>(task.analysis, EMPTY_ANALYSIS)
        const selected = plans.find((p) => p.id === task.selectedPlanId) ?? plans[0]
        if (!selected) throw new EngineError("EXECUTION_FAILED", "Aucun plan sélectionné pour l'exécution.")

        // v4.3 — HITL du plan déjà scellé (approbation donnée) : les outils
        // sensibles du plan approuvé sont pré-autorisés (plafond HIGH via le
        // gateway ; CRITICAL exige toujours permission ou confirmation).
        const sealedApproval = parseJsonField<{ approved?: boolean }>(task.pendingApproval, {})
        const humanApprovalGiven = sealedApproval.approved === true

        const meter: TokenMeter = { tokensIn: 0, tokensOut: 0 }
        let checkpointSteps: ExecutionLogEntry[] = []
        // v4.0 — Phase 9 : le modèle DÉDIÉ du plan sélectionné guide l'exécution.
        const planModel = selected.model
        const planModelId = planModel?.includes("/") ? planModel.split("/").slice(1).join("/") : planModel

        const outcome = await runEngine(executorEngine, {
          prompt: task.prompt,
          analysis,
          plan: selected,
          executorCtx: {
            userId: user.id,
            taskId: task.id,
            agentId: agent?.id ?? null,
            agentSystemPrompt: agent?.systemPrompt ?? null,
            allowedTools,
            knowledgeContext,
            memories: memoryStrings,
            // v4.0 — Phase 10 : modèle dédié du plan (diversité A-E).
            modelOverride: planModelId
              ?? (task.preferredModel ? (task.preferredModel.includes("/") ? task.preferredModel.split("/").slice(1).join("/") : task.preferredModel) : undefined),
          },
          callbacks: {
            onStepStart: async (i, title) => {
              await recordStep(task.id, "EXECUTING", i, `Étape ${i + 1} : ${title}`, "RUNNING")
            },
            onStepDone: async (entry: ExecutionLogEntry) => {
              await recordStep(task.id, "EXECUTING", entry.stepIndex, `Étape ${entry.stepIndex + 1} : ${entry.title}`, "DONE", {
                output: entry.output.slice(0, 2000),
                evidence: entry.evidence.length,
                latencyMs: entry.latencyMs,
              })
            },
            onStepFailed: async (i, error) => {
              await recordStep(task.id, "EXECUTING", i, `Étape ${i + 1} : échec`, "FAILED", { error })
            },
            onLLMUsage: async (tIn, tOut, _credits, provider?: string, model?: string) => {
              meter.tokensIn += tIn
              meter.tokensOut += tOut
              meter.provider = provider ?? meter.provider
              meter.model = model ?? meter.model
            },
            // v3.1 : HITL déjà donné (approbation du plan) OU confirmations désactivées.
            // v4.3 — outils connector : décision par le moteur de permissions
            // (plafond par permission) — le Risk Engine et le gateway gardent
            // la main en dernier ressort ; un DENY explicite ne se contourne pas.
            authorizeDangerousTool: async (toolKey: string) => {
              if (settings.confirmDangerousOps === false) return true
              const connector = parseConnectorToolKey(toolKey)
              if (connector) {
                // HITL du plan déjà approuvé → couvert (fail-open maîtrisé).
                if (humanApprovalGiven) return true
                const risk = assessToolKeyRisk(toolKey)
                const check = await checkConnectorPermission(
                  user.id,
                  connector.appSlug,
                  connector.actionSlug,
                  risk.level,
                  false
                ).catch(() => null)
                return check?.decision === "ALLOW"
              }
              // Statique (non connector) : confirmations actives → non
              // pré-autorisé (l'executor applique le refus binaire,
              // comportement v3.1 inchangé pour les outils statiques).
              return false
            },
            // v3.1 : checkpoint mi-exécution — un crash ne perd plus les étapes.
            onCheckpoint: async (partial) => {
              checkpointSteps = partial.steps
              await mergeTaskJson(task.id, "executionLog", {
                steps: partial.steps,
                corrective: correctiveInstruction,
              })
            },
          },
          correctiveInstruction,
        }, ctx)

        // v3.1 — preuves volumineuses externalisées (TaskArtifact gzip).
        const lightEvidence = await externalizeEvidence(task.id, outcome.value.evidence, { phase: "EXECUTING" })
        await mergeTaskJson(task.id, "executionLog", {
          steps: outcome.value.steps,
          finalAnswer: outcome.value.finalAnswer,
          evidence: lightEvidence,
          toolsUsed: outcome.value.toolsUsed ?? [],
          toolFailures: outcome.value.toolFailures ?? [],
        })
        await chargePhase(task, user, meter, "EXECUTING", "zai")
        // Télémétrie outils consolidée pour la boucle de feedback.
        await db.task.update({
          where: { id: task.id },
          data: { attempts: { increment: 1 } },
        })
        await recordEngineRunDetailTools(task.id, outcome.value.toolsUsed ?? [], outcome.value.toolFailures ?? [])
        task = await db.task.findUniqueOrThrow({ where: { id: task.id } })
        void checkpointSteps
      }
      task = await transitionTask(task, "VERIFYING")
      await recordStep(task.id, "VERIFYING", 0, "Vérification du résultat", "RUNNING")
    }

    // ---------------- Phase VERIFYING ----------------
    if (task.status === "VERIFYING") {
      if (!task.verification) {
        const analysis = parseJsonField<PromptAnalysis>(task.analysis, EMPTY_ANALYSIS)
        const execution = parseJsonField<{ finalAnswer: string; evidence: Array<{ type: string; description: string; content: string; artifactId?: string; bytes?: number }> }>(
          task.executionLog,
          { finalAnswer: "", evidence: [] }
        )
        // v3.1 : réhydratation des preuves externalisées pour la vérification.
        const fullEvidence = await hydrateEvidence(execution.evidence as never)
        const executionRun = await runEngine(verificationEngine, {
          prompt: task.prompt,
          analysis,
          answer: execution.finalAnswer,
          evidence: fullEvidence as never,
        }, ctx)
        await mergeTaskJson(task.id, "verification", executionRun.value)
        await chargePhase(task, user, executionRun, "VERIFYING", "zai")
        await recordStep(task.id, "VERIFYING", 0, "Vérification du résultat", "DONE", executionRun.value)
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
        await recordOrchestratorRun({
          taskId: task.id, userId: user.id, ok: false, durationMs: Date.now() - startedAt,
          errorCode: "VERIFICATION_FAILED",
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
          // L'apprentissage ne doit jamais faire échouer une tâche réussie.
          if (selected) {
            const learningRun = await runEngine(learningEngine, {
              prompt: task.prompt,
              analysis: parseJsonField<PromptAnalysis>(task.analysis, EMPTY_ANALYSIS),
              plan: selected,
              outcome: "SUCCESS",
              verification: report,
            }, ctx)
            await mergeTaskJson(task.id, "learning", learningRun.value)
            await chargePhase(task, user, learningRun, "LEARNING", "zai")
            // v3.6 — méta-learning cross-agent : patrons généralisés anonymes
            // (partagés avec tous les agents — jamais de contenu utilisateur).
            await recordCrossAgentPatterns({
              userId: user.id,
              input: {
                prompt: task.prompt,
                analysis: parseJsonField<PromptAnalysis>(task.analysis, EMPTY_ANALYSIS),
                plan: selected,
                outcome: "SUCCESS",
                verification: report,
              },
              plan: selected,
            }).catch(() => undefined)
          }
        } catch {
          /* best-effort */
        }
        await recordStep(task.id, "LEARNING", 0, "Apprentissage et mémorisation", "DONE")
      }

      // ---------------- Livraison ----------------
      await recordStep(task.id, "DELIVERING", 0, "Assemblage du livrable", "RUNNING")
      const execution = parseJsonField<{ finalAnswer: string; steps?: ExecutionLogEntry[]; evidence: Array<{ type: string; description: string; content: string; artifactId?: string; bytes?: number }> }>(
        task.executionLog,
        { finalAnswer: "", steps: [], evidence: [] }
      )
      const plans = parseJsonField<Plan[]>(task.plans, [])
      const selected = plans.find((p) => p.id === task.selectedPlanId)
      const result = {
        answer: execution.finalAnswer,
        summary: selected?.name ?? "",
        plan: { id: selected?.id, name: selected?.name, strategy: selected?.strategy },
        steps: execution.steps?.map((s: { stepIndex: number; title: string; output: string; status: string; latencyMs?: number }) => ({
          index: s.stepIndex, title: s.title, status: s.status, latencyMs: s.latencyMs ?? null,
        })),
        evidence: execution.evidence,
        verification: parseJsonField<VerificationReport>(task.verification, null as unknown as VerificationReport),
        metrics: {
          tokensIn: task.tokensIn,
          tokensOut: task.tokensOut,
          credits: task.costCredits,
          attempts: task.attempts,
          totalRetries: task.totalRetries, // v3.1 : visibilité du circuit breaker
        },
      }
      await mergeTaskJson(task.id, "result", result)
      await recordStep(task.id, "DELIVERING", 0, "Assemblage du livrable", "DONE", {
        tokens: task.tokensIn + task.tokensOut,
        credits: task.costCredits,
      })
      task = await transitionTask(task, "COMPLETED")
      // v3.6 — webhook sortant : tâche terminée.
      emitPipelineEvent({
        userId: user.id,
        event: "task.completed",
        payload: {
          taskId: task.id,
          costCredits: task.costCredits,
          tokensIn: task.tokensIn,
          tokensOut: task.tokensOut,
          attempts: task.attempts,
        },
        agentId: agent?.id ?? null,
        taskId: task.id,
      })
      await audit(null, {
        userId: user.id, action: "TASK_COMPLETED", entityType: "task", entityId: task.id,
        detail: { credits: task.costCredits, attempts: task.attempts, totalRetries: task.totalRetries },
      })
      await recordOrchestratorRun({
        taskId: task.id, userId: user.id, ok: true, durationMs: Date.now() - startedAt,
        detail: { attempts: task.attempts, credits: task.costCredits },
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
    return handlePipelineError(err, { task, user, agent, log, startedAt })
  }
}

async function handlePipelineError(
  err: unknown,
  env: {
    task: Task
    user: User
    agent: TaskAgent | null
    log: import("@/lib/observability/logger").Logger
    startedAt: number
  }
): Promise<Task> {
  const { task, user, agent, log, startedAt } = env
  const fresh = await db.task.findUnique({ where: { id: task.id } })
  const current = fresh ?? task

  if (err instanceof InsufficientCreditsError) {
    await transitionTask(current, "FAILED", { error: err.message }).catch(() => undefined)
    await recordOrchestratorRun({ taskId: current.id, userId: user.id, ok: false, durationMs: Date.now() - startedAt, errorCode: "INSUFFICIENT_CREDITS" })
    return await db.task.findUniqueOrThrow({ where: { id: current.id } })
  }
  if (err instanceof RetryBudgetExceededError) {
    await appendCorrection(current.id, {
      attempt: current.attempts,
      phase: current.status,
      error: err.userMessage.slice(0, 400),
      classification: "CONTEXT",
      attribution: "Budget global de tentatives épuisé (circuit breaker).",
      strategy: "ABORT",
      action: "Arrêt propre — protection contre les boucles infinies de correction.",
      outcome: "ABORTED",
    }).catch(() => undefined)
    await transitionTask(current, "FAILED", { error: err.userMessage.slice(0, 500) }).catch(() => undefined)
    await recordOrchestratorRun({ taskId: current.id, userId: user.id, ok: false, durationMs: Date.now() - startedAt, errorCode: "RETRY_BUDGET_EXCEEDED" })
    return await db.task.findUniqueOrThrow({ where: { id: current.id } })
  }
  if (err instanceof ReplanRequiredError) {
    // Le replan est déjà comptabilisé dans les corrections ; on relance la planification.
    // v3.1 : plafond de replans (anti-boucle infinie REPLAN ↔ exécution).
    const replanCount = parseJsonField<CorrectionLogEntry[]>(current.correctionLog, []).filter(
      (c) => c.strategy === "REPLAN"
    ).length
    if (replanCount >= 3) {
      await transitionTask(current, "FAILED", {
        error: `Arrêt après ${replanCount} replanifications — la stratégie est probablement inadaptée à cette demande.`,
      }).catch(() => undefined)
      await recordOrchestratorRun({ taskId: current.id, userId: user.id, ok: false, durationMs: Date.now() - startedAt, errorCode: "PLANNING_FAILED" })
      return await db.task.findUniqueOrThrow({ where: { id: current.id } })
    }
    await db.task.update({ where: { id: current.id }, data: { plans: null, planScores: null, selectedPlanId: null, executionLog: null } }).catch(() => undefined)
    const after = await db.task.findUniqueOrThrow({ where: { id: current.id } })
    if (after.status === "EXECUTING" || after.status === "VERIFYING") {
      await transitionTask(after, "PLANNING").catch(() => undefined)
      const next = await db.task.findUniqueOrThrow({ where: { id: current.id } })
      if (next.status === "PLANNING") {
        return (await advanceTask(current.id, { budgetMs: 45_000 })) ?? next
      }
      return next
    }
    return after
  }

  const analysis = analyzeError(err)
  const message = err instanceof Error ? err.message : String(err)
  const errorCode = err instanceof AppError ? err.code : null
  await appendCorrection(current.id, {
    attempt: current.attempts,
    phase: current.status,
    error: message.slice(0, 400),
    classification: analysis.classification,
    attribution: analysis.attribution,
    strategy: analysis.strategy,
    action: "Arrêt de la tâche après épuisement des stratégies de correction.",
    outcome: "ABORTED",
  }).catch(() => undefined)

  // v3.1 — apprentissage sur les ÉCHECS (best-effort, jamais bloquant).
  try {
    const plans = parseJsonField<Plan[]>(current.plans, [])
    const selected = plans.find((p) => p.id === current.selectedPlanId) ?? plans[0]
    if (selected) {
      const { learning: learningEngine } = engines()
      await runEngine(learningEngine, {
        prompt: current.prompt,
        analysis: parseJsonField<PromptAnalysis>(current.analysis, EMPTY_ANALYSIS),
        plan: selected,
        outcome: "FAILURE",
        error: message.slice(0, 400),
      }, {
        taskId: current.id,
        userId: user.id,
        agentId: agent?.id ?? null,
        settings: { maxAttempts: 1, confirmDangerousOps: true, planApproval: "auto" },
        allowedTools: [],
        memories: [],
        knowledgeContext: "",
        logger: log,
      })
      // v3.6 — méta-learning cross-agent sur échec : patrons d'échec
      // généralisés, partagés anonymement avec tous les agents.
      await recordCrossAgentPatterns({
        userId: user.id,
        input: {
          prompt: current.prompt,
          analysis: parseJsonField<PromptAnalysis>(current.analysis, EMPTY_ANALYSIS),
          plan: selected,
          outcome: "FAILURE",
          error: message.slice(0, 400),
        },
        plan: selected,
      }).catch(() => undefined)
    }
  } catch {
    // L'apprentissage d'échec ne doit jamais masquer l'erreur d'origine.
  }

  await transitionTask(current, "FAILED", { error: message.slice(0, 500) }).catch(() => undefined)
  await audit(null, {
    userId: user.id, action: "TASK_FAILED", entityType: "task", entityId: current.id, detail: { message, errorCode },
  })
  // v3.6 — webhook sortant : tâche échouée.
  emitPipelineEvent({
    userId: user.id,
    event: "task.failed",
    payload: { taskId: current.id, errorCode, message: message.slice(0, 300), attempts: current.attempts },
    agentId: agent?.id ?? null,
    taskId: current.id,
  })
  await recordOrchestratorRun({
    taskId: current.id, userId: user.id, ok: false, durationMs: Date.now() - startedAt,
    errorCode, detail: { classification: analysis.classification },
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
  log.error("pipeline échoué", { error: message, code: errorCode })
  return await db.task.findUniqueOrThrow({ where: { id: current.id } })
}

/**
 * v3.6 — HITL durci : expiration automatique des demandes d'approbation.
 * Annule les tâches restées en attente au-delà du TTL (fail-safe) et
 * journalise l'expiration. Appelé paresseusement aux lectures de tâches.
 */
export async function enforceApprovalExpiry(taskId: string): Promise<Task | null> {
  const task = await db.task.findUnique({ where: { id: taskId } })
  if (!task) return null
  if (task.status !== "WAITING_FOR_HUMAN" && task.status !== "WAITING_PLAN_APPROVAL") return task
  const pending = parseJsonField<Record<string, unknown>>(task.pendingApproval, {})
  if (task.status === "WAITING_FOR_HUMAN" && !isApprovalExpired(pending)) return task
  // WAITING_PLAN_APPROVAL sans pendingApproval (approbation de plan pure) :
  // expiration basée sur updatedAt + TTL.
  const ageMs = Date.now() - task.updatedAt.getTime()
  if (task.status === "WAITING_PLAN_APPROVAL" && ageMs < approvalTtlMs()) return task

  const reason =
    task.status === "WAITING_FOR_HUMAN"
      ? "Demande d'approbation expirée (aucune décision humaine dans le délai imparti)."
      : "Approbation de plan expirée (aucune décision humaine dans le délai imparti)."
  await audit(null, {
    userId: task.userId,
    action: "TASK_APPROVAL_EXPIRED",
    entityType: "task",
    entityId: task.id,
    detail: { previousStatus: task.status, reason },
  })
  emitPipelineEvent({
    userId: task.userId,
    event: "task.approval_expired",
    payload: { taskId: task.id, previousStatus: task.status, reason },
    taskId: task.id,
  })
  await transitionTask(task, "CANCELLED", { error: reason }).catch(() => undefined)
  const updated = await db.task.findUnique({ where: { id: task.id } })
  return updated ?? task
}

/** Approuve ou refuse une tâche en attente d'humain (HITL). */
export async function resolveHumanApproval(
  taskId: string,
  userId: string,
  approved: boolean,
  reason?: string,
  decisionMeta?: ApprovalDecisionMeta
): Promise<Task> {
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } })
  if (task.userId !== userId) {
    throw new AppError("FORBIDDEN", { message: "Tâche non autorisée." })
  }
  if (task.status !== "WAITING_FOR_HUMAN") {
    throw new AppError("TASK_NOT_APPROVABLE")
  }

  // v3.6 — expiration : une demande dépassée ne peut plus être approuvée.
  const pending = parseJsonField<Record<string, unknown>>(task.pendingApproval, {})
  if (isApprovalExpired(pending)) {
    await audit(null, {
      userId, action: "TASK_APPROVAL_EXPIRED",
      entityType: "task", entityId: taskId,
      detail: { decisionAttempted: approved ? "APPROVE" : "REJECT", reason },
    })
    await transitionTask(task, "CANCELLED", {
      error: "Demande d'approbation expirée (aucune décision humaine dans le délai imparti).",
    })
    throw new AppError("VALIDATION_ERROR", {
      message: "La demande d'approbation a expiré. Relancez la tâche pour régénérer le plan.",
    })
  }

  const meta: ApprovalDecisionMeta = decisionMeta ?? {
    decidedBy: userId,
    decidedByEmail: null,
    decidedAt: new Date().toISOString(),
    ip: null,
    userAgent: null,
  }
  // v3.6 — traçabilité renforcée : la décision scellée est persistée SUR la tâche.
  await db.task.update({
    where: { id: taskId },
    data: {
      pendingApproval: JSON.stringify({
        ...pending,
        approved,
        reason: reason ?? null,
        decidedBy: meta.decidedBy,
        decidedByEmail: meta.decidedByEmail,
        decidedAt: meta.decidedAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      }),
    },
  })
  await audit(null, {
    userId, action: approved ? "TASK_APPROVED" : "TASK_REJECTED",
    entityType: "task", entityId: taskId,
    detail: { reason, decidedBy: meta.decidedBy, ip: meta.ip, userAgent: meta.userAgent, approved },
  })
  if (approved) {
    emitPipelineEvent({
      userId: task.userId,
      event: "task.approved",
      payload: { taskId, planId: (pending as { planId?: string }).planId ?? null, decidedBy: meta.decidedBy },
      taskId,
    })
    const updated = await transitionTask(task, "EXECUTING")
    return (await advanceTask(updated.id)) ?? updated
  }
  emitPipelineEvent({
    userId: task.userId,
    event: "task.cancelled",
    payload: { taskId, reason: reason ?? "Refusé par l'utilisateur." },
    taskId,
  })
  return transitionTask(task, "CANCELLED", { error: reason ?? "Refusé par l'utilisateur." })
}

/**
 * v3.1 — Mode Explain : résout l'approbation de plan.
 * L'utilisateur peut sélectionner un autre plan, ÉDITER ses étapes,
 * régénérer, ou refuser. La sélection manuelle prime sur le score.
 */
export interface PlanApprovalInput {
  approved: boolean
  planId?: string
  /** Étapes éditées (remplacent celles du plan sélectionné). */
  editedSteps?: Array<{ title: string; detail: string; tool?: string }>
  regenerate?: boolean
  reason?: string
}

export async function resolvePlanApproval(
  taskId: string,
  userId: string,
  input: PlanApprovalInput,
  decisionMeta?: ApprovalDecisionMeta
): Promise<Task> {
  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } })
  if (task.userId !== userId) {
    throw new AppError("FORBIDDEN", { message: "Tâche non autorisée." })
  }
  if (task.status !== "WAITING_PLAN_APPROVAL") {
    throw new AppError("TASK_NOT_APPROVABLE", {
      message: "Cette tâche n'est pas en attente d'approbation de plan.",
    })
  }

  // v3.6 — expiration de l'approbation de plan (TTL depuis la mise en attente).
  if (Date.now() - task.updatedAt.getTime() > approvalTtlMs()) {
    await audit(null, {
      userId,
      action: "TASK_APPROVAL_EXPIRED",
      entityType: "task",
      entityId: taskId,
      detail: { previousStatus: "WAITING_PLAN_APPROVAL", decisionAttempted: input.approved ? "APPROVE" : "REJECT" },
    })
    await transitionTask(task, "CANCELLED", { error: "Approbation de plan expirée (aucune décision humaine dans le délai imparti)." })
    throw new AppError("VALIDATION_ERROR", {
      message: "L'approbation du plan a expiré. Relancez la tâche.",
    })
  }

  const plans = parseJsonField<Plan[]>(task.plans, [])
  const scores = parseJsonField<{ selectedPlanId?: string; rationale?: string }>(task.planScores, {})

  emitPipelineEvent({
    userId,
    event: input.regenerate ? "plan.rejected" : input.approved ? "plan.approved" : "plan.rejected",
    payload: { taskId, planId: input.planId ?? null, edited: (input.editedSteps?.length ?? 0) > 0, regenerate: input.regenerate ?? false },
    taskId,
  })
  await audit(null, {
    userId,
    action: input.regenerate ? "TASK_PLANS_REGENERATE" : input.approved ? "TASK_PLAN_APPROVED" : "TASK_PLAN_REJECTED",
    entityType: "task",
    entityId: taskId,
    detail: {
      planId: input.planId,
      edited: (input.editedSteps?.length ?? 0) > 0,
      reason: input.reason,
      // v3.6 — traçabilité renforcée de la décision humaine.
      decidedBy: decisionMeta?.decidedBy ?? userId,
      ip: decisionMeta?.ip ?? null,
      userAgent: decisionMeta?.userAgent ?? null,
    },
  })

  // Régénération : retour à la planification (force le cache à ignorer l'entrée).
  if (input.regenerate) {
    await mergeTaskJson(taskId, "planScores", null)
    await db.task.update({
      where: { id: taskId },
      data: { plans: null, planScores: null, selectedPlanId: null },
    })
    const fresh = await db.task.findUniqueOrThrow({ where: { id: taskId } })
    await transitionTask(fresh, "PLANNING").catch(async () => {
      // SIMULATING → PLANNING n'est pas direct : transition via replan interne.
      await transitionTask(fresh, "CANCELLED")
    })
    return (await advanceTask(taskId)) ?? fresh
  }

  if (!input.approved) {
    return transitionTask(task, "CANCELLED", { error: input.reason ?? "Plan refusé par l'utilisateur." })
  }

  // Sélection (défaut : le plan recommandé par l'évaluateur).
  const planId = input.planId ?? scores.selectedPlanId ?? plans[0]?.id
  const selected = plans.find((p) => p.id === planId)
  if (!selected) {
    throw new AppError("VALIDATION_ERROR", { message: `Plan « ${planId} » introuvable.` })
  }

  // Édition des étapes (mode Explain complet).
  if (input.editedSteps && input.editedSteps.length > 0) {
    if (input.editedSteps.length > 8) {
      throw new AppError("VALIDATION_ERROR", { message: "Un plan ne peut dépasser 8 étapes." })
    }
    for (const step of input.editedSteps) {
      if (step.title.trim().length < 3 || step.detail.trim().length < 5) {
        throw new AppError("VALIDATION_ERROR", { message: "Chaque étape exige un titre (≥ 3 car.) et un détail (≥ 5 car.)." })
      }
    }
    const editedSteps: PlanStep[] = input.editedSteps.map((s) => ({
      title: s.title.trim().slice(0, 200),
      detail: s.detail.trim().slice(0, 2000),
      tool: s.tool,
    }))
    selected.steps = editedSteps
    selected.requiredTools = [...new Set(editedSteps.map((s) => s.tool).filter((t): t is string => Boolean(t)))]
    selected.rationale = "(plan édité manuellement par l'utilisateur)"
    await mergeTaskJson(taskId, "plans", plans)
  }

  // Sélection manuelle : prime sur le score, traçable dans le rapport.
  await mergeTaskJson(taskId, "planScores", {
    ...scores,
    selectedPlanId: selected.id,
    rationale: `Sélection manuelle (mode Explain) : plan ${selected.id} « ${selected.name} » retenu par l'utilisateur.`,
  })
  await db.task.update({ where: { id: taskId }, data: { selectedPlanId: selected.id } })

  // Opérations sensibles → HITL après sélection manuelle (défense en profondeur).
  // v4.3 — détection étendue aux outils connector (Risk Engine).
  const owner = await db.user.findUnique({ where: { id: userId }, select: { settings: true } })
  const settings = { ...DEFAULT_USER_SETTINGS, ...parseJsonField(owner?.settings ?? "{}", {}) }
  const dangerousTools = selected.requiredTools.filter((t) =>
    parseConnectorToolKey(t)
      ? isPlanRiskyTool(t)
      : getToolCatalog().find((c) => c.key === t)?.dangerous ?? false
  )
  if (selected.requiresHumanConfirmation || (dangerousTools.length > 0 && settings.confirmDangerousOps !== false)) {
    const updated = await db.task.findUniqueOrThrow({ where: { id: taskId } })
    await transitionTask(updated, "WAITING_FOR_HUMAN", {
      pendingApproval: JSON.stringify(
        buildPendingApproval({
          reason: `Le plan ${selected.id} (« ${selected.name} ») implique des opérations sensibles nécessitant votre confirmation.`,
          planId: selected.id,
          dangerousOperations: dangerousTools.length > 0 ? dangerousTools : ["opération déclarée sensible"],
        })
      ),
    })
    return db.task.findUniqueOrThrow({ where: { id: taskId } })
  }

  const updated = await transitionTask(task, "EXECUTING")
  return (await advanceTask(updated.id)) ?? updated
}

/** Télémétrie outils consolidée par exécution (boucle de feedback Learning). */
async function recordEngineRunDetailTools(
  taskId: string,
  toolsUsed: string[],
  toolFailures: string[]
): Promise<void> {
  try {
    const latest = await db.engineRun.findFirst({
      where: { taskId, engine: "EXECUTOR" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    if (latest) {
      await db.engineRun.update({
        where: { id: latest.id },
        data: { detail: JSON.stringify({ tools: toolsUsed, toolFailures }) },
      })
    }
  } catch {
    // best-effort
  }
}

export { NoProviderError }
