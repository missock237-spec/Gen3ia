import { db } from "@/lib/db"
import { BaseEngine, registerEngine, type EngineContext, type EngineExecution } from "./sdk"
import { analyzePrompt } from "./prompt-analysis"
import { generatePlans } from "./planner"
import { evaluatePlans } from "./evaluator"
import { executePlan, type ExecutorCallbacks, type ExecutorContext, type ExecutorOutcome } from "./executor"
import { verifyResult, type VerificationInput } from "./verification"
import { extractLearning } from "./learning"
import { runWithSelfCorrection } from "./self-correction"
import { lookupPlanCache, storePlanCache } from "./plan-cache"
import type { FeedbackSnapshot } from "./feedback"
import type { EvaluationWeights, Plan, PromptAnalysis, VerificationReport } from "./types"
import { recordEngineRun } from "@/lib/observability/metrics"
import { SwarmEngine } from "./swarm"
import { DebateEngine } from "./debate"

/**
 * Implémentations concrètes du SDK de moteurs (amélioration « SDK de Moteurs »).
 *
 * Chaque moteur du pipeline est un adaptateur conforme au contrat
 * EngineInterface { execute, rollback, getStatus }. Les fonctions métier
 * restent dans leurs modules (testables isolément) ; ces classes ajoutent :
 *  - la conformité au contrat (registre, santé, rollback par phase) ;
 *  - le câblage transversal (self-correction, budget de retries, cache,
 *    télémétrie — via runEngine dans sdk.ts).
 *
 * L'EthicsEngine démontre l'extensibilité promise : un NOUVEAU moteur
 * s'ajoute en implémentant l'interface et en s'enregistrant — aucune
 * modification du cœur n'est nécessaire.
 */

// ------------------------------------------------------------------
// 1. Prompt Analysis Engine
// ------------------------------------------------------------------

export interface PromptAnalysisInput {
  prompt: string
  agentName?: string | null
  agentSystemPrompt?: string
  memories: string[]
}

export class PromptAnalysisEngine extends BaseEngine<PromptAnalysisInput, PromptAnalysis> {
  readonly name = "PROMPT_ANALYSIS" as const
  readonly description = "Analyse la demande : intention, objectifs, contraintes, risques, critères de succès."
  readonly phase = "ANALYZING" as const
  readonly errorCode = "ANALYSIS_FAILED" as const

  async execute(input: PromptAnalysisInput, ctx: EngineContext): Promise<EngineExecution<PromptAnalysis>> {
    const meter = { tokensIn: 0, tokensOut: 0 }
    let attempts = 1
    const { value } = await runWithSelfCorrection(
      async () => {
        const r = await analyzePrompt(input.prompt, {
          agentName: input.agentName ?? undefined,
          agentSystemPrompt: input.agentSystemPrompt,
          memories: input.memories,
        })
        meter.tokensIn += r.tokensIn
        meter.tokensOut += r.tokensOut
        return r.analysis
      },
      {
        phase: "ANALYZING",
        maxAttempts: 2,
        attempt: 0,
        retryBudget: ctx.retryBudget,
      }
    ).then((r) => {
      attempts = r.attempts
      return r
    })
    return { value, tokensIn: meter.tokensIn, tokensOut: meter.tokensOut, durationMs: 0, attempts }
  }

  async rollback(ctx: EngineContext): Promise<void> {
    await db.task.update({
      where: { id: ctx.taskId },
      data: { analysis: null },
    }).catch(() => undefined)
  }
}

// ------------------------------------------------------------------
// 2. Planner Engine (cache de plans + feedback)
// ------------------------------------------------------------------

export interface PlannerInput {
  prompt: string
  analysis: PromptAnalysis
  previousFailure?: string
  memories: string[]
  feedbackBlock?: string
  /** v3.6 — patrons cross-agents anonymes (leçons collectives). */
  crossAgentBlock?: string
  allowedTools: string[]
}

export class PlannerEngine extends BaseEngine<PlannerInput, Plan[]> {
  readonly name = "PLANNER" as const
  readonly description = "Génère 5 plans contrastés (A-E) — avec cache sémantique et retour d'expérience."
  readonly phase = "PLANNING" as const
  readonly errorCode = "PLANNING_FAILED" as const

