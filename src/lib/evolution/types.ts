// ============================================================
// Gen3ia Evolution Engine — Core types
// ============================================================
// Defines every shape the engine persists, returns, or accepts.
// Imported by: orchestrator, memory, api routes, dashboard.
// ============================================================

import type { AIMessage } from '@/lib/ai-router';

// ----- Phases & states -----

export type EvolutionPhase =
  | 'observation'
  | 'analysis'
  | 'planning'
  | 'modification'
  | 'validation'
  | 'evaluation'
  | 'review'
  | 'deployment'
  | 'monitoring'
  | 'learning';

export type EvolutionStatus =
  | 'pending' // created, not started
  | 'running' // a phase is in-progress
  | 'awaiting_review' // safety gate L3 needs human approval
  | 'pr_open' // PR opened on GitHub
  | 'pr_merged' // PR merged to target
  | 'deployed' // Vercel prod deployment successful
  | 'rolled_back' // rollback executed after regression
  | 'failed' // unrecoverable error
  | 'cancelled' // user-cancelled
  | 'skipped'; // skipped due to safety gate or dedup

export type StepStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'rolled_back';

export type SafetyLevel = 1 | 2 | 3;

// ----- Files & diffs -----

export interface FileChange {
  /** Repo-relative path, e.g. `src/lib/foo.ts`. */
  path: string;
  /** `create` | `modify` | `delete` */
  action: 'create' | 'modify' | 'delete';
  /** Unified diff (git diff format) for `modify`, full content for `create`. */
  diff?: string;
  /** Full new content for `create` (mutually exclusive with diff). */
  content?: string;
  /** Reason for the change (RCA output). */
  rationale: string;
}

// ----- Plans & proposals -----

export interface ImprovementProposal {
  id: string;
  title: string;
  /** Free-text summary of the proposed change. */
  summary: string;
  /** RCA root cause id this proposal addresses. */
  addressesRootCauseId: string;
  /** Concrete file changes this proposal entails. */
  fileChanges: FileChange[];
  /** Risks identified by the planner (e.g. "touches auth path"). */
  risks: string[];
  /** Tests the planner proposes to add or update. */
  testPlan: string[];
  /** LLM confidence 0..1. */
  confidence: number;
  /** Estimated cost in USD (LLM calls + CI time). */
  estimatedCostUsd: number;
  /** Safety level required to apply. */
  requiredSafetyLevel: SafetyLevel;
}

export interface ImprovementPlan {
  id: string;
  evolutionId: string;
  /** LLM-generated natural-language summary of the plan. */
  summary: string;
  proposals: ImprovementProposal[];
  /** Risks that apply to the whole plan. */
  globalRisks: string[];
  /** Verification steps to run before merge. */
  verificationSteps: string[];
  /** Total estimated cost across all proposals. */
  estimatedTotalCostUsd: number;
  /** LLM model used to produce this plan. */
  generatedByModel: string;
  createdAt: string;
}

// ----- Root cause analysis -----

export interface RootCause {
  id: string;
  /** Short title, e.g. "Missing null check in getUserById". */
  title: string;
  /** Long-form explanation. */
  description: string;
  /** Concrete evidence (log lines, stack frames, metric deltas). */
  evidence: RootCauseEvidence[];
  /** Files / functions / lines suspected. */
  suspectedLocations: SuspectedLocation[];
  /** LLM confidence 0..1. */
  confidence: number;
  /** Estimated user-visible impact (low | medium | high | critical). */
  impact: 'low' | 'medium' | 'high' | 'critical';
  /** Suggested categories, e.g. `null-reference`, `race-condition`. */
  tags: string[];
}

export interface RootCauseEvidence {
  kind: 'log' | 'error' | 'metric' | 'test' | 'deploy';
  source: string;
  snippet: string;
  observedAt: string;
}

export interface SuspectedLocation {
  filePath: string;
  /** Optional line range `12-45`. */
  lineRange?: string;
  /** Optional symbol (function/class name). */
  symbol?: string;
  reason: string;
}

// ----- Observation -----

export interface ObservationSnapshot {
  id: string;
  evolutionId: string;
  /** ISO timestamp. */
  capturedAt: string;
  /** Recent error logs (last N entries). */
  errors: ObservationEntry[];
  /** Recent slow API routes. */
  slowRoutes: { route: string; p95Ms: number; sampleCount: number }[];
  /** Recent failed CI runs. */
  failedCIRuns: { branch: string; commitSha: string; failedAt: string; reason: string }[];
  /** Recent production incidents (Sentry / Loki). */
  incidents: { source: string; severity: string; message: string; occurredAt: string }[];
  /** Coverage delta if known. */
  coverageDelta?: { beforePct: number; afterPct: number };
  /** Aggregated LLM cost for the last 24h (USD). */
  last24hCostUsd: number;
}

