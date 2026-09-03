import type { NextRequest } from "next/server"

/**
 * HITL — Human-In-The-Loop durci (v3.6).
 *
 *  1. EXPIRATION : toute demande d'approbation (outil sensible code_runner /
 *     composio_execute, plan en mode Explain) porte une date d'expiration.
 *     Passée cette échéance, l'approbation est refusée et la tâche est
 *     annulée automatiquement (fail-safe) — plus de tâche zombie en attente.
 *  2. TRAÇABILITÉ RENFORCÉE : chaque décision enregistre QUI a approuvé
 *     (identifiant + email), QUAND (horodatage), depuis OÙ (IP) et avec
 *     QUOI (user-agent) — persisté dans Task.pendingApproval ET dans
 *     l'audit trail (AuditLog).
 */

/** TTL par défaut d'une demande d'approbation : 15 minutes. */
const DEFAULT_TTL_MINUTES = 15

export function approvalTtlMs(): number {
  const raw = Number(process.env.HITL_APPROVAL_TIMEOUT_MINUTES ?? DEFAULT_TTL_MINUTES)
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MINUTES
  return Math.min(minutes, 1440) * 60_000
}

/** Charge utile d'une demande d'approbation en attente. */
export interface PendingApproval {
  reason: string
  planId?: string
  dangerousOperations?: string[]
  askedAt: string
  /** Échéance d'approbation (ISO) — au-delà, refus automatique. */
  expiresAt: string
}

/** Construit une demande d'approbation avec échéance. */
export function buildPendingApproval(params: {
  reason: string
  planId?: string
  dangerousOperations?: string[]
  askedAt?: Date
}): PendingApproval {
  const askedAt = params.askedAt ?? new Date()
  return {
    reason: params.reason,
    planId: params.planId,
    dangerousOperations: params.dangerousOperations,
    askedAt: askedAt.toISOString(),
    expiresAt: new Date(askedAt.getTime() + approvalTtlMs()).toISOString(),
  }
}

/** true si la demande a expiré (date invalide = expirée, fail-closed). */
export function isApprovalExpired(pending: PendingApproval | Record<string, unknown> | null | undefined, now: Date = new Date()): boolean {
  if (!pending) return true
  const expiresAt = typeof pending.expiresAt === "string" ? pending.expiresAt : null
  if (!expiresAt) return true
  const expiry = Date.parse(expiresAt)
  return !Number.isFinite(expiry) || expiry < now.getTime()
}

/** Secondes restantes avant expiration (0 si expirée) — pour l'UI. */
export function approvalSecondsLeft(pending: PendingApproval | Record<string, unknown> | null | undefined, now: Date = new Date()): number {
  if (!pending || typeof pending.expiresAt !== "string") return 0
  const left = Math.ceil((Date.parse(pending.expiresAt) - now.getTime()) / 1000)
  return Number.isFinite(left) && left > 0 ? left : 0
}

/** Métadonnées de décision extraites de la requête d'approbation. */
export interface ApprovalDecisionMeta {
  decidedBy: string
  decidedByEmail: string | null
  decidedAt: string
  ip: string | null
  userAgent: string | null
}

/** Extrait IP + user-agent de la requête d'approbation. */
export function requestMeta(req: NextRequest): { ip: string | null; userAgent: string | null } {
  return {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null,
    userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  }
}

/**
 * Scelle la décision dans la charge d'approbation (persistée sur la tâche) :
 * qui, quand, depuis quelle IP, avec quel agent utilisateur.
 */
export function sealDecision(
  pending: PendingApproval | Record<string, unknown> | null | undefined,
  decision: { approved: boolean; reason?: string },
  meta: ApprovalDecisionMeta
): Record<string, unknown> {
  return {
    ...(pending ?? {}),
    ...decision,
    ...meta,
  }
}
