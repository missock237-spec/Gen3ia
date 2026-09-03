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

// ---------- Multi-Agents & Swarm ----------

export type SubAgentRole =
  | "SUPERVISOR"
  | "RESEARCHER"
  | "DATA_ANALYZER"
  | "WRITER"
  | "REFEREE"
  | "CUSTOM"

export interface SubAgent {
  id: string
  name: string
  role: SubAgentRole
  systemPrompt: string
  capabilities: string[]
  model?: string
}

export interface SubTaskSpec {
  id: string
  title: string
  description: string
  assignedAgentRole: SubAgentRole
  dependencies: string[]
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED"
  input?: Record<string, unknown>
  result?: string
  error?: string
}

export interface SwarmTask {
  id: string
  sessionId: string
  prompt: string
  strategy: "HIERARCHICAL" | "DEBATE"
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"
  subTasks: SubTaskSpec[]
  subAgents: SubAgent[]
  finalResult?: string
  createdAt: string
  updatedAt: string
}

export interface DebateProposal {
  agentId: string
  agentName: string
  role: string
  proposal: string
  arguments: string[]
  confidence: number
}

/** v3.6 — contre-arguments croisés entre participants. */
export interface DebateRebuttal {
  agentId: string
  agentName: string
  /** Proposition visée par la critique. */
  targetAgentId: string
  counterArguments: string[]
}

/** v3.6 — vote pondéré (chaque participant note les autres, sans se noter). */
export interface DebateVote {
  voterAgentId: string
  targetAgentId: string
  score: number // 0-10
  /** Poids du vote = confiance du votant. */
  weight: number
}

export interface DebateResult {
  topic: string
  proposals: DebateProposal[]
  rebuttals: DebateRebuttal[]
  votes: DebateVote[]
  /** Somme pondérée des votes par proposition (clé = agentId). */
  voteTally: Record<string, number>
  refereeVerdict: string
  synthesis: string
  winningProposalAgentId?: string
  consensusScore: number
}

export interface SharedMemoryEntry {
  id: string
  sessionId?: string
  key: string
  value: unknown
  author: string
  namespace: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface SwarmMessagePayload {
  id: string
  sessionId: string
  channel: string
  senderId: string
  content: string
  payload?: Record<string, unknown>
  createdAt: string
}

// ---------- Exécution autonome avancée ----------

export type PriorityDimension = "COST" | "SPEED" | "ACCURACY"

export interface PriorityProfile {
  cost: number      // 0-1, pondération coût
  speed: number    // 0-1, pondération rapidité
  accuracy: number // 0-1, pondération précision
}

export interface DeviationReport {
  stepIndex: number
  expectedOutcome: string
  actualOutcome: string
  deviationScore: number // 0-1
  shouldReplan: boolean
  reason: string
}

export interface ExplorationResult {
  variants: Array<{
    planId: PlanId
    result: string
    score: number
    cost: number
    latencyMs: number
  }>
  winnerPlanId: PlanId
  winnerResult: string
}

// ---------- Observabilité & tracing ----------

export interface TraceSpan {
  spanId: string
  parentSpanId?: string
  traceId: string
  name: string
  startTime: number
  endTime?: number
  durationMs?: number
  attributes: Record<string, unknown>
  status: "OK" | "ERROR" | "UNSET"
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>
}

// ---------- Batch ----------

export interface BatchTaskItem {
  taskId: string
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED"
  result?: string
  error?: string
}

export interface BatchResult {
  batchId: string
  status: "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL"
  total: number
  completed: number
  failed: number
  items: BatchTaskItem[]
}

// ---------- Sécurité RBAC ----------

export type Role = "ADMIN" | "AGENT_MANAGER" | "USER"

export type Permission =
  | "task.execute"
  | "task.view"
  | "task.view_logs"
  | "agent.manage"
  | "agent.deploy"
  | "agent.view"
  | "knowledge.manage"
  | "billing.access"
  | "admin.access"
  | "system.config"
  | "webhook.manage"

// ---------- Écosystème ----------

export interface AgentExport {
  version: string
  agent: {
    name: string
    description: string | null
    systemPrompt: string | null
    provider: string
    model: string
    temperature: number
    maxTokens: number
    config: string | null
  }
  skills: Array<{ key: string; name: string; definition: string | null }>
  tools: string[]
  exportedAt: string
}

export interface WebhookConfig {
  id: string
  url: string
  events: string[]
  secret: string
  agentId?: string
  taskId?: string
  active: boolean
}
