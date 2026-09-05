/**
 * Action Gateway — couche unique de décision et de traçabilité des
 * actions connecteurs (ADR-0017).
 *
 *   Agent / Console / SDK
 *          │
 *   ┌──────▼───────┐
 *   │ ActionGateway │  Tool Discovery (tool-discovery.ts)
 *   └──────┬───────┘
 *          │  1. Risk Engine       (risk-engine.ts)
 *          │  2. Permission Engine (permissions.ts)
 *          │  3. Exécution         (core/toolset — local prioritaire,
 *          │                       relay Composio v4.2 inchangé)
 *          │  4. Result Verification (verification.ts — read-back)
 *          │  5. Audit             (chaîne immuable + enregistrement
 *          │                       ConnectorExecution + trace complète)
 *          ▼
 *      Résultat enrichi
 *
 * Contrats :
 *  - ne JAMAIS casser le flux appelant (l'audit et l'enregistrement
 *    échouent ouvert, l'exécution continue) ;
 *  - la demande de confirmation, elle, échoue FERMÉ (sans
 *    enregistrement, pas d'action en attente invisible) ;
 *  - la chaîne de trace requestId → taskId → planId → stepIndex →
 *    executionId est persistée sur chaque exécution.
 */

import { db } from "@/lib/db"
import type { Prisma } from "@prisma/client"
import { logger } from "@/lib/observability/logger"
import { appendAuditEntry } from "@/lib/security/audit-chain"
import { executeAction } from "../core/toolset"
import { decryptJson, encryptJson } from "../core/crypto"
import { assessConnectorRisk } from "./risk-engine"
import { checkConnectorPermission } from "./permissions"
import { verifyActionResult } from "./verification"
import { confirmationTtlMs, type ExecutionListItem, type ExecutionStatus, type GatewayResult, type PermissionCheck, type RiskAssessment, type RiskLevel, type VerificationReport } from "./types"

// ─────────────────────────────────────────────────────────────
// Requête gardée
// ─────────────────────────────────────────────────────────────

export interface GuardedRequest {
  userId: string
  appSlug: string
  actionSlug: string
  params: Record<string, unknown>
  agentId?: string | null
  taskId?: string | null
  planId?: string | null
  stepIndex?: number | null
  /** Approbation déjà donnée en amont (HITL plan, réglage utilisateur). */
  preAuthorized?: boolean
  /** Identifiant de corrélation de l'appelant (sinon généré). */
  requestId?: string | null
  /** Origine de l'appel. */
  source?: "AGENT" | "CONSOLE" | "CONFIRM" | "SDK"
  /** INTERNE (flux de confirmation) : reprend CET enregistrement au lieu
   * d'en créer un nouveau (transition CONFIRMATION_REQUIRED → RUNNING). */
  resumeExecutionId?: string
  /** INTERNE (flux de confirmation) : plafond de risque explicitement
   * couvert par l'approbation humaine de CETTE exécution. */
  authorizationFloor?: RiskLevel
}

// ─────────────────────────────────────────────────────────────
// Utilitaires (rédaction, audit, persistance)
// ─────────────────────────────────────────────────────────────

const SENSITIVE_KEY = /(token|secret|password|passwd|authorization|cookie|api[-_]?key|private|credential|session|refresh|access[-_]?key)/i

/** Rédige les paramètres : masque les valeurs sensibles, tronque. */
export function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params).slice(0, 30)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = "***"
      continue
    }
    if (typeof v === "string") out[k] = v.length > 200 ? `${v.slice(0, 200)}…` : v
    else if (v === null || v === undefined || ["number", "boolean"].includes(typeof v)) out[k] = v
    else {
      try {
        const s = JSON.stringify(v)
        out[k] = s.length > 300 ? `${s.slice(0, 300)}…` : JSON.parse(s)
      } catch {
        out[k] = String(v).slice(0, 200)
      }
    }
  }
  return out
}

function truncateJson(value: unknown, maxChars: number): string | null {
  if (value === null || value === undefined) return null
  try {
    const s = JSON.stringify(value)
    return s.length > maxChars ? `${s.slice(0, maxChars)}…` : s
  } catch {
    return null
  }
}

