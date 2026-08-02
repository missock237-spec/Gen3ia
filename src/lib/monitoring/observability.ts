// ============================================================
// OBSERVABILITY ENGINE — Metriques temps reel, alerte engine
// Dashboard activite, alertes configurables, notifications
// ============================================================
import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('observability');

export interface MetricsSummary {
  activeAgents: number; totalExecutions24h: number;
  avgTokens: number; totalCost: number;
  successRate: number; avgDurationMs: number;
  executionsByDay: { date: string; count: number }[];
  costByAgent: { agentName: string; cost: number }[];
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  type: string; agentName: string; action: string;
  status: string; tokens?: number; cost?: number;
  durationMs?: number; timestamp: Date;
}

export interface CreateAlertRuleInput {
  userId: string; name: string; description?: string;
  agentId?: string;
  condition: 'failure' | 'budget_exceeded' | 'slow_performance' | 'error_rate' | 'consecutive_failures';
  threshold: number; windowMinutes?: number;
  channels?: string[]; webhookUrl?: string;
}

export class ObservabilityEngine {
  async getMetricsSummary(userId: string): Promise<MetricsSummary> {
    const now = new Date();
    const last24h = new Date(now.getTime() - 86400000);

    const [invocations, agents, delegations] = await Promise.all([
      prisma.agentInvocation.findMany({ where: { userId, createdAt: { gte: last24h } }, select: { tokensUsed: true, cost: true, durationMs: true, createdAt: true, agentId: true, output: true } }),
      prisma.agent.findMany({ where: { ownerId: userId, status: 'active' }, select: { id: true, name: true } }),
      prisma.agentDelegation.findMany({ where: { OR: [{ sourceAgent: { ownerId: userId } }, { targetAgent: { ownerId: userId } }], createdAt: { gte: last24h } }, include: { sourceAgent: { select: { name: true } }, targetAgent: { select: { name: true } } } }),
    ]);

    const totalExecutions = invocations.length;
    const totalTokens = invocations.reduce((s, i) => s + (i.tokensUsed || 0), 0);
    const totalCost = invocations.reduce((s, i) => s + Number(i.cost || 0), 0);
    const totalDuration = invocations.reduce((s, i) => s + (i.durationMs || 0), 0);
    const errors = invocations.filter(i => i.output?.toLowerCase().includes('error') || i.output?.toLowerCase().includes('fail'));
    const successRate = totalExecutions > 0 ? ((totalExecutions - errors.length) / totalExecutions) * 100 : 100;
    const avgDurationMs = totalExecutions > 0 ? Math.round(totalDuration / totalExecutions) : 0;

    const executionsByDay: Record<string, number> = {};
    invocations.forEach(i => { const d = i.createdAt.toISOString().slice(0,10); executionsByDay[d] = (executionsByDay[d] || 0) + 1; });

    const agentCostMap: Record<string, { name: string; cost: number }> = {};
    agents.forEach(a => { agentCostMap[a.id] = { name: a.name, cost: 0 }; });
    invocations.forEach(i => { if (agentCostMap[i.agentId]) agentCostMap[i.agentId].cost += Number(i.cost || 0); });

    const recentActivity: ActivityItem[] = [
      ...invocations.slice(0,10).map(i => ({ type: 'invocation', agentName: agents.find(a => a.id === i.agentId)?.name || 'Inconnu', action: 'Execution', status: errors.includes(i) ? 'failed' : 'completed', tokens: i.tokensUsed, cost: Number(i.cost), durationMs: i.durationMs, timestamp: i.createdAt })),
      ...delegations.slice(0,5).map(d => ({ type: 'delegation', agentName: d.sourceAgent.name, action: 'Delegation vers ' + d.targetAgent.name, status: d.status, timestamp: d.createdAt })),
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 15);

    return {
      activeAgents: agents.length, totalExecutions24h: totalExecutions,
      avgTokens: totalExecutions > 0 ? Math.round(totalTokens / totalExecutions) : 0,
      totalCost: Math.round(totalCost * 100) / 100,
      successRate: Math.round(successRate * 10) / 10, avgDurationMs,
      executionsByDay: Object.entries(executionsByDay).map(([date, count]) => ({ date, count })),
      costByAgent: Object.values(agentCostMap).filter(a => a.cost > 0),
      recentActivity,
    };
  }

