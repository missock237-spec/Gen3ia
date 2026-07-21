// ============================================================
// AUDIT TRAIL — Journalisation securisee des actions
// ============================================================
// Enregistre chaque action sensible avec qui, quoi, quand.
// Utilise le modele AuditLog de Prisma.
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";

export type AuditAction =
  | "user.login" | "user.logout" | "user.register"
  | "agent.create" | "agent.update" | "agent.delete" | "agent.execute"
  | "workflow.create" | "workflow.execute"
  | "payment.subscribe" | "payment.webhook"
  | "admin.access" | "admin.action"
  | "api_key.create" | "api_key.revoke"
  | "settings.update" | "security.alert";

export type AuditSeverity = "info" | "warning" | "critical";

class AuditTrail {
  async log(params: {
    userId: string;
    action: AuditAction;
    resource?: string;
    resourceId?: string;
    details?: Record<string, unknown>;
    severity?: AuditSeverity;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          userId: params.userId,
          action: params.action,
          resource: params.resource ?? "",
          resourceId: params.resourceId ?? "",
          details: JSON.stringify(params.details ?? {}),
          severity: params.severity ?? "info",
          ipAddress: params.ipAddress,
          userAgent: params.userAgent?.slice(0, 200),
        },
      });

      if (params.severity === "critical") {
        logger.warn("audit_critical_action", {
          action: params.action,
          userId: params.userId.slice(0, 8),
          details: params.details,
        });
      }
    } catch (error) {
      logger.error("audit_log_failed", { error: String(error) });
    }
  }

  async getHistory(params: {
    userId?: string;
    action?: AuditAction;
    severity?: AuditSeverity;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.severity) where.severity = params.severity;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: where as any,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where: where as any }),
    ]);

    return { logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}

export const auditTrail = new AuditTrail();