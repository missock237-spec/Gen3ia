/** Types partagés des moteurs d'orchestration GEN3IA. */

// ---------- Analyse de prompt ----------

export interface PromptAnalysis {
  intent: string
  goals: string[]
  constraints: string[]
  requiredCapabilities: string[]
  risks: string[]
  successCriteria: string[]
  failureCriteria: string[]
  estimatedComplexity: "LOW" | "MEDIUM" | "HIGH"
  estimatedSteps: number
  language: string
  clarificationNeeded: boolean
}

// ---------- Système des 5 plans ----------

export interface PlanStep {
  title: string
  detail: string
  tool?: string
  model?: string
}

export type PlanId = "A" | "B" | "C" | "D" | "E"

export interface Plan {
  id: PlanId
  name: string
  strategy: string
  steps: PlanStep[]
  requiredTools: string[]
  risks: string[]
  estimatedCostCredits: number
  successProbability: number // 0-1
  rationale: string
  requiresHumanConfirmation: boolean
}

// ---------- Évaluation des plans ----------

export interface ScoreBreakdownEntry {
  criterion: string
  value: number // 0-1
  weight: number
  contribution: number
}

export interface PlanScore {
  planId: PlanId
  weighted: number // 0-1
  breakdown: ScoreBreakdownEntry[]
}

export interface EvaluationWeights {
  successRate: number
  accuracy: number
  cost: number
  latency: number
  risk: number
  completeness: number
}

export const DEFAULT_WEIGHTS: EvaluationWeights = {
  successRate: 0.3,
  accuracy: 0.2,
  cost: 0.15,
  latency: 0.1,
  risk: 0.1,
  completeness: 0.15,
}

// ---------- Exécution ----------

export type EvidenceType =
  | "TOOL_OUTPUT"
  | "LLM_OUTPUT"
  | "VERIFICATION"
  | "ANALYSIS"

export interface EvidenceItem {
  type: EvidenceType
  description: string
  content: string
}

export interface ExecutionLogEntry {
  stepIndex: number
  title: string
  status: "DONE" | "FAILED" | "SKIPPED"
  tool?: string
  output: string
  reasoning: string
  tokensIn: number
  tokensOut: number
  latencyMs: number
  evidence: EvidenceItem[]
  attempt: number
}

// ---------- Vérification ----------

export interface VerificationCriterion {
  criterion: string
  met: boolean
  evidence: string
}

export interface VerificationReport {
  verified: boolean
  confidence: number // 0-1
  criteria: VerificationCriterion[]
  gaps: string[]
  verdict: string
}

// ---------- Auto-correction ----------

export type ErrorClass =
  | "TRANSIENT"
  | "LOGIC"
  | "TOOL"
  | "MODEL"
  | "CONTEXT"
  | "OUTPUT_FORMAT"

export type CorrectionStrategy =
  | "RETRY"
  | "SWITCH_MODEL"
  | "SWITCH_TOOL"
  | "REPLAN"
  | "ABORT"

export interface CorrectionLogEntry {
  attempt: number
  phase: string
  error: string
  classification: ErrorClass
  attribution: string
  strategy: CorrectionStrategy
  action: string
  outcome: "RECOVERED" | "ESCALATED" | "ABORTED"
}

// ---------- Apprentissage ----------

export interface LearningOutcome {
  lessons: string[]
  userPreferences: string[]
  reusablePatterns: string[]
}

// ---------- Approbation humaine ----------

export interface PendingApproval {
  reason: string
  planId: string
  dangerousOperations: string[]
  askedAt: string
}

// ---------- Résultat final ----------

export interface TaskResult {
  answer: string
  summary: string
  evidence: EvidenceItem[]
  metrics: {
    tokensIn: number
    tokensOut: number
    credits: number
    latencyMs: number
    attempts: number
  }
}
