/**
 * Action Gateway — types partagés (ADR-0017).
 *
 * Pipeline d'exécution d'une action connecteur :
 *   Tool Discovery → Permission → Risk Engine → Exécution (local/Composio)
 *   → Result Verification → Audit → Resultat.
 *
 * Le gateway est la couche unique de décision : les agents (runTool) comme
 * la console manuelle (/api/connectors/execute) passent par lui.
 */

import type { ActionExecutionResponse } from "../core/types"

// ─────────────────────────────────────────────────────────────
// Niveaux de risque (Risk Engine)
// ─────────────────────────────────────────────────────────────

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"

/** Ordre croissant de gravité — LOW < MEDIUM < HIGH < CRITICAL. */
export const RISK_LEVELS: readonly RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const

/** Bornes de score : LOW 0-29, MEDIUM 30-59, HIGH 60-79, CRITICAL 80-100. */
export const RISK_SCORE_BOUNDS = { LOW: 29, MEDIUM: 59, HIGH: 79, CRITICAL: 100 } as const

/** Un plafond de risque couvre-t-il le niveau évalué ? */
export function riskFloorCovers(floor: RiskLevel, level: RiskLevel): boolean {
  return RISK_LEVELS.indexOf(floor) >= RISK_LEVELS.indexOf(level)
}

/** Niveau correspondant à un score 0-100. */
export function riskLevelFromScore(score: number): RiskLevel {
  const s = Math.max(0, Math.min(100, Math.round(score)))
  if (s <= RISK_SCORE_BOUNDS.LOW) return "LOW"
  if (s <= RISK_SCORE_BOUNDS.MEDIUM) return "MEDIUM"
  if (s <= RISK_SCORE_BOUNDS.HIGH) return "HIGH"
  return "CRITICAL"
}

/** Évaluation de risque d'une action (facteurs explicites, auditables). */
export interface RiskAssessment {
  level: RiskLevel
  score: number
  reasons: string[]
  /** Comment la méthode de l'action a été résolue. */
  source: "LOCAL_ACTION" | "CATALOG_TOOL" | "SLUG_HEURISTIC"
}

// ─────────────────────────────────────────────────────────────
// Permissions (moteur d'autorisation par app/action)
// ─────────────────────────────────────────────────────────────

export type PermissionEffect = "ALLOW" | "DENY"

export type PermissionDecision =
  | "ALLOW" // exécution autorisée
  | "DENY" // interdit explicitement (permission DENY)
  | "CONFIRMATION_REQUIRED" // niveau de risque au-dessus du plafond couvert

export interface PermissionCheck {
  decision: PermissionDecision
  /** Plafond de risque effectif pour cet appel. */
  floor: RiskLevel
  /** D'où vient la décision : permission explicite ou politique par défaut. */
  source: "GRANT" | "DEFAULT_POLICY" | "PRE_AUTHORIZED"
  /** Permission qui a tranché (si source = GRANT). */
  grantId?: string
  reason: string
}

// ─────────────────────────────────────────────────────────────
// Vérification de résultat (Result Verification)
// ─────────────────────────────────────────────────────────────

export interface VerificationCheck {
  name: string
  pass: boolean
  detail: string
}

export interface VerificationReport {
  /** true ssi tous les contrôles applicables passent. */
  verified: boolean
  strategy: "shape" | "readback" | "skipped"
  /** Confiance 0-1 (contrôles passés / contrôles applicables). */
  confidence: number
  checks: VerificationCheck[]
  /** Identifiants de preuve extraits de la réponse (id, number, url…). */
  evidence: string[]
}

// ─────────────────────────────────────────────────────────────
// Contexte et résultat du gateway
// ─────────────────────────────────────────────────────────────

/** Contexte d'appel — porte la chaîne de trace complète. */
export interface GatewayContext {
  userId: string
  agentId?: string | null
  taskId?: string | null
  planId?: string | null
  stepIndex?: number | null
  /** Approbation déjà donnée en amont (HITL du plan validé, réglage utilisateur). */
  preAuthorized?: boolean
  /** Identifiant de corrélation fourni par l'appelant (ex: requestId HTTP). */
  requestId?: string | null
  /** Origine de l'appel : agent autonome, console manuelle, confirmation. */
  source?: "AGENT" | "CONSOLE" | "CONFIRM" | "SDK"
}

/** Statut persisté d'une exécution (model ConnectorExecution.status). */
export type ExecutionStatus =
  | "PENDING"
  | "CONFIRMATION_REQUIRED"
  | "RUNNING"
  | "SUCCESS"
  | "VERIFIED"
  | "FAILED"
  | "REJECTED"
  | "EXPIRED"

/** Résultat enrichi renvoyé par le gateway. */
export interface GatewayResult extends ActionExecutionResponse {
  executionId: string
  risk: RiskAssessment
  permission: PermissionCheck
  verification?: VerificationReport
  /** Statut final de l'exécution persistée. */
  executionStatus: ExecutionStatus
  /** Flux de confirmation : la demande (params, risque) est visible ici. */
  confirmation?: {
    paramsPreview: Record<string, unknown>
    expiresAt: string
  }
}

/** Vue liste d'une exécution (API historique). */
export interface ExecutionListItem {
  id: string
  appSlug: string
  actionSlug: string
  provider: string
  status: ExecutionStatus
  riskLevel: RiskLevel
  riskScore: number | null
  agentId: string | null
  taskId: string | null
  planId: string | null
  stepIndex: number | null
  error: string | null
  httpStatus: number | null
  latencyMs: number | null
  verified: boolean
  createdAt: string
  completedAt: string | null
}

/** Vue liste d'une permission (API gestion). */
export interface PermissionListItem {
  id: string
  appSlug: string
  actionPattern: string
  effect: PermissionEffect
  riskFloor: RiskLevel
  source: string
  note: string | null
  expiresAt: string | null
  createdAt: string
}

/** TTL par défaut d'une demande de confirmation d'action (fail-closed). */
export const DEFAULT_CONFIRMATION_TTL_MINUTES = 15

export function confirmationTtlMs(): number {
  const raw = Number(process.env.CONNECTOR_CONFIRMATION_TIMEOUT_MINUTES ?? DEFAULT_CONFIRMATION_TTL_MINUTES)
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CONFIRMATION_TTL_MINUTES
  return Math.min(minutes, 1440) * 60_000
}