export interface ObservationEntry {
  source: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ----- Validation & sandbox -----

export interface ValidationResult {
  phase: 'install' | 'typecheck' | 'lint' | 'unit' | 'integration' | 'e2e' | 'build' | 'security' | 'db';
  status: StepStatus;
  /** Duration in ms. */
  durationMs: number;
  /** Stdout/stderr tail (last 4 KiB). */
  outputTail: string;
  exitCode: number | null;
  startedAt: string;
  endedAt: string;
}

export interface SandboxResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  /** True if the sandbox killed the process due to safety violation. */
  killed: boolean;
}

// ----- Evaluation -----

export interface MetricSample {
  name: string;
  /** Numeric value, or `null` if unavailable. */
  value: number | null;
  /** Unit (`ms`, `pct`, `usd`, `count`, ...). */
  unit: string;
  /** Optional direction: higher is better (`up`) or lower is better (`down`). */
  direction: 'up' | 'down' | 'neutral';
}

export interface EvaluationResult {
  before: MetricSample[];
  after: MetricSample[];
  /** Computed deltas keyed by metric name. */
  deltas: { name: string; before: number | null; after: number | null; delta: number | null; improved: boolean }[];
  /** LLM-generated natural-language verdict. */
  verdict: string;
  /** LLM confidence 0..1. */
  confidence: number;
  /** Whether the change is considered safe to merge. */
  recommendation: 'merge' | 'hold' | 'rollback';
}

// ----- Evolution record (top-level) -----

export interface EvolutionRecord {
  id: string;
  /** Who triggered the evolution. */
  triggeredBy: string;
  /** Target branch name (e.g. `main`). */
  targetBranch: string;
  /** Source branch name (e.g. `evolution/2026-08-18-fix-null-check`). */
  sourceBranch: string;
  /** Scope: which subsystem this evolution targets. */
  scope: string;
  /** Initial motivation (free text). */
  motivation: string;
  status: EvolutionStatus;
  phase: EvolutionPhase;
  /** Safety level applied. */
  safetyLevel?: SafetyLevel;
  /** Plan id once planning is done. */
  planId?: string;
  /** Snapshot id once observation is done. */
  snapshotId?: string;
  /** RCA root causes discovered. */
  rootCauseIds: string[];
  /** PR url once opened. */
  prUrl?: string;
  /** PR number once opened. */
  prNumber?: number;
  /** Commit SHA on source branch. */
  headSha?: string;
  /** Vercel deployment URL. */
  previewUrl?: string;
  /** Evaluation id once evaluation is done. */
  evaluationId?: string;
  /** Rollback id if rolled back. */
  rollbackId?: string;
  /** Aggregate cost (USD) — sum of LLM + CI time. */
  costUsd: number;
  /** Aggregate token usage. */
  totalTokens: number;
  /** Total runtime (ms). */
  totalDurationMs: number;
  startedAt: string;
  endedAt?: string;
  /** Last error message, for `failed` status. */
  lastError?: string;
  /** Retry count (orchestrator retries transient failures). */
  retryCount: number;
  /** Crash-recovery lock token (see concurrency.ts). */
  lockToken?: string;
}

// ----- Rollback -----

export interface RollbackRecord {
  id: string;
  evolutionId: string;
  /** Reason for the rollback. */
  reason: string;
  /** Original merge commit SHA. */
  mergedSha?: string;
  /** Revert commit SHA. */
  revertSha?: string;
  status: 'pending' | 'reverting' | 'succeeded' | 'failed';
  startedAt: string;
  endedAt?: string;
  /** Stdout/stderr tail of the revert operation. */
  outputTail?: string;
}

// ----- Self-improvement & meta-evaluation -----

export interface SelfImprovementRecord {
  id: string;
  evolutionId: string;
  /** Which component of the engine was improved. */
  component: 'planner' | 'modifier' | 'validator' | 'orchestrator' | 'prompt' | 'template' | 'evaluator' | 'agent_architecture';
  /** What was the recurring failure pattern. */
  failurePattern: string;
  /** What change was applied to the engine itself. */
  changeApplied: string;
  /** Result metric (before → after). */
  metric: string;
  beforeValue: number;
  afterValue: number;
  appliedAt: string;
}

export interface MetaEvaluation {
  id: string;
  evolutionId: string;
  /** Decision the engine made (e.g. "applied proposal #2"). */
  decision: string;
  /** Outcome (`good` | `neutral` | `bad`). */
  outcome: 'good' | 'neutral' | 'bad';
  /** What rule, if any, was adjusted. */
  ruleAdjusted?: string;
  /** Adjustment description. */
  adjustment?: string;
  evaluatedAt: string;
}

// ----- LLM input shapes -----

export interface LLMInvocation {
  messages: AIMessage[];
  mode: 'default' | 'fast' | 'powerful' | 'analysis' | 'reasoning' | 'orchestration';
  /** Caller name (for cost attribution). */
  caller: string;
  /** Evolution id (for cost attribution). */
  evolutionId: string;
}

export interface LLMInvocationResult {
  content: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
}