  async createAlertRule(input: CreateAlertRuleInput) {
    const rule = await prisma.alertRule.create({
      data: {
        userId: input.userId, name: input.name,
        description: input.description || '',
        agentId: input.agentId || null,
        condition: input.condition, threshold: input.threshold,
        windowMinutes: input.windowMinutes || 60,
        channels: JSON.stringify(input.channels || ['email']),
        webhookUrl: input.webhookUrl || null, enabled: true,
      },
    });
    log.info('alert_rule_created', { ruleId: rule.id, condition: input.condition });
    return rule;
  }

  async evaluateAlertRules(userId: string) {
    const rules = await prisma.alertRule.findMany({ where: { userId, enabled: true } });
    const metrics = await this.getMetricsSummary(userId);
    const triggered: any[] = [];

    for (const rule of rules) {
      let shouldTrigger = false, severity = 'warning', message = '';
      switch (rule.condition) {
        case 'budget_exceeded':
          if (metrics.totalCost > rule.threshold) { shouldTrigger = true; severity = 'critical'; message = 'Budget depasse: ' + metrics.totalCost + ' FCFA (seuil: ' + rule.threshold + ' FCFA)'; }
          break;
        case 'slow_performance':
          if (metrics.avgDurationMs > rule.threshold) { shouldTrigger = true; severity = 'warning'; message = 'Performance anormale: ' + metrics.avgDurationMs + 'ms (seuil: ' + rule.threshold + 'ms)'; }
          break;
        case 'error_rate':
          const errorRate = 100 - metrics.successRate;
          if (errorRate > rule.threshold) { shouldTrigger = true; severity = 'warning'; message = "Taux d'erreur: " + errorRate + '% (seuil: ' + rule.threshold + '%)'; }
          break;
        default: break;
      }
      if (shouldTrigger) {
        const event = await this.createAlertEvent({ ruleId: rule.id, userId, agentId: rule.agentId, type: rule.condition, severity, title: 'Alerte: ' + rule.name, message, metadata: { metrics } });
        await this.sendNotification(rule, event);
        triggered.push(event);
      }
    }
    return triggered;
  }

  async createAlertEvent(data: { ruleId: string; userId: string; agentId?: string; type: string; severity: string; title: string; message: string; metadata?: any }) {
    const event = await prisma.alertEvent.create({ data: { ruleId: data.ruleId, userId: data.userId, agentId: data.agentId || null, type: data.type, severity: data.severity, title: data.title, message: data.message, metadata: JSON.stringify(data.metadata || {}) } });
    await prisma.alertRule.update({ where: { id: data.ruleId }, data: { lastTriggeredAt: new Date() } });
    return event;
  }

  private async sendNotification(rule: any, event: any) {
    const channels = JSON.parse(rule.channels || '[]');
    const channelsSent: string[] = [];
    for (const channel of channels) {
      try {
        switch (channel) {
          case 'email': log.info('notification_email', { to: 'user', subject: event.title }); channelsSent.push('email'); break;
          case 'webhook': if (rule.webhookUrl) { log.info('notification_webhook', { url: rule.webhookUrl }); channelsSent.push('webhook'); } break;
          case 'sms': log.info('notification_sms', { to: 'user', message: event.title }); channelsSent.push('sms'); break;
        }
      } catch (err) { log.error('notification_failed', { channel, error: String(err) }); }
    }
    await prisma.alertEvent.update({ where: { id: event.id }, data: { channelsSent: JSON.stringify(channelsSent) } });
  }

  async getAlertEvents(userId: string, limit = 20) { return prisma.alertEvent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit, include: { rule: { select: { name: true } } } }); }
  async getAlertRules(userId: string) { return prisma.alertRule.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }); }
  async markAlertRead(eventId: string, userId: string) { return prisma.alertEvent.updateMany({ where: { id: eventId, userId }, data: { read: true } }); }
  async toggleAlertRule(ruleId: string, userId: string, enabled: boolean) { return prisma.alertRule.updateMany({ where: { id: ruleId, userId }, data: { enabled } }); }
  async deleteAlertRule(ruleId: string, userId: string) { return prisma.alertRule.deleteMany({ where: { id: ruleId, userId } }); }
}

export const observability = new ObservabilityEngine();
export default observability;