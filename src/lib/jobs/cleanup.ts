import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

const RETENTION = { agentActionLogs: 90, monitoringEvents: 60, activityLogs: 30, auditLogs: 365, sessions: 30, agentExecutions: 90, connectorExecutions: 60 };

export async function cleanupOldData() {
  const results = {};
  const now = new Date();
  for (const [table, days] of Object.entries(RETENTION)) {
    const cutoff = new Date(now.getTime() - days * 86400000);
    try {
      let deleted = 0;
      const where = { createdAt: { lt: cutoff } };
      if (table === 'agentActionLogs') deleted = (await prisma.agentActionLog.deleteMany({ where })).count;
      else if (table === 'monitoringEvents') deleted = (await prisma.monitoringEvent.deleteMany({ where })).count;
      else if (table === 'activityLogs') deleted = (await prisma.activityLog.deleteMany({ where })).count;
      else if (table === 'auditLogs') deleted = (await prisma.auditLog.deleteMany({ where })).count;
      else if (table === 'sessions') deleted = (await prisma.session.deleteMany({ where: { expiresAt: { lt: cutoff } } })).count;
      else if (table === 'agentExecutions') deleted = (await prisma.agentExecution.deleteMany({ where })).count;
      else if (table === 'connectorExecutions') deleted = (await prisma.connectorExecution.deleteMany({ where })).count;
      results[table] = deleted;
      if (deleted > 0) logger.info('Cleanup ' + table + ': ' + deleted + ' supprimees');
    } catch (e) { logger.error('Erreur cleanup ' + table, { error: e.message }); results[table] = -1; }
  }
  return results;
}
