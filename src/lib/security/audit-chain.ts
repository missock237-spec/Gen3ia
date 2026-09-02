import { db } from "@/lib/db"
import { createHmac } from "crypto"
import { logger } from "@/lib/observability/logger"

/**
 * AuditChain — Journal d'audit immuable avec chaîne hash.
 * Chaque entrée contient prevHash (hash de l'entrée précédente) et entryHash
 * (HMAC-SHA256 du contenu + prevHash). La chaîne est vérifiable cryptographiquement.
 */

const AUDIT_SECRET = process.env.AUDIT_SECRET ?? "gen3ia-audit-secret-key-change-in-production"

/**
 * Calcule le HMAC-SHA256 d'un contenu avec la clé de service.
 */
function computeHash(content: string, prevHash: string | null): string {
  const data = `${prevHash ?? ""}:${content}`
  return createHmac("sha256", AUDIT_SECRET).update(data).digest("hex")
}

/**
 * Ajoute une entrée au journal d'audit immuable.
 */
export async function appendAuditEntry(params: {
  userId?: string
  action: string
  entityType?: string
  entityId?: string
  detail?: Record<string, unknown>
  ip?: string
}): Promise<string> {
  // Récupérer le dernier hash
  const lastEntry = await db.immutableAuditLog.findFirst({
    orderBy: { createdAt: "desc" },
    select: { entryHash: true },
  })

  const prevHash = lastEntry?.entryHash ?? null
  const content = JSON.stringify({
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    detail: params.detail,
    userId: params.userId,
    ip: params.ip,
    timestamp: new Date().toISOString(),
  })

  const entryHash = computeHash(content, prevHash)

  const entry = await db.immutableAuditLog.create({
    data: {
      userId: params.userId,
      prevHash,
      entryHash,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      detail: params.detail ? JSON.stringify(params.detail) : null,
      ip: params.ip,
    },
  })

  return entry.id
}

/**
 * Vérifie l'intégrité de la chaîne d'audit.
 * Retourne true si la chaîne est intacte, false si une entrée a été modifiée.
 */
export async function verifyChain(limit?: number): Promise<{ valid: boolean; brokenAt?: string; totalEntries: number }> {
  const entries = await db.immutableAuditLog.findMany({
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, entryHash: true, prevHash: true, action: true, detail: true, userId: true, ip: true, createdAt: true },
  })

  let prevHash: string | null = null
  let expectedHash: string | null = null

  for (const entry of entries) {
    if (entry.prevHash !== prevHash) {
      return { valid: false, brokenAt: entry.id, totalEntries: entries.length }
    }

    const content = JSON.stringify({
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      detail: entry.detail,
      userId: entry.userId,
      ip: entry.ip,
      timestamp: entry.createdAt.toISOString(),
    })
    expectedHash = computeHash(content, prevHash)

    if (entry.entryHash !== expectedHash) {
      logger.error("Chaîne d'audit compromise", { entryId: entry.id })
      return { valid: false, brokenAt: entry.id, totalEntries: entries.length }
    }

    prevHash = entry.entryHash
  }

  return { valid: true, totalEntries: entries.length }
}

/**
 * Récupère le trail d'audit pour une entité.
 */
export async function getAuditTrail(entityType?: string, entityId?: string, limit = 100) {
  return db.immutableAuditLog.findMany({
    where: { ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}