function newRequestId(): string {
  return `gw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/** Écrit dans la chaîne d'audit immuable — jamais bloquant. */
async function auditExecution(params: {
  userId: string
  executionId: string
  appSlug: string
  actionSlug: string
  status: ExecutionStatus
  risk: RiskLevel
  provider?: string
  taskId?: string | null
  planId?: string | null
  agentId?: string | null
}): Promise<void> {
  try {
    await appendAuditEntry({
      userId: params.userId,
      action: "CONNECTOR_EXECUTED",
      entityType: "connector_execution",
      entityId: params.executionId,
      detail: {
        app: params.appSlug,
        action: params.actionSlug,
        status: params.status,
        risk: params.risk,
        provider: params.provider ?? null,
        taskId: params.taskId ?? null,
        planId: params.planId ?? null,
        agentId: params.agentId ?? null,
      },
    })
  } catch (err) {
    logger.warn("gateway: écriture d'audit impossible (non bloquant)", {
      executionId: params.executionId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Persistance d'un enregistrement d'exécution — échec ouvert. */
async function persistRecord(data: Prisma.ConnectorExecutionUncheckedCreateInput): Promise<string | null> {
  try {
    const row = await db.connectorExecution.create({ data })
    return row.id
  } catch (err) {
    logger.error("gateway: enregistrement d'exécution impossible (non bloquant)", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

async function updateRecord(id: string, data: Record<string, unknown>): Promise<void> {
  try {
    await db.connectorExecution.update({ where: { id }, data })
  } catch (err) {
    logger.warn("gateway: mise à jour d'exécution impossible", {
      id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function providerOf(connectionId: string | null | undefined): "LOCAL" | "COMPOSIO" | "NONE" {
  if (!connectionId) return "NONE"
  return connectionId.startsWith("cpc_") ? "COMPOSIO" : "LOCAL"
}

// ─────────────────────────────────────────────────────────────
// Échecs de structure (jamais de throw vers la boucle d'agent)
// ─────────────────────────────────────────────────────────────

function structuralFailure(
  req: GuardedRequest,
  risk: RiskAssessment,
  permission: PermissionCheck,
  error: string,
  executionId: string,
  status: ExecutionStatus
): GatewayResult {
  return {
    ok: false,
    status: 0,
    statusText: "Connector Error",
    data: null,
    output: "",
    latencyMs: 0,
    error,
    connectionId: "",
    actionSlug: req.actionSlug,
    appSlug: req.appSlug,
    executionId,
    risk,
    permission,
    executionStatus: status,
  }
}

// ─────────────────────────────────────────────────────────────
// Pipeline principal
// ─────────────────────────────────────────────────────────────

/**
 * Exécute une action connecteur À TRAVERS le gateway :
 * risque → permission → exécution réelle → vérification → audit.
 * Ne lève jamais (contrat identique à runConnectorTool) : les échecs
 * structurels deviennent des GatewayResult ok:false.
 */
export async function executeGuardedAction(req: GuardedRequest): Promise<GatewayResult> {
  const requestId = req.requestId || newRequestId()

  // 1. Risk Engine — évaluation synchrone, facteurs explicites.
  const risk = assessConnectorRisk(req.appSlug, req.actionSlug, req.params)

  // 2. Permission Engine — DENY / plafond / pré-autorisation /
  //     plafond explicite d'une confirmation.
  const permission = await checkConnectorPermission(
    req.userId,
    req.appSlug,
    req.actionSlug,
    risk.level,
    req.preAuthorized ?? false,
    req.authorizationFloor
  )

  const trace = {
    userId: req.userId,
    agentId: req.agentId ?? null,
    taskId: req.taskId ?? null,
    planId: req.planId ?? null,
    stepIndex: req.stepIndex ?? null,
    requestId,
  }

  // 3a. Interdiction explicite — rejeté, auditée, jamais exécutée.
  if (permission.decision === "DENY") {
    const executionId =
      (await persistRecord({
        ...trace,
        appSlug: req.appSlug,
        actionSlug: req.actionSlug,
        provider: "NONE",
        status: "REJECTED",
        riskLevel: risk.level,
        riskScore: risk.score,
        riskReasons: truncateJson(risk.reasons, 1000),
        permission: truncateJson(permission, 1000),
        paramsRedacted: truncateJson(redactParams(req.params), 2000),
        error: permission.reason,
        completedAt: new Date(),
      })) ?? `rej_${requestId}`
    await auditExecution({ executionId, appSlug: req.appSlug, actionSlug: req.actionSlug, status: "REJECTED", risk: risk.level, ...trace })
    return structuralFailure(req, risk, permission, permission.reason, executionId, "REJECTED")
  }

  // 3b. Confirmation requise — enregistrée (échec FERMÉ), jamais exécutée.
  //     Les params réels sont chiffrés (keyring AES-256-GCM) pour permettre
  //     l'exécution après approbation, puis effacés après usage.
  if (permission.decision === "CONFIRMATION_REQUIRED") {
    let encryptedParams: string | null = null
    try {
      encryptedParams = encryptJson(req.params)
    } catch {
      encryptedParams = null
    }
    let executionId: string | null = null
    try {
      executionId = await persistRecord({
        ...trace,
        appSlug: req.appSlug,
        actionSlug: req.actionSlug,
        provider: "NONE",
        status: "CONFIRMATION_REQUIRED",
        riskLevel: risk.level,
        riskScore: risk.score,
        riskReasons: truncateJson(risk.reasons, 1000),
        permission: truncateJson(permission, 1000),
        paramsRedacted: truncateJson(redactParams(req.params), 2000),
        paramsEncrypted: encryptedParams,
      })
    } catch (err) {
      // Échec fermé : sans enregistrement, la demande serait invisible.
      return structuralFailure(
        req,
        risk,
        permission,
        "Confirmation requise mais enregistrement impossible — action non exécutée (fail-closed).",
        `err_${requestId}`,
        "FAILED"
      )
    }
    if (!executionId) {
      return structuralFailure(
        req,
        risk,
        permission,
        "Confirmation requise mais enregistrement impossible — action non exécutée (fail-closed).",
        `err_${requestId}`,
        "FAILED"
      )
    }
    const expiresAt = new Date(Date.now() + confirmationTtlMs()).toISOString()
    return {
      ok: false,
      status: 0,
      statusText: "Confirmation Required",
      data: null,
      output: "",
      latencyMs: 0,
      error: `CONFIRMATION_REQUISE : risque ${risk.level} (${risk.reasons.slice(0, 2).join(" ; ")}) — ${permission.reason}. L'utilisateur peut approuver depuis l'historique des exécutions (expire ${expiresAt}).`,
      connectionId: "",
      actionSlug: req.actionSlug,
      appSlug: req.appSlug,
      executionId,
      risk,
      permission,
      executionStatus: "CONFIRMATION_REQUIRED",
      confirmation: {
        paramsPreview: redactParams(req.params),
        expiresAt,
      },
    }
  }

  // 4. Exécution réelle (chemin local prioritaire → relay Composio v4.2).
  const started = Date.now()
  const fallbackId = `run_${requestId}`
  const executionId =
    req.resumeExecutionId ??
    ((await persistRecord({
      ...trace,
      appSlug: req.appSlug,
      actionSlug: req.actionSlug,
      provider: "NONE",
      status: "RUNNING",
      riskLevel: risk.level,
      riskScore: risk.score,
      riskReasons: truncateJson(risk.reasons, 1000),
      permission: truncateJson(permission, 1000),
      paramsRedacted: truncateJson(redactParams(req.params), 2000),
    })) ??
      fallbackId)
  const persisted = executionId !== fallbackId || !!req.resumeExecutionId

  try {
    const response = await executeAction({
      userId: req.userId,
      agentId: req.agentId ?? null,
      appSlug: req.appSlug,
      actionSlug: req.actionSlug,
      params: req.params,
    })
    const provider = providerOf(response.connectionId)

    // 5. Result Verification — forme + read-back si paire applicable.
    let verification: VerificationReport | undefined
    try {
      verification = await verifyActionResult(req.appSlug, req.actionSlug, response, req.params, {
        executeReadback: (appSlug, actionSlug, params) =>
          executeAction({ userId: req.userId, appSlug, actionSlug, params }),
      })
    } catch {
      verification = undefined // la vérification ne bloque jamais le résultat
    }

    const finalStatus: ExecutionStatus = !response.ok
      ? "FAILED"
      : verification?.verified
        ? "VERIFIED"
        : "SUCCESS"

    if (persisted) {
      await updateRecord(executionId, {
        provider,
        status: finalStatus,
        resultSummary: response.output.slice(0, 2000) || null,
        resultData: truncateJson(response.data, 2000),
        verification: truncateJson(verification ?? null, 3000),
        error: response.error ?? null,
        httpStatus: response.status,
        latencyMs: response.latencyMs || Date.now() - started,
        connectionId: response.connectionId || null,
        paramsEncrypted: null, // résolution : params chiffrés effacés
        completedAt: new Date(),
      })
    }

    await auditExecution({
      userId: req.userId,
      executionId,
      appSlug: req.appSlug,
      actionSlug: req.actionSlug,
      status: finalStatus,
      risk: risk.level,
      provider,
      taskId: trace.taskId,
      planId: trace.planId,
      agentId: trace.agentId,
    })

    return {
      ...response,
      executionId,
      risk,
      permission,
      verification,
      executionStatus: finalStatus,
    }
  } catch (err) {
    // Erreur structurelle (action inconnue, connexion absente, token
    // expiré…) — enregistrée comme FAILED, jamais de throw.
    const message = err instanceof Error ? err.message : String(err)
    await updateRecord(executionId, {
      provider: "NONE",
      status: "FAILED",
      error: message.slice(0, 500),
      latencyMs: Date.now() - started,
      completedAt: new Date(),
    }).catch(() => undefined)
    await auditExecution({
      userId: req.userId,
      executionId,
      appSlug: req.appSlug,
      actionSlug: req.actionSlug,
      status: "FAILED",
      risk: risk.level,
      provider: "NONE",
      taskId: trace.taskId,
      planId: trace.planId,
      agentId: trace.agentId,
    })
    return structuralFailure(req, risk, permission, message, executionId, "FAILED")
  }
}

// ─────────────────────────────────────────────────────────────
// Flux de confirmation (HITL au niveau ACTION)
// ─────────────────────────────────────────────────────────────

export interface ConfirmOptions {
  approved: boolean
  /** Crée une permission persistante « app.* → riskFloor » après approbation. */
  remember?: RiskLevel | null
  decidedBy?: string | null
  reason?: string | null
}

/**
 * Résout une demande de confirmation : approuve (et exécute) ou refuse.
 * Fail-closed : expiration → statut EXPIRED, aucun effet de bord.
 */
export async function resolveExecutionConfirmation(
  executionId: string,
  userId: string,
  opts: ConfirmOptions
): Promise<GatewayResult> {
  const record = await db.connectorExecution.findFirst({
    where: { id: executionId, userId },
  })
  if (!record) {
    throw new Error("Exécution introuvable.")
  }
  if (record.status !== "CONFIRMATION_REQUIRED") {
    throw new Error(`Exécution non en attente de confirmation (statut ${record.status}).`)
  }

  // Expiration fail-closed (même doctrine que HITL v3.6).
  const expiresAt = record.createdAt.getTime() + confirmationTtlMs()
  if (Date.now() > expiresAt) {
    await updateRecord(executionId, { status: "EXPIRED", completedAt: new Date() })
    throw new Error("Demande de confirmation expirée (fail-closed) — relancez l'action.")
  }

  // Refus : rejeté + traçabilité de la décision.
  if (!opts.approved) {
    await updateRecord(executionId, {
      status: "REJECTED",
      confirmedBy: opts.decidedBy ?? null,
      error: opts.reason?.slice(0, 500) ?? "Refusé par l'utilisateur.",
      completedAt: new Date(),
    })
    await auditExecution({
      userId,
      executionId,
      appSlug: record.appSlug,
      actionSlug: record.actionSlug,
      status: "REJECTED",
      risk: record.riskLevel as RiskLevel,
      taskId: record.taskId,
      planId: record.planId,
      agentId: record.agentId,
    })
    const risk = assessConnectorRisk(record.appSlug, record.actionSlug)
    return structuralFailure(
      { userId, appSlug: record.appSlug, actionSlug: record.actionSlug, params: {}, taskId: record.taskId, planId: record.planId },
      risk,
      { decision: "DENY", floor: "LOW", source: "DEFAULT_POLICY", reason: "Refusée par l'utilisateur." },
      "Action refusée par l'utilisateur.",
      executionId,
      "REJECTED"
    )
  }

  // Approbation → permission persistante optionnelle (« toujours autoriser »).
  if (opts.remember) {
    const { grantConnectorPermission } = await import("./permissions")
    await grantConnectorPermission({
      userId,
      appSlug: record.appSlug,
      actionPattern: `${record.appSlug.toLowerCase()}.*`,
      effect: "ALLOW",
      riskFloor: opts.remember,
      source: "HITL",
      createdBy: opts.decidedBy ?? null,
      note: `Accordée depuis la confirmation de l'exécution ${executionId}.`,
    }).catch(() => undefined)
  }

  await updateRecord(executionId, {
    status: "RUNNING",
    confirmedBy: opts.decidedBy ?? null,
  })

  // Exécution effective : REPREND l'enregistrement de confirmation
  // (transition CONFIRMATION_REQUIRED → RUNNING → final) avec les params
  // réels déchiffrés. Le plafond CRITICAL est explicitement couvert par
  // l'approbation humaine de CETTE exécution ; un DENY posé entre-temps
  // gagne toujours (vérifié avant l'exécution).
  const params = decryptRecordParams(record.paramsEncrypted)
  if (record.paramsEncrypted && !params) {
    await updateRecord(executionId, {
      status: "FAILED",
      error: "Paramètres chiffrés illisibles — action non exécutée (fail-closed).",
      paramsEncrypted: null,
      completedAt: new Date(),
    })
    const risk = assessConnectorRisk(record.appSlug, record.actionSlug)
    return structuralFailure(
      { userId, appSlug: record.appSlug, actionSlug: record.actionSlug, params: {}, taskId: record.taskId, planId: record.planId },
      risk,
      { decision: "DENY", floor: "LOW", source: "DEFAULT_POLICY", reason: "Paramètres de confirmation illisibles." },
      "Paramètres chiffrés illisibles — action non exécutée (fail-closed).",
      executionId,
      "FAILED"
    )
  }

  return executeGuardedAction({
    userId,
    appSlug: record.appSlug,
    actionSlug: record.actionSlug,
    params: params ?? {},
    agentId: record.agentId,
    taskId: record.taskId,
    planId: record.planId,
    stepIndex: record.stepIndex,
    preAuthorized: true,
    authorizationFloor: "CRITICAL",
    resumeExecutionId: executionId,
    source: "CONFIRM",
  })
}

