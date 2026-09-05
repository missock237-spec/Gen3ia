/**
 * Permission Engine — autorisations par utilisateur × app × action
 * (ADR-0017).
 *
 * Modèle : chaque ligne ConnectorPermission est un motif à 2 segments
 * (« app.action », « app.* », « *.action », «*.*») avec :
 *   - effect ALLOW (plafond riskFloor) ou DENY (interdiction nette) ;
 *   - une expiration optionnelle ;
 *   - une provenance (USER, ADMIN, HITL, POLICY).
 *
 * Politique par défaut (aucune permission) : plafond MEDIUM — les
 * lectures et écritures standards passent, HIGH (envoi, publication,
 * fusion) et CRITICAL (suppression, argent) exigent confirmation.
 *
 * DENY prioritaire sur ALLOW ; échec de lecture de la table =
 * dégradation vers la politique par défaut (jamais de crash).
 */

import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import type {
  PermissionCheck,
  PermissionEffect,
  PermissionListItem,
  RiskLevel,
} from "./types"
import { RISK_LEVELS, riskFloorCovers } from "./types"

/** Plafond par défaut quand aucune permission ne s'applique. */
export const DEFAULT_RISK_FLOOR: RiskLevel = "MEDIUM"

/** Plafond couvert par une pré-autorisation (HITL de plan, réglage). */
export const PRE_AUTHORIZED_FLOOR: RiskLevel = "HIGH"

const CACHE_TTL_MS = 30_000
const permissionCache = new Map<string, { at: number; rows: PermissionRow[] }>()

interface PermissionRow {
  id: string
  appSlug: string
  actionPattern: string
  effect: string
  riskFloor: string
  source: string
  note: string | null
  expiresAt: Date | null
  createdAt: Date
}

/** Invalide le cache des permissions d'un utilisateur (après écriture). */
export function invalidatePermissionCache(userId?: string): void {
  if (userId) permissionCache.delete(userId)
  else permissionCache.clear()
}

