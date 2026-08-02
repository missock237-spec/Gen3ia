// ============================================================
// AUDIT TRAIL — Journalisation sécurisée des actions (Phase 2.3)
// Trace : authentification (login, 2FA, oauth), transactions de crédits,
//         changements de config (agents, webhooks), accès API, erreurs critiques.
// Conformité : GDPR, SOC 2.
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";

export type AuditAction =
  // === Authentification ===
  | "user.login" | "user.logout" | "user.register"
  | "user.two_factor_enabled" | "user.two_factor_disabled" | "user.two_factor_challenge"
  | "user.oauth_google" | "user.oauth_github" | "user.password_reset"
  // === Agents / workflows / config ===
  | "agent.create" | "agent.update" | "agent.delete" | "agent.execute" | "agent.config_update"
  | "workflow.create" | "workflow.execute"
  | "settings.update" | "security.alert"
  // === Transactions de crédits ===
  | "credits.earned" | "credits.spent" | "credits.refund"
  // === Webhooks / intégrations ===
  | "webhook.create" | "webhook.update" | "webhook.delete"
  // === Paiements ===
  | "payment.subscribe" | "payment.webhook"
  // === Accès API ===
  | "api_key.create" | "api_key.revoke" | "api.access" | "api.error"
  // === Administration / erreurs ===
  | "admin.access" | "admin.action" | "error.critical" | "security.violation";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditLogInput {
  userId: string;
  action: AuditAction;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  severity?: AuditSeverity;
  ipAddress?: string;
  userAgent?: string;
}

class AuditTrail {
  async log(params: AuditLogInput): Promise<void> {
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
          userAgent: params.userAgent?.slice(0, 200) ?? null,
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

  // ==== Raccourcis sémantiques (améliore la lisibilité des appels) ====

  auth(params: Omit<AuditLogInput, "action"> & { action: "user.login" | "user.logout" | "user.register" }) {
    return this.log({ ...params, severity: params.severity ?? "info" });
  }

  twoFa(params: Omit<AuditLogInput, "action"> & { action: "user.two_factor_enabled" | "user.two_factor_disabled" | "user.two_factor_challenge" }) {
    return this.log({ ...params, severity: params.action.includes("challenge") ? "warning" : "info" });
  }

  credits(params: Omit<AuditLogInput, "action"> & { action: "credits.earned" | "credits.spent" | "credits.refund" }) {
    return this.log({ ...params, severity: "info" });
  }

  webhook(params: Omit<AuditLogInput, "action"> & { action: "webhook.create" | "webhook.update" | "webhook.delete" }) {
    return this.log({ ...params, severity: "warning" });
  }

  apiAccess(params: Omit<AuditLogInput, "action"> & { action: "api.access" }) {
    return this.log({ ...params, severity: "info" });
  }

  criticalError(params: Omit<AuditLogInput, "action" | "severity">) {
    return this.log({ ...params, action: "error.critical", severity: "critical" });
  }

  /** Enregistre une requête API (clé utilisée + endpoint). */
  async logApiAccess(input: {
    apiKeyId: string;
    userId: string;
    endpoint: string;
    statusCode: number;
    method: string;
  }): Promise<void> {
    await this.log({
      userId: input.userId,
      action: "api.access",
      resource: "api_key",
      resourceId: input.apiKeyId,
      details: { endpoint: input.endpoint, method: input.method, statusCode: input.statusCode },
      severity: input.statusCode >= 500 ? "critical" : "info",
    });
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
