// Audit Trail — enregistre chaque action sensible des agents et utilisateurs
// Fournit une piste d'audit complete pour la conformite et le forensique

import { prisma } from '@/lib/prisma';

export type AuditAction =
  | 'AGENT_EXECUTED_ACTION'
  | 'AGENT_ACCESSED_SERVICE'
  | 'AGENT_FAILED'
  | 'AGENT_BLOCKED_BY_SECURITY'
  | 'SERVICE_CONNECTED'
  | 'SERVICE_DISCONNECTED'
  | 'TOKEN_REFRESHED'
  | 'TOKEN_REVOKED'
  | 'TOKEN_DECRYPTION_FAILED'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'USER_REGISTERED'
  | 'PASSWORD_CHANGED'
  | 'PERMISSION_GRANTED'
  | 'PERMISSION_REVOKED'
  | 'ANOMALY_DETECTED'
  | 'BUDGET_EXCEEDED'
  | 'SECURITY_ALERT'
  | 'CODE_EXECUTED'
  | 'ADMIN_ACTION';

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

interface AuditEntry {
  action: AuditAction;
  actorId: string;
  actorType: 'user' | 'agent' | 'system' | 'admin';
  targetId?: string;
  targetType?: string;
  description: string;
  metadata?: Record<string, unknown>;
  severity: AuditSeverity;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.actorType === 'agent' ? entry.targetId || 'system' : entry.actorId,
        action: entry.action,
        resource: entry.targetType || entry.actorType,
        resourceId: entry.targetId || entry.actorId,
        details: JSON.stringify({
          actorType: entry.actorType,
          description: entry.description,
          metadata: entry.metadata || {},
          severity: entry.severity,
          ip: entry.ip,
          userAgent: entry.userAgent,
          sessionId: entry.sessionId,
        }),
        ipAddress: entry.ip,
        userAgent: entry.userAgent,
        severity: entry.severity,
      },
    });

    // Si severite critique, logger aussi dans monitoring
    if (entry.severity === 'critical') {
      await prisma.monitoringEvent.create({
        data: {
          userId: entry.actorId,
          eventType: 'security_audit',
          source: 'audit_trail',
          message: entry.description,
          details: JSON.stringify(entry),
          severity: 'critical',
        },
      });
    }
  } catch (error) {
    console.error('[Audit] Erreur enregistrement:', error);
  }
}

export async function getAuditLogs(options: {
  userId?: string;
  agentId?: string;
  action?: AuditAction;
  severity?: AuditSeverity;
  limit?: number;
  offset?: number;
  since?: Date;
  until?: Date;
}): Promise<{ logs: unknown[]; total: number }> {
  const where: Record<string, unknown> = {};
  if (options.userId) where.userId = options.userId;
  if (options.action) where.action = options.action;
  if (options.severity) where.severity = options.severity;
  if (options.since || options.until) {
    where.createdAt = {};
    if (options.since) (where.createdAt as Record<string, unknown>).gte = options.since;
    if (options.until) (where.createdAt as Record<string, unknown>).lte = options.until;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit || 50,
      skip: options.offset || 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}

export async function getAgentAuditTrail(agentId: string, limit = 20): Promise<unknown[]> {
  return prisma.auditLog.findMany({
    where: {
      OR: [
        { resourceId: agentId, resource: 'agent' },
        { details: { contains: agentId } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getSecuritySummary(userId: string): Promise<{
  totalActions: number;
  warnings: number;
  errors: number;
  criticals: number;
  last24h: number;
  lastAlert?: string;
}> {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [total, warnings, errors, criticals, recent] = await Promise.all([
    prisma.auditLog.count({ where: { userId } }),
    prisma.auditLog.count({ where: { userId, severity: 'warning' } }),
    prisma.auditLog.count({ where: { userId, severity: 'error' } }),
    prisma.auditLog.count({ where: { userId, severity: 'critical' } }),
    prisma.auditLog.findFirst({
      where: { userId, createdAt: { gte: last24h }, severity: { in: ['error', 'critical'] } },
      orderBy: { createdAt: 'desc' },
      select: { action: true, description: true, createdAt: true },
    }),
  ]);

  return {
    totalActions: total,
    warnings,
    errors,
    criticals,
    last24h: await prisma.auditLog.count({ where: { userId, createdAt: { gte: last24h } } }),
    lastAlert: recent ? recent.description : undefined,
  };
}