async function loadPermissions(userId: string): Promise<PermissionRow[]> {
  const cached = permissionCache.get(userId)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rows
  try {
    const rows = await db.connectorPermission.findMany({ where: { userId } })
    const mapped: PermissionRow[] = rows.map((r) => ({
      id: r.id,
      appSlug: r.appSlug,
      actionPattern: r.actionPattern,
      effect: r.effect,
      riskFloor: r.riskFloor,
      source: r.source,
      note: r.note,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }))
    permissionCache.set(userId, { at: Date.now(), rows: mapped })
    return mapped
  } catch (err) {
    // Dégradation : aucune permission lue → politique par défaut.
    logger.warn("gateway: lecture des permissions impossible", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/** Normalise un motif : «*» → «*.*» ; tout en minuscules. */
function normalizePattern(pattern: string): { appPattern: string; actionPattern: string } | null {
  const p = pattern.trim().toLowerCase()
  if (!p) return null
  const full = p === "*" ? "*.*" : p
  const parts = full.split(".")
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { appPattern: parts[0], actionPattern: parts[1] }
}

/** Le motif couvre-t-il ce couple app/action ? */
export function patternMatches(pattern: string, appSlug: string, actionSlug: string): boolean {
  const normalized = normalizePattern(pattern)
  if (!normalized) return false
  const app = appSlug.toLowerCase()
  const action = actionSlug.toLowerCase()
  const appOk = normalized.appPattern === "*" || normalized.appPattern === app
  const actionOk = normalized.actionPattern === "*" || normalized.actionPattern === action
  return appOk && actionOk
}

/** Valide et normalise un niveau de risque. */
export function parseRiskLevel(value: string): RiskLevel | null {
  const v = value.trim().toUpperCase() as RiskLevel
  return RISK_LEVELS.includes(v) ? v : null
}

// ─────────────────────────────────────────────────────────────
// Vérification runtime
// ─────────────────────────────────────────────────────────────

/**
 * Décide si l'appel (appSlug, actionSlug) de risque `risk` est autorisé.
 * Ordre : DENY explicite > plafond le plus élevé des ALLOW applicables
 * (relevé à HIGH par une pré-autorisation) > politique par défaut.
 * `floorOverride` (flux de confirmation : l'utilisateur a approuvé CETTE
 * exécution précise) relève le plafond sans jamais court-circuiter un DENY.
 */
export async function checkConnectorPermission(
  userId: string,
  appSlug: string,
  actionSlug: string,
  risk: RiskLevel,
  preAuthorized = false,
  floorOverride?: RiskLevel
): Promise<PermissionCheck> {
  const rows = await loadPermissions(userId)
  const now = Date.now()
  const applicable = rows.filter(
    (r) =>
      patternMatches(r.actionPattern, appSlug, actionSlug) &&
      (!r.expiresAt || r.expiresAt.getTime() > now)
  )

  // 1. DENY explicite — prioritaire, sans exception.
  const deny = applicable.find((r) => r.effect === "DENY")
  if (deny) {
    return {
      decision: "DENY",
      floor: "LOW",
      source: "GRANT",
      grantId: deny.id,
      reason: `Action interdite par une permission DENY (motif « ${deny.actionPattern} »${deny.note ? ` — ${deny.note}` : ""}).`,
    }
  }

  // 2. Plafond le plus élevé parmi les ALLOW applicables.
  let floor = DEFAULT_RISK_FLOOR
  let grantId: string | undefined
  for (const r of applicable) {
    if (r.effect !== "ALLOW") continue
    const level = parseRiskLevel(r.riskFloor)
    if (!level) continue
    if (RISK_LEVELS.indexOf(level) > RISK_LEVELS.indexOf(floor)) {
      floor = level
      grantId = r.id
    }
  }

  // 3. Pré-autorisation (HITL du plan déjà validé / confirmations off) :
  //    relève le plafond à HIGH — CRITICAL exige toujours un opt-in explicite.
  // 4. floorOverride (confirmation d'UNE exécution précise) : plafond
  //    explicite, sans jamais court-circuiter un DENY (testé avant).
  const effectiveSource: PermissionCheck["source"] = floorOverride || preAuthorized ? "PRE_AUTHORIZED" : grantId ? "GRANT" : "DEFAULT_POLICY"
  if (preAuthorized && RISK_LEVELS.indexOf(PRE_AUTHORIZED_FLOOR) > RISK_LEVELS.indexOf(floor)) {
    floor = PRE_AUTHORIZED_FLOOR
  }
  if (floorOverride && RISK_LEVELS.indexOf(floorOverride) > RISK_LEVELS.indexOf(floor)) {
    floor = floorOverride
  }

  if (riskFloorCovers(floor, risk)) {
    return {
      decision: "ALLOW",
      floor,
      source: effectiveSource,
      grantId,
      reason:
        grantId || preAuthorized
          ? `Autorisé : plafond ${floor}${preAuthorized ? " (pré-autorisé)" : ""}.`
          : `Autorisé par la politique par défaut (plafond ${floor}).`,
    }
  }

  return {
    decision: "CONFIRMATION_REQUIRED",
    floor,
    source: effectiveSource,
    grantId,
    reason: `Risque ${risk} au-dessus du plafond couvert (${floor}) : confirmation humaine requise.`,
  }
}

// ─────────────────────────────────────────────────────────────
// Gestion des permissions (API)
// ─────────────────────────────────────────────────────────────

function toListItem(r: PermissionRow & { createdAt: Date }): PermissionListItem {
  return {
    id: r.id,
    appSlug: r.appSlug,
    actionPattern: r.actionPattern,
    effect: (r.effect === "DENY" ? "DENY" : "ALLOW") as PermissionEffect,
    riskFloor: (parseRiskLevel(r.riskFloor) ?? "LOW") as RiskLevel,
    source: r.source,
    note: r.note,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }
}

export async function listConnectorPermissions(userId: string): Promise<PermissionListItem[]> {
  const rows = await loadPermissions(userId)
  const now = Date.now()
  return rows
    .filter((r) => !r.expiresAt || r.expiresAt.getTime() > now)
    .map((r) => toListItem(r as PermissionRow & { createdAt: Date }))
}

export interface GrantInput {
  userId: string
  appSlug: string
  actionPattern: string
  effect: PermissionEffect
  riskFloor: RiskLevel
  source?: string
  createdBy?: string | null
  note?: string | null
  expiresAt?: Date | null
}

/** Crée/met à jour une permission (upsert sur le triplet unique). */
export async function grantConnectorPermission(input: GrantInput): Promise<PermissionListItem> {
  const normalized = normalizePattern(input.actionPattern)
  if (!normalized) {
    throw new Error("Motif invalide : attend « app.action », « app.* », « *.action » ou «*».")
  }
  const appSlug = input.appSlug.trim().toLowerCase() || "*"
  const pattern = `${normalized.appPattern}.${normalized.actionPattern}`
  const row = await db.connectorPermission.upsert({
    where: {
      userId_appSlug_actionPattern: {
        userId: input.userId,
        appSlug,
        actionPattern: pattern,
      },
    },
    create: {
      userId: input.userId,
      appSlug,
      actionPattern: pattern,
      effect: input.effect,
      riskFloor: input.riskFloor,
      source: input.source ?? "USER",
      createdBy: input.createdBy ?? null,
      note: input.note ?? null,
      expiresAt: input.expiresAt ?? null,
    },
    update: {
      effect: input.effect,
      riskFloor: input.riskFloor,
      note: input.note ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  })
  invalidatePermissionCache(input.userId)
  return toListItem(row)
}

/** Supprime une permission (vérification d'appartenance). */
export async function revokeConnectorPermission(id: string, userId: string): Promise<boolean> {
  const existing = await db.connectorPermission.findFirst({ where: { id, userId } })
  if (!existing) return false
  await db.connectorPermission.delete({ where: { id } })
  invalidatePermissionCache(userId)
  return true
}
