import { db } from "@/lib/db"
import { getClientIp } from "@/lib/api"

/**
 * Audit Trail — trace every sensitive action (auth, deployment,
 * payments, state changes, dangerous operations) in an append-only log.
 */

export async function audit(
  req: Request | null,
  params: {
    userId?: string | null
    action: string
    entityType?: string
    entityId?: string
    detail?: unknown
  }
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        detail: params.detail ? JSON.stringify(params.detail) : null,
        ip: req ? getClientIp(req) : null,
      },
    })
  } catch (err) {
    // The audit must never interrupt the main flow.
    console.error("[audit] échec d'enregistrement :", err)
  }
}
