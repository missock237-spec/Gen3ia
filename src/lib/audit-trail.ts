// ============================================================
// AUDIT TRAIL — Journalisation securisee des actions
// ============================================================
// Enregistre chaque action sensible avec qui, quoi, quand.
// Utilise le modele AuditLog de Prisma.
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";

export type AuditAction =
  // Authentication
  | "user.login" | "user.logout" | "user.register" | "user.passwordChange"
  | "user.2faEnable" | "user.2faDisable" | "user.oauthConnect" | "user.oauthDisconnect"
  // Agent Management
  | "agent.create" | "agent.update" | "agent.delete" | "agent.execute"
  | "agent.publish" | "agent.unpublish"
  // Workflow
  | "workflow.create" | "workflow.update" | "workflow.delete" | "workflow.execute"
  // Credits & Billing
  | "credits.purchase" | "credits.refund" | "credits.transfer"
  | "payment.subscribe" | "payment.unsubscribe" | "payment.webhook"
  | "payment.webhookProcessed" | "payment.webhookFailed"
  // API Keys
  | "apiKey.create" | "apiKey.revoke" | "apiKey.rotate"
  // Admin Actions
  | "admin.access" | "admin.action" | "admin.settingsChange"
  | "admin.userSuspend" | "admin.userUnsuspend"
  // Security
  | "security.alert" | "security.blocklistAdd" | "security.blocklistRemove"
  | "security.ipBlocked" | "security.rateLimitTriggered";

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
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 100); // Max 100 per page
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    
    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.severity) where.severity = params.severity;
    
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) (where.createdAt as any).gte = params.startDate;
      if (params.endDate) (where.createdAt as any).lte = params.endDate;
    }

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

  /**
   * Get recent critical events for security monitoring
   */
  async getCriticalEvents(hours: number = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return prisma.auditLog.findMany({
      where: {
        severity: "critical",
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  /**
   * Get events for a specific user (privacy/GDPR)
   */
  async getUserDataExport(userId: string) {
    const logs = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    return {
      userId,
      exportedAt: new Date().toISOString(),
      eventCount: logs.length,
      events: logs,
    };
  }

  /**
   * Detect suspicious activity patterns
   */
  async detectSuspiciousActivity(userId: string, windowMinutes: number = 60): Promise<{
    suspicious: boolean;
    failedLoginAttempts: number;
    rateLimitTriggered: boolean;
    multipleFailures: boolean;
  }> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    
    const events = await prisma.auditLog.findMany({
      where: {
        userId,
        createdAt: { gte: since },
      },
    });

    const failedLogins = events.filter(e => e.action === "user.login" && e.severity === "warning").length;
    const rateLimited = events.some(e => e.action === "security.rateLimitTriggered");
    const multipleSuspicious = failedLogins >= 3 || (failedLogins >= 2 && rateLimited);

    return {
      suspicious: multipleSuspicious,
      failedLoginAttempts: failedLogins,
      rateLimitTriggered: rateLimited,
      multipleFailures: failedLogins >= 3,
    };
  }

  /**
   * Compliance report (for SOC 2, GDPR audits)
   */
  async getComplianceReport(startDate: Date, endDate: Date) {
    const logs = await prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const stats = {
      totalEvents: logs.length,
      criticalEvents: logs.filter(l => l.severity === "critical").length,
      warningEvents: logs.filter(l => l.severity === "warning").length,
      userLoginCount: logs.filter(l => l.action === "user.login").length,
      adminActions: logs.filter(l => l.action.startsWith("admin.")).length,
      securityEvents: logs.filter(l => l.action.startsWith("security.")).length,
      dataModifications: logs.filter(l => 
        l.action.includes("update") || l.action.includes("delete") || l.action.includes("create")
      ).length,
      uniqueUsers: new Set(logs.map(l => l.userId)).size,
    };

    return {
      period: { startDate, endDate },
      stats,
      logs,
    };
  }
}

export const auditTrail = new AuditTrail();