  async execute(input: PlannerInput, ctx: EngineContext): Promise<EngineExecution<Plan[]>> {
    // 1. Cache de plans (exact puis sémantique ≥ 0.92).
    const cached = await lookupPlanCache(ctx.userId, input.prompt)
    if (cached) {
      return {
        value: cached.plans,
        tokensIn: 0,
        tokensOut: 0,
        durationMs: 0,
        attempts: 0,
        meta: { planCache: cached.hitType, similarity: cached.similarity },
      }
    }

    // 2. Génération LLM avec auto-correction.
    const meter = { tokensIn: 0, tokensOut: 0 }
    let attempts = 1
    const result = await runWithSelfCorrection(
      async (retryCtx) => {
        const r = await generatePlans(input.prompt, input.analysis, {
          previousFailure: input.previousFailure ?? retryCtx.previousError,
          memories: input.memories,
          feedbackBlock: input.feedbackBlock,
          crossAgentBlock: input.crossAgentBlock,
          allowedTools: input.allowedTools,
        })
        meter.tokensIn += r.tokensIn
        meter.tokensOut += r.tokensOut
        return r.plans
      },
      {
        phase: "PLANNING",
        maxAttempts: 2,
        attempt: 0,
        retryBudget: ctx.retryBudget,
      }
    )
    attempts = result.attempts
    const plans = result.value

    return { value: plans, tokensIn: meter.tokensIn, tokensOut: meter.tokensOut, durationMs: 0, attempts }
  }

  async rollback(ctx: EngineContext): Promise<void> {
    await db.task.update({
      where: { id: ctx.taskId },
      data: { plans: null, planScores: null, selectedPlanId: null },
    }).catch(() => undefined)
  }

  /** Enregistre le cache (appelé par l'orchestrateur après évaluation). */
  async persistCache(ctx: EngineContext, input: PlannerInput, plans: Plan[], evaluation: unknown, selectedPlanId: string) {
    await storePlanCache({
      userId: ctx.userId,
      prompt: input.prompt,
      plans,
      planScores: evaluation,
      selectedPlanId,
    })
  }
}

// ------------------------------------------------------------------
// 3. Evaluator Engine (feedback actionnable)
// ------------------------------------------------------------------

export interface EvaluatorInput {
  plans: Plan[]
  weights?: Partial<EvaluationWeights>
  availableTools: string[]
  userCredits: number
  feedback?: FeedbackSnapshot
}

export interface EvaluatorOutput {
  scores: ReturnType<typeof evaluatePlans>["scores"]
  selectedPlanId: Plan["id"]
  rationale: string
}

export class EvaluatorEngine extends BaseEngine<EvaluatorInput, EvaluatorOutput> {
  readonly name = "EVALUATOR" as const
  readonly description = "Note chaque plan (6 critères pondérés) et sélectionne le meilleur — corrigé par l'historique."
  readonly phase = "SIMULATING" as const
  readonly errorCode = "EVALUATION_FAILED" as const

  async execute(input: EvaluatorInput, _ctx?: EngineContext): Promise<EngineExecution<EvaluatorOutput>> {
    const evaluation = evaluatePlans(input)
    return { value: evaluation, tokensIn: 0, tokensOut: 0, durationMs: 0, attempts: 1 }
  }

  async rollback(ctx: EngineContext): Promise<void> {
    await db.task.update({
      where: { id: ctx.taskId },
      data: { planScores: null },
    }).catch(() => undefined)
  }
}

// ------------------------------------------------------------------
// 4. Ethics Engine — nouveau moteur v3.1 (extensibilité du SDK)
// ------------------------------------------------------------------

export interface EthicsViolation {
  rule: string
  severity: "BLOCK" | "FLAG"
  evidence: string
  planId?: string
}

export interface EthicsInput {
  prompt: string
  plans: Plan[]
  selectedPlanId: string
}

export interface EthicsOutput {
  violations: EthicsViolation[]
  checkedPlans: string[]
}

interface PolicyRule {
  id: string
  severity: "BLOCK" | "FLAG"
  patterns: RegExp[]
  description: string
}

