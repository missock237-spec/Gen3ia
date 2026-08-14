// ============================================================
// AGENT DELEGATION — Delegation entre agents specialises
// Un agent peut deleguer une sous-tache a un autre agent
// ============================================================
import { prisma } from './prisma';
import { createLogger } from './logger';

const log = createLogger('agent-delegation');

export interface DelegationRequest {
  sourceAgentId: string;
  targetAgentId: string;
  task: string;
  context?: string;
  priority?: number;
  maxWaitMs?: number;
}

export class AgentDelegationSystem {
  /**
   * Delegue une tache a un agent specialise
   */
  async delegate(request: DelegationRequest) {
    const sourceAgent = await prisma.agent.findUnique({ where: { id: request.sourceAgentId } });
    const targetAgent = await prisma.agent.findUnique({ where: { id: request.targetAgentId } });

    if (!sourceAgent || !targetAgent) throw new Error('Agent source ou cible introuvable');
    if (targetAgent.status !== 'active') throw new Error('Agent cible non actif');

    const delegation = await prisma.agentDelegation.create({
      data: {
        sourceAgentId: request.sourceAgentId,
        targetAgentId: request.targetAgentId,
        task: request.task,
        context: request.context || '',
        status: 'pending',
        priority: request.priority || 0,
        maxWaitMs: request.maxWaitMs || 60000,
      },
      include: {
        sourceAgent: { select: { name: true, role: true } },
        targetAgent: { select: { name: true, role: true } },
      },
    });

    log.info('delegation_created', {
      delegationId: delegation.id,
      source: sourceAgent.name,
      target: targetAgent.name,
    });

    // Auto-executer la delegation
// @ts-ignore
    this.executeDelegation(delegation.id).catch(err => {
      log.error('delegation_execution_error', { delegationId: delegation.id, error: String(err) });
    });

    return delegation;
  }

  /**
   * Execute une delegation (appel LLM simule)
   */
  private async executeDelegation(delegationId: string) {
    await prisma.agentDelegation.update({
      where: { id: delegationId },
      data: { status: 'running', startedAt: new Date() },
    });

    try {
      const delegation = await prisma.agentDelegation.findUnique({
        where: { id: delegationId },
        include: {
          sourceAgent: true,
          targetAgent: true,
        },
      });
      if (!delegation) throw new Error('Delegation introuvable');

      // Construire le prompt pour l'agent cible
      const prompt = [
        `Tu es ${(delegation as any).targetAgent.name}, specialise en ${(delegation as any).targetAgent.role}.`,
// @ts-ignore
        `\n\nInstructions: ${(delegation as any).targetAgent.instructions || 'Execute la tache delegatee.'}`,
// @ts-ignore
        `\n\nTache delegatee par ${delegation.sourceAgent.name}: ${delegation.task}`,
        delegation.context ? `\n\nContexte: ${delegation.context}` : '',
        `\n\nFournis un resultat detaille et directement exploitable.`,
      ].join('');

      // Simulation d'appel LLM (a remplacer par un vrai appel)
      const result = await this.callAgentLLM((delegation as any).targetAgent, prompt);

      await prisma.agentDelegation.update({
        where: { id: delegationId },
        data: {
          status: 'completed',
          result: result.content,
          completedAt: new Date(),
        },
      });

      log.info('delegation_completed', { delegationId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erreur inconnue';
      await prisma.agentDelegation.update({
        where: { id: delegationId },
        data: { status: 'failed', error: msg, completedAt: new Date() },
      });
      log.error('delegation_failed', { delegationId, error: msg });
    }
  }

  /**
   * Delegue et attend le resultat (synchrone)
   */
  async delegateAndWait(request: DelegationRequest): Promise<{
    delegationId: string;
    status: string;
    result: string | null;
    error: string | null;
  }> {
    const delegation = await this.delegate(request);

    // Attendre le resultat (polling)
    const maxWait = request.maxWaitMs || 60000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      const updated = await prisma.agentDelegation.findUnique({
// @ts-ignore
        where: { id: delegation.id },
        select: { status: true, result: true, error: true },
      });
      if (!updated) break;

      if (updated.status === 'completed' || updated.status === 'failed' || updated.status === 'rejected') {
        return {
// @ts-ignore
          delegationId: delegation.id,
          status: updated.status,
// @ts-ignore
          result: updated.result,
// @ts-ignore
          error: updated.error,
        };
      }

      await new Promise(r => setTimeout(r, 500));
    }

    // Timeout
    return {
// @ts-ignore
      delegationId: delegation.id,
      status: 'timeout',
      result: null,
      error: 'Delai d\'attente depasse',
    };
  }

  /**
   * Liste les delegations pour un agent
   */
  async getDelegations(agentId: string, asSource: boolean = true) {
    return prisma.agentDelegation.findMany({
      where: asSource ? { sourceAgentId: agentId } : { targetAgentId: agentId },
      include: {
        sourceAgent: { select: { id: true, name: true, role: true } },
        targetAgent: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Appel LLM via l'AI Router (avec fallback sur reponse simulee marquee)
   */
  private async callAgentLLM(agent: any, prompt: string): Promise<{ content: string; cost: number; tokens: number }> {
    try {
      const { createAIRouter } = await import('./ai-router');
      const aiRouter = createAIRouter('system');
      const response = await aiRouter.chat([
        { role: 'system', content: agent.instructions || `Tu es ${agent.name}, un agent specialise en ${agent.role}.` },
        { role: 'user', content: prompt },
      ], { model: agent.model || 'gpt-4o-mini' });

      return {
        content: response.content,
        cost: response.costUsd || 0.0001,
        tokens: response.usage?.totalTokens || 150,
      };
    } catch (error) {
      // Fallback simule — MARQUE explicitement que c'est une simulation
      log.warn('delegation_llm_fallback', { agent: agent.name, error: String(error) });
      await new Promise(r => setTimeout(r, 200));
      return {
        content: `[SIMULATION] ${agent.name} n'a pas pu joindre le LLM. Reponse de fallback:\n\nAnalyse basee sur le prompt: ${prompt.slice(0, 200)}...`,
        cost: 0,
        tokens: 0,
      };
    }
  }
}

export const agentDelegation = new AgentDelegationSystem();
export default agentDelegation;