// ============================================================
// SELF-IMPROVEMENT ENGINE — Apprentissage continu des agents
// Analyse les performances passées pour ajuster automatiquement
// les prompts, la température, le modèle et les stratégies.
// ============================================================

import { prisma } from './prisma';
import { createLogger } from './logger';

const log = createLogger('self-improvement');

interface AgentMetrics {
  successRate: number;
  avgTokens: number;
  avgExecutionTime: number;
  totalExecutions: number;
  failureReasons: Map<string, number>;
}

interface ImprovementAction {
  action: 'prompt_tuning' | 'strategy_change' | 'model_switch' | 'temperature_adjust' | 'memory_prune' | 'threshold_adjust';
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
  score: number;
}

class SelfImprovementEngine {
  /**
   * Analyse les performances d'un agent et propose des améliorations
   */
  async analyzeAndImprove(agentId: string): Promise<ImprovementAction | null> {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true, name: true, systemPrompt: true, temperature: true,
        model: true, successes: true, failures: true,
        avgTokensUse: true, avgExecutionTime: true, lastImprovedAt: true,
      },
    });

    if (!agent) return null;

    // Ne pas améliorer plus d'une fois par heure
    if (agent.lastImprovedAt && Date.now() - agent.lastImprovedAt.getTime() < 3600000) {
      return null;
    }

    const metrics = await this.computeMetrics(agentId);
    const action = this.decideImprovement(agent, metrics);

    if (!action) return null;

    await this.applyImprovement(agentId, agent.userId, action, metrics);
    return action;
  }

  private async computeMetrics(agentId: string): Promise<AgentMetrics> {
    const executions = await prisma.agentExecution.findMany({
      where: { agentId, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      select: { status: true, totalTokens: true, estimatedCost: true, completedAt: true, createdAt: true },
    });

    const total = executions.length;
    if (total === 0) {
      return { successRate: 0, avgTokens: 0, avgExecutionTime: 0, totalExecutions: 0, failureReasons: new Map() };
    }

    const successes = executions.filter(e => e.status === 'completed').length;
    const failureReasons = new Map<string, number>();

    for (const exec of executions) {
      if (exec.status !== 'completed') {
        const reason = exec.status || 'unknown';
        failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
      }
    }

    const avgTokens = Math.round(executions.reduce((s, e) => s + e.totalTokens, 0) / total);
    const times = executions
      .filter(e => e.completedAt)
      .map(e => e.completedAt!.getTime() - e.createdAt.getTime());
    const avgExecutionTime = times.length > 0
      ? times.reduce((s, t) => s + t, 0) / times.length / 1000
      : 0;

    return {
      successRate: total > 0 ? successes / total : 0,
      avgTokens,
      avgExecutionTime,
      totalExecutions: total,
      failureReasons,
    };
  }

  private decideImprovement(agent: any, metrics: AgentMetrics): ImprovementAction | null {
    const actions: ImprovementAction[] = [];

    // 1. Prompt tuning si taux d'échec > 30%
    if (metrics.successRate < 0.7 && metrics.totalExecutions >= 5) {
      actions.push({
        action: 'prompt_tuning',
        field: 'systemPrompt',
        oldValue: agent.systemPrompt || '',
        newValue: this.tunePrompt(agent.systemPrompt || '', metrics),
        reason: `Taux de succès faible (${(metrics.successRate * 100).toFixed(0)}%) sur ${metrics.totalExecutions} exécutions`,
        score: Math.round((1 - metrics.successRate) * 100),
      });
    }

    // 2. Ajustement de température si trop d'erreurs
    if (metrics.failureReasons.size > 2 && agent.temperature > 0.5) {
      actions.push({
        action: 'temperature_adjust',
        field: 'temperature',
        oldValue: String(agent.temperature),
        newValue: String(Math.max(0.1, agent.temperature - 0.2)),
        reason: `Température ${agent.temperature} trop élevée — ${metrics.failureReasons.size} types d'erreurs différents`,
        score: 60,
      });
    }

    // 3. Changement de modèle si coût trop élevé
    if (metrics.avgTokens > 3000 && agent.model.includes('gpt-4o') && !agent.model.includes('mini')) {
      actions.push({
        action: 'model_switch',
        field: 'model',
        oldValue: agent.model,
        newValue: 'gpt-4o-mini',
        reason: `Consommation moyenne élevée (${metrics.avgTokens} tokens) — passage à gpt-4o-mini recommandé`,
        score: Math.min(100, Math.round(metrics.avgTokens / 50)),
      });
    }

    // 4. Augmentation température si trop rigide (taux succès élevé mais peu créatif)
    if (metrics.successRate > 0.95 && metrics.totalExecutions >= 10 && agent.temperature < 0.5) {
      actions.push({
        action: 'temperature_adjust',
        field: 'temperature',
        oldValue: String(agent.temperature),
        newValue: String(Math.min(1.0, agent.temperature + 0.2)),
        reason: `Taux de succès très élevé (${(metrics.successRate * 100).toFixed(0)}%) — augmentation de la température pour plus de créativité`,
        score: 30,
      });
    }

    // Retourner la meilleure action
    if (actions.length === 0) {
      // Ajustement automatique du système prompt si aucune action critique
      const promptLength = (agent.systemPrompt || '').length;
      if (promptLength > 2000 && metrics.avgExecutionTime > 30) {
        return {
          action: 'prompt_tuning',
          field: 'systemPrompt',
          oldValue: agent.systemPrompt || '',
          newValue: this.summarizePrompt(agent.systemPrompt || ''),
          reason: `Prompt trop long (${promptLength} car.) — temps d'exécution moyen de ${metrics.avgExecutionTime.toFixed(0)}s`,
          score: 40,
        };
      }
      return null;
    }

    return actions.sort((a, b) => b.score - a.score)[0]!;
  }

  private tunePrompt(currentPrompt: string, metrics: AgentMetrics): string {
    let prompt = currentPrompt || "Tu es un assistant IA utile.";

    // Ajouter des directives basées sur les échecs
    if (metrics.failureReasons.size > 0) {
      const failures = Array.from(metrics.failureReasons.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      const instructions = failures.map(([reason]) => {
        switch (reason) {
          case 'timeout': return '⚠️ Optimise tes réponses pour être plus rapide.';
          case 'error': return '⚠️ Vérifie tes réponses avant de les envoyer.';
          case 'cancelled': return '⚠️ Assure-toi de bien comprendre la demande avant de répondre.';
          default: return '';
        }
      }).filter(Boolean);

      if (instructions.length > 0) {
        prompt += `\n\nInstructions auto-optimisées :\n${instructions.join('\n')}`;
      }
    }

    return prompt;
  }

  private summarizePrompt(prompt: string): string {
    if (prompt.length <= 1500) return prompt;
    // Garder les premières lignes (rôle) et les dernières (instructions)
    const lines = prompt.split('\n');
    const head = lines.slice(0, Math.ceil(lines.length * 0.3)).join('\n');
    const tail = lines.slice(-Math.ceil(lines.length * 0.4)).join('\n');
    return `${head}\n\n... (contenu optimisé automatiquement) ...\n\n${tail}`;
  }

  private async applyImprovement(
    agentId: string, userId: string, action: ImprovementAction, metrics: AgentMetrics
  ): Promise<void> {
    const updateData: Record<string, any> = {};

    switch (action.field) {
      case 'systemPrompt':
        updateData.systemPrompt = action.newValue;
        break;
      case 'temperature':
        updateData.temperature = parseFloat(action.newValue);
        break;
      case 'model':
        updateData.model = action.newValue;
        break;
    }

    await prisma.agent.update({
      where: { id: agentId },
      data: { ...updateData, lastImprovedAt: new Date() },
    });

    await prisma.improvementLog.create({
      data: {
        agentId,
        userId,
        action: action.action,
        field: action.field,
        oldValue: action.oldValue,
        newValue: action.newValue,
        reason: action.reason,
        score: action.score,
        metricsBefore: JSON.stringify(metrics),
      },
    });

    log.info('self_improvement_applied', {
      agentId: agentId.slice(0, 8),
      action: action.action,
      field: action.field,
      score: action.score,
    });
  }

  /**
   * Analyse tous les agents et applique les améliorations
   */
  async analyzeAllAgents(): Promise<{ analyzed: number; improved: number }> {
    const agents = await prisma.agent.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    let improved = 0;
    for (const agent of agents) {
      try {
        const result = await this.analyzeAndImprove(agent.id);
        if (result) improved++;
      } catch (error) {
        log.error('self_improvement_error', { agentId: agent.id, error: String(error) });
      }
    }

    log.info('self_improvement_batch', { analyzed: agents.length, improved });
    return { analyzed: agents.length, improved };
  }

  /**
   * Enregistre le résultat d'une exécution pour les futures analyses
   */
  async recordExecution(agentId: string, userId: string, success: boolean, tokens: number, durationMs: number): Promise<void> {
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        successes: { increment: success ? 1 : 0 },
        failures: { increment: success ? 0 : 1 },
        avgTokensUse: tokens,
        avgExecutionTime: durationMs / 1000,
      },
    });
  }

  /**
   * Récupère l'historique des améliorations d'un agent
   */
  async getImprovementHistory(agentId: string, limit = 10) {
    return prisma.improvementLog.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export const improvementEngine = new SelfImprovementEngine();
export default improvementEngine;