/**
 * Politique d'éthique déterministe (règles réelles, sans LLM — auditable
 * et testable). Un moteur LLM d'éthique pourrait être branché plus tard via
 * le même contrat ; les règles déterministes forment le socle non contournable.
 */
const POLICY_RULES: PolicyRule[] = [
  {
    id: "MALWARE",
    severity: "BLOCK",
    description: "Création de logiciels malveillants, ransomware, exploits, botnets.",
    patterns: [
      /(\bwrite|create|develop|build|code)\b[^.]{0,60}\b(ransomware|malware|keylogger|botnet|rootkit|trojan|worm|exploit\s+kit|zero-?day\s+exploit)\b/i,
      /\b(ransomware|keylogger|botnet|rootkit)\b[^.]{0,40}\b(code|script|source|payload)\b/i,
      /(cré[ée]r|développe|rédige|écris)[^.]{0,60}(ransomware|malware|keylogger|botnet|cheval de Troie|exploit)/i,
    ],
  },
  {
    id: "PHISHING",
    severity: "BLOCK",
    description: "Hameçonnage, ingénierie sociale frauduleuse, faux sites de connexion.",
    patterns: [
      /\b(phishing|phising)\b[^.]{0,50}\b(page|site|email|campaign|kit|template)\b/i,
      /(cré[ée]r|create)[^.]{0,50}(fausse page|fake login|page de connexion frauduleuse|email d'hameçonnage)/i,
    ],
  },
  {
    id: "WEAPONS",
    severity: "BLOCK",
    description: "Fabrication d'armes, explosifs ou drogues.",
    patterns: [
      /(fabricat|synth[ée]s|make|build|produce)[^.]{0,60}(bombe|explosif|arme à feu|nitroglyc[ée]rine|TNT|C4|m[ée]thamph[ée]tamine|sarin|ricin)/i,
      /\b(how to make|comment fabriquer)\b[^.]{0,60}\b(bomb|explosive|meth|poison|nerve agent)\b/i,
    ],
  },
  {
    id: "FRAUD",
    severity: "BLOCK",
    description: "Fraude financière, faux documents, usurpation d'identité.",
    patterns: [
      /(gén[ée]r|create|make|forge|falsifi)[^.]{0,60}(faux (passeport|diplôme|facture|billet de banque|document officiel)| counterfeit)/i,
      /\b(fake passport|forged document|counterfeit money|identity theft)\b/i,
    ],
  },
  {
    id: "MASS_SURVEILLANCE",
    severity: "FLAG",
    description: "Surveillance de masse ou collecte de données personnelles à grande échelle.",
    patterns: [
      /(collect|scrape|harvest)[^.]{0,60}(données personnelles|personal data|adresses e-?mails|numéros de téléphone|profils)[^.]{0,60}(masse|bulk|millions|base complète|base de données complète)/i,
      /\b(scrape|harvest)\b[^.]{0,60}\b(thousands|millions)\b[^.]{0,40}\b(emails|phone numbers|profiles|users)\b/i,
    ],
  },
  {
    id: "DOXXING",
    severity: "BLOCK",
    description: "Publication de données privées identificatoires d'individus.",
    patterns: [
      /\b(doxxing|doxing|doxxer)\b/i,
      /(trouve|find|reveal|publie)[^.]{0,50}(adresse (personnelle|domicile)|numéro de téléphone personnel|localisation exacte de)\b[^.]{0,40}(de|d')\s+\w+/i,
    ],
  },
]

export class EthicsEngine extends BaseEngine<EthicsInput, EthicsOutput> {
  readonly name = "ETHICS" as const
  readonly description = "Politique d'éthique déterministe : bloque les usages interdits, signale les zones sensibles."
  readonly phase = "SIMULATING" as const
  readonly errorCode = "SANDBOX_VIOLATION" as const

  async execute(input: EthicsInput, _ctx?: EngineContext): Promise<EngineExecution<EthicsOutput>> {
    const violations: EthicsViolation[] = []
    const check = (text: string, planId?: string) => {
      for (const rule of POLICY_RULES) {
        for (const pattern of rule.patterns) {
          if (pattern.test(text)) {
            violations.push({
              rule: rule.id,
              severity: rule.severity,
              evidence: text.slice(0, 200),
              planId,
            })
            break // une violation par règle et par texte
          }
        }
      }
    }

    check(input.prompt)
    const selected = input.plans.find((p) => p.id === input.selectedPlanId)
    for (const plan of input.plans) {
      const planText = [plan.name, plan.strategy, ...plan.steps.map((s) => `${s.title} ${s.detail}`)].join("\n")
      check(planText, plan.id)
    }
    if (selected) {
      // Double passage sur le plan sélectionné (celui qui sera exécuté).
      void selected
    }

    return {
      value: { violations, checkedPlans: input.plans.map((p) => p.id) },
      tokensIn: 0,
      tokensOut: 0,
      durationMs: 0,
      attempts: 1,
    }
  }
}

// ------------------------------------------------------------------
// 5. Executor Engine
// ------------------------------------------------------------------

export interface ExecutorInput {
  prompt: string
  analysis: PromptAnalysis
  plan: Plan
  executorCtx: ExecutorContext
  callbacks: ExecutorCallbacks
  correctiveInstruction?: string
}

export class ExecutorEngine extends BaseEngine<ExecutorInput, ExecutorOutcome> {
  readonly name = "EXECUTOR" as const
  readonly description = "Exécute le plan étape par étape (ReAct + outils + preuves)."
  readonly phase = "EXECUTING" as const
  readonly errorCode = "EXECUTION_FAILED" as const

  async execute(input: ExecutorInput, ctx: EngineContext): Promise<EngineExecution<ExecutorOutcome>> {
    const outcome = await executePlan(
      input.prompt,
      input.analysis,
      input.plan,
      input.executorCtx,
      input.callbacks,
      input.correctiveInstruction
    )
    return {
      value: outcome,
      tokensIn: outcome.tokensIn,
      tokensOut: outcome.tokensOut,
      durationMs: 0,
      attempts: 1,
      meta: { toolsUsed: outcome.toolsUsed ?? [], toolFailures: outcome.toolFailures ?? [] },
    }
  }

  async rollback(ctx: EngineContext, err?: unknown): Promise<void> {
    // Les étapes EXECUTING non terminées sont marquées SKIPPED (reprise propre).
    await db.taskStep.updateMany({
      where: { taskId: ctx.taskId, phase: "EXECUTING", status: { in: ["PENDING", "RUNNING", "WAITING"] } },
      data: { status: "SKIPPED", finishedAt: new Date(), title: "Étape annulée (rollback exécuteur)" },
    }).catch(() => undefined)
    ctx.logger.info("executor: rollback effectué", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ------------------------------------------------------------------
// 6. Verification Engine
// ------------------------------------------------------------------

export type { VerificationInput }

export class VerificationEngine extends BaseEngine<VerificationInput, VerificationReport> {
  readonly name = "VERIFICATION" as const
  readonly description = "Vérifie le résultat contre les critères de succès (preuves exigées)."
  readonly phase = "VERIFYING" as const
  readonly errorCode = "VERIFICATION_FAILED" as const

  async execute(input: VerificationInput, ctx: EngineContext): Promise<EngineExecution<VerificationReport>> {
    const meter = { tokensIn: 0, tokensOut: 0 }
    let attempts = 1
    const { value } = await runWithSelfCorrection(
      async () => {
        const r = await verifyResult(input)
        meter.tokensIn += r.tokensIn
        meter.tokensOut += r.tokensOut
        return r.report
      },
      {
        phase: "VERIFYING",
        maxAttempts: 2,
        attempt: 0,
        retryBudget: ctx.retryBudget,
      }
    ).then((r) => {
      attempts = r.attempts
      return r
    })
    return { value, tokensIn: meter.tokensIn, tokensOut: meter.tokensOut, durationMs: 0, attempts }
  }

  async rollback(ctx: EngineContext): Promise<void> {
    await db.task.update({
      where: { id: ctx.taskId },
      data: { verification: null },
    }).catch(() => undefined)
  }
}

// ------------------------------------------------------------------
// 7. Learning Engine (échecs inclus)
// ------------------------------------------------------------------

export interface LearningRunInput {
  prompt: string
  analysis: PromptAnalysis
  plan: Plan
  outcome: "SUCCESS" | "FAILURE"
  verification?: VerificationReport
  error?: string
}

export class LearningEngine extends BaseEngine<LearningRunInput, import("./types").LearningOutcome> {
  readonly name = "LEARNING" as const
  readonly description = "Extrait leçons, préférences et patrons (succès ET échecs) vers la mémoire 5 couches."
  readonly phase = "LEARNING" as const
  readonly errorCode = "LEARNING_FAILED" as const

  async execute(input: LearningRunInput, ctx: EngineContext): Promise<EngineExecution<import("./types").LearningOutcome>> {
    const { learning, tokensIn, tokensOut } = await extractLearning(ctx.userId, ctx.taskId, input)
    return {
      value: learning,
      tokensIn,
      tokensOut,
      durationMs: 0,
      attempts: 1,
      meta: { outcome: input.outcome, lessons: learning.lessons.length, patterns: learning.reusablePatterns.length },
    }
  }

  async rollback(): Promise<void> {
    // L'apprentissage ne se retire jamais (mémoire append-only).
  }
}

// ------------------------------------------------------------------
// 8. Self-Correction Engine (transversal)
// ------------------------------------------------------------------

export class SelfCorrectionEngine extends BaseEngine<{ fn: () => Promise<unknown>; phase: string; maxAttempts: number }, unknown> {
  readonly name = "SELF_CORRECTION" as const
  readonly description = "Classe, journalise et corrige les erreurs (RETRY/SWITCH/REPLAN/ABORT) avec budget global."
  readonly phase = null
  readonly errorCode = "RETRY_BUDGET_EXCEEDED" as const

  async execute(
    input: { fn: () => Promise<unknown>; phase: string; maxAttempts: number },
    ctx: EngineContext
  ): Promise<EngineExecution<unknown>> {
    const result = await runWithSelfCorrection(input.fn, {
      phase: input.phase,
      maxAttempts: input.maxAttempts,
      attempt: 0,
      retryBudget: ctx.retryBudget,
    })
    return { value: result.value, tokensIn: 0, tokensOut: 0, durationMs: 0, attempts: result.attempts }
  }
}

// ------------------------------------------------------------------
// Registre global — singleton process-unique (serverless-safe)
// ------------------------------------------------------------------

const g = globalThis as unknown as { gen3iaEngines?: Engines }

export interface Engines {
  analysis: PromptAnalysisEngine
  planner: PlannerEngine
  evaluator: EvaluatorEngine
  ethics: EthicsEngine
  executor: ExecutorEngine
  verification: VerificationEngine
  learning: LearningEngine
  selfCorrection: SelfCorrectionEngine
  swarm: SwarmEngine
  debate: DebateEngine
}

function buildEngines(): Engines {
  const instances: Engines = {
    analysis: new PromptAnalysisEngine(),
    planner: new PlannerEngine(),
    evaluator: new EvaluatorEngine(),
    ethics: new EthicsEngine(),
    executor: new ExecutorEngine(),
    verification: new VerificationEngine(),
    learning: new LearningEngine(),
    selfCorrection: new SelfCorrectionEngine(),
    swarm: new SwarmEngine(),
    debate: new DebateEngine(),
  }
  // Enregistrement au registre SDK (santé/admin).
  for (const engine of Object.values(instances)) {
    registerEngine(engine)
  }
  return instances
}

export function engines(): Engines {
  if (!g.gen3iaEngines) g.gen3iaEngines = buildEngines()
  return g.gen3iaEngines
}

/** Journalise une exécution de l'orchestrateur lui-même (télémétrie complète). */
export async function recordOrchestratorRun(params: {
  taskId: string
  userId: string
  ok: boolean
  durationMs: number
  errorCode?: string | null
  detail?: Record<string, unknown>
}): Promise<void> {
  await recordEngineRun({
    engine: "ORCHESTRATOR",
    taskId: params.taskId,
    userId: params.userId,
    ok: params.ok,
    durationMs: params.durationMs,
    errorCode: params.errorCode ?? null,
    detail: params.detail,
  })
}
