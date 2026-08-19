// ============================================================
// EXPORT ENGINE — Export de donnees (JSON/CSV)
// Portabilite des donnees utilisateur
// ============================================================
import { prisma } from './prisma';
import { createLogger } from './logger';

const log = createLogger('export-engine');

export type ExportFormat = 'json' | 'csv';
export type ExportEntity = 'all' | 'agents' | 'workflows' | 'datasets' | 'dashboards' | 'conversations' | 'marketplace' | 'plugins' | 'webhooks' | 'notifications';

export interface ExportResult {
  format: ExportFormat;
  data: Record<string, any>;
  totalSize: number;
  exportedAt: string;
  entities: string[];
}

export class ExportEngine {
  /**
   * Exporte toutes les donnees d'un utilisateur
   */
  async exportAll(userId: string, format: ExportFormat = 'json', entities?: ExportEntity[]): Promise<ExportResult> {
    const targetEntities = entities || ['agents', 'workflows', 'datasets', 'dashboards', 'conversations', 'plugins', 'webhooks'];
    const data: Record<string, any> = {};
    const exported: string[] = [];

    for (const entity of targetEntities) {
      try {
        switch (entity) {
          case 'agents': {
            const agents = await prisma.agent.findMany({
              where: { ownerId: userId },
              include: { tools: true },
            });
            data.agents = agents;
            exported.push('agents');
            break;
          }
          case 'workflows': {
            const workflows = await prisma.workflow.findMany({
              where: { userId },
              include: { branches: true, versions: { take: 10, orderBy: { createdAt: 'desc' } }, collaborators: true },
            });
            data.workflows = workflows;
            exported.push('workflows');
            break;
          }
          case 'datasets': {
            const datasets = await prisma.dataset.findMany({ where: { userId } });
            data.datasets = datasets;
            exported.push('datasets');
            break;
          }
          case 'dashboards': {
            const dashboards = await prisma.dashboard.findMany({ where: { userId } });
            data.dashboards = dashboards;
            exported.push('dashboards');
            break;
          }
          case 'conversations': {
            const conversations = await prisma.conversation.findMany({
              where: { userId },
              include: { messages: { take: 50, orderBy: { createdAt: 'asc' } } },
            });
            data.conversations = conversations;
            exported.push('conversations');
            break;
          }
          case 'plugins': {
            const plugins = await prisma.plugin.findMany({
              where: { authorId: userId },
              include: { executions: { take: 20, orderBy: { createdAt: 'desc' } } },
            });
            data.plugins = plugins;
            exported.push('plugins');
            break;
          }
          case 'webhooks': {
            const webhooks = await prisma.webhookConfig.findMany({
              where: { userId },
              include: { logs: { take: 20, orderBy: { createdAt: 'desc' } } },
            });
            data.webhooks = webhooks;
            exported.push('webhooks');
            break;
          }
        }
      } catch (err) {
        log.warn('export_entity_failed', { entity, error: String(err) });
        data[entity] = { error: String(err) };
      }
    }

    const result: ExportResult = {
      format,
      data,
      totalSize: JSON.stringify(data).length,
      exportedAt: new Date().toISOString(),
      entities: exported,
    };

    log.info('export_completed', { userId, format, entities: exported.length, size: result.totalSize });
    return result;
  }

  /**
   * Exporte un type de donnees specifique
   */
  async exportEntity(userId: string, entity: ExportEntity, format: ExportFormat = 'json') {
    if (entity === 'all') return this.exportAll(userId, format);
    return this.exportAll(userId, format, [entity]);
  }

  /**
   * Convertit les donnees au format CSV
   */
  toCSV(data: Record<string, any>[], columns?: string[]): string {
    if (!data || data.length === 0) return '';
    const cols = columns || Object.keys(data[0]);
    const header = cols.map(c => this.escapeCSV(c)).join(',') + '\n';
    const rows = data.map(row => {
      return cols.map(col => this.escapeCSV(String(row[col] ?? ''))).join(',');
    }).join('\n');
    return header + rows;
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  }

  /**
   * Recupere les statistiques de compte
   */
  async getAccountStats(userId: string) {
    const [agents, workflows, datasets, dashboards, conversations, plugins, webhooks, invocations, alerts] = await Promise.all([
      prisma.agent.count({ where: { ownerId: userId } }),
      prisma.workflow.count({ where: { userId } }),
      prisma.dataset.count({ where: { userId } }),
      prisma.dashboard.count({ where: { userId } }),
      prisma.conversation.count({ where: { userId } }),
      prisma.plugin.count({ where: { authorId: userId } }),
      prisma.webhookConfig.count({ where: { userId } }),
      prisma.agentInvocation.count({ where: { userId } }),
      prisma.alertRule.count({ where: { userId } }),
    ]);
    return { agents, workflows, datasets, dashboards, conversations, plugins, webhooks, invocations, alerts };
  }
}

export const exportEngine = new ExportEngine();
export default exportEngine;