/** Déchiffre les params réels d'une demande de confirmation (fail-closed). */
function decryptRecordParams(encrypted: string | null): Record<string, unknown> | null {
  if (!encrypted) return null
  try {
    const parsed = decryptJson<Record<string, unknown>>(encrypted)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Historique (API + UI)
// ─────────────────────────────────────────────────────────────

function toListItem(r: {
  id: string
  appSlug: string
  actionSlug: string
  provider: string
  status: string
  riskLevel: string
  riskScore: number | null
  agentId: string | null
  taskId: string | null
  planId: string | null
  stepIndex: number | null
  error: string | null
  httpStatus: number | null
  latencyMs: number | null
  verification: string | null
  createdAt: Date
  completedAt: Date | null
}): ExecutionListItem {
  let verified = false
  try {
    verified = !!r.verification && (JSON.parse(r.verification) as VerificationReport).verified === true
  } catch {
    verified = false
  }
  return {
    id: r.id,
    appSlug: r.appSlug,
    actionSlug: r.actionSlug,
    provider: r.provider,
    status: r.status as ExecutionStatus,
    riskLevel: r.riskLevel as RiskLevel,
    riskScore: r.riskScore,
    agentId: r.agentId,
    taskId: r.taskId,
    planId: r.planId,
    stepIndex: r.stepIndex,
    error: r.error,
    httpStatus: r.httpStatus,
    latencyMs: r.latencyMs,
    verified,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }
}

export async function listGatewayExecutions(
  userId: string,
  filters: { appSlug?: string; status?: ExecutionStatus; taskId?: string; limit?: number } = {}
): Promise<ExecutionListItem[]> {
  const limit = Math.min(100, Math.max(1, filters.limit ?? 25))
  const rows = await db.connectorExecution.findMany({
    where: {
      userId,
      ...(filters.appSlug ? { appSlug: filters.appSlug } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.taskId ? { taskId: filters.taskId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  return rows.map(toListItem)
}

export interface ExecutionDetail extends ExecutionListItem {
  riskReasons: string[]
  permission: PermissionCheck | null
  paramsRedacted: Record<string, unknown> | null
  resultSummary: string | null
  resultData: unknown
  verification: VerificationReport | null
  connectionId: string | null
  requestId: string | null
  confirmedBy: string | null
}

export async function getGatewayExecution(id: string, userId: string): Promise<ExecutionDetail | null> {
  const r = await db.connectorExecution.findFirst({ where: { id, userId } })
  if (!r) return null
  const parse = <T,>(s: string | null): T | null => {
    if (!s) return null
    try {
      return JSON.parse(s) as T
    } catch {
      return null
    }
  }
  return {
    ...toListItem(r),
    riskReasons: parse<string[]>(r.riskReasons) ?? [],
    permission: parse<PermissionCheck>(r.permission),
    paramsRedacted: parse<Record<string, unknown>>(r.paramsRedacted),
    resultSummary: r.resultSummary,
    resultData: parse<unknown>(r.resultData),
    verification: parse<VerificationReport>(r.verification),
    connectionId: r.connectionId,
    requestId: r.requestId,
    confirmedBy: r.confirmedBy,
  }
}
