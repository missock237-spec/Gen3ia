// ============================================================
// Gen3ia — Audit Trail API
// ============================================================
//  Trace les actions sensibles des utilisateurs pour l'audit
//  et la conformité. Plus léger que les logs Sentry, plus
//  structuré que les logs console.
// ============================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('audit-trail');

export type AuditAction =
  | 'login'
  | 'logout'
  | 'agent_create'
  | 'agent_delete'
  | 'agent_execute'
  | 'payment_initiate'
  | 'payment_complete'
  | 'credits_purchase'
  | 'data_export'
  | 'data_delete'
  | 'api_key_create'
  | 'api_key_revoke'
  | 'connector_authorize'
  | 'connector_revoke'
  | 'workflow_create'
  | 'workflow_delete'
  | 'phone_otp_send'
  | 'phone_otp_verify'
  | 'guardrail_update'
  | 'admin_action';

export interface AuditEntry {
  userId: string;
  action: AuditAction;
  resource?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * Enregistre une entrée d'audit.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource || 'unknown',
        resourceId: entry.resourceId || null,
        metadata: JSON.stringify(entry.metadata || {}),
        ip: entry.ip || null,
        userAgent: entry.userAgent || null,
        createdAt: new Date(),
      },
    }).catch(() => {
      // Table might not exist, fallback to log
      log.info('audit', entry);
    });
  } catch {
    log.warn('Failed to record audit entry', { action: entry.action });
  }
}

/**
 * Récupère l'historique d'audit d'un utilisateur.
 */
export async function getAuditTrail(
  userId: string,
  options: { limit?: number; offset?: number; action?: AuditAction } = {}
): Promise<Record<string, unknown>[]> {
  const { limit = 50, offset = 0, action } = options;

  try {
    const logs = await db.auditLog.findMany({ where: {} });
    let userLogs = (logs as Record<string, unknown>[]).filter(l => l.userId === userId);

    if (action) {
      userLogs = userLogs.filter(l => l.action === action);
    }

    // Trier par date décroissante et paginer
    userLogs.sort((a, b) =>
      new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()
    );

    return userLogs.slice(offset, offset + limit);
  } catch {
    return [];
  }
}

/**
 * Détecte des patterns suspects dans l'audit trail.
 * Retourne des alertes si des comportements anormaux sont détectés.
 */
export async function detectSuspiciousActivity(userId: string): Promise<{ alerts: string[]; riskLevel: 'low' | 'medium' | 'high' }> {
  const alerts: string[] = [];
  const recentLogs = await getAuditTrail(userId, { limit: 100 });

  // Trop de logins en échec (potentiel brute-force)
  const failedLogins = recentLogs.filter(l => l.action === 'login' && l.metadata === JSON.stringify({ success: false }));
  if (failedLogins.length > 10) {
    alerts.push('Nombreuses tentatives de connexion échouées');
  }

  // Export massif de données
  const dataExports = recentLogs.filter(l => l.action === 'data_export');
  if (dataExports.length > 5) {
    alerts.push('Exports de données fréquents');
  }

  // Création d'agents en rafale
  const agentCreates = recentLogs.filter(l => l.action === 'agent_create');
  if (agentCreates.length > 20) {
    alerts.push('Création d\\'agents en rafale (potentiel abus)');
  }

  // Clés API créées en rafale
  const apiKeyCreates = recentLogs.filter(l => l.action === 'api_key_create');
  if (apiKeyCreates.length > 5) {
    alerts.push('Création de clés API en rafale');
  }

  const riskLevel = alerts.length >= 3 ? 'high' : alerts.length >= 1 ? 'medium' : 'low';

  return { alerts, riskLevel };
}
