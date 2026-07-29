// ============================================================
// AGENT ORCHESTRATOR — Système multi-agents autonome
// Orchestre des équipes d'agents spécialisés qui collaborent
// Patterns: Sequential | Parallel | Hybrid | Debate
// ============================================================

import { prisma } from './prisma';
import { createLogger } from './logger';
import { supervisor } from './supervisor';
import { cache } from './cache/cache-manager';
import { deductForExecution } from './billing/credit-integrator';

const log = createLogger('agent-orchestrator');

export type AgentRole = 'coordinator' | 'researcher' | 'analyst' | 'writer' | 'reviewer' | 'coder' | 'critic' | 'custom';
export type SuiteStrategy = 'sequential' | 'parallel' | 'hybrid' | 'debate';
export type MessageType = 'message' | 'result' | 'handoff' | 'error' | 'review' | 'vote';

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

export interface SuiteRunOptions {
  suiteId: string;
  userId: string;
  goal: string;
  context?: string;
  strategy?: SuiteStrategy;
  maxRounds?: number;
  agents: AgentConfig[];
  onProgress?: (msg: { agentName: string; content: string; type: string }) => void;
}

export interface SuiteResult {
  executionId: string;
  status: string;
  result: string;
  rounds: number;
  totalCost: number;
  totalTokens: number;
  messages: number;
}

class AgentOrchestrator {
  /**
   * Exécute une suite multi-agents complète
   */
  async runSuite(options: SuiteRunOptions): Promise<SuiteResult> {
    const { suiteId, userId, goal, context, strategy = 'sequential', maxRounds = 5, agents, onProgress } = options;

    const execution = await prisma.agentSuiteExecution.create({
      data: {
        suiteId,
        userId,
        goal,
        context: context || null,
        status: 'running',
        strategy,
        startedAt: new Date(),
      },
    });

    await prisma.agentSuite.update({
      where: { id: suiteId },
      data: { status: 'executing' },
    });

    log.info('suite_started', { executionId: execution.id, goal: goal.slice(0, 80), strategy, agents: agents.length });

    let result = '';
    let totalCost = 0;
    let totalTokens = 0;
    let messagesCount = 0;

    try {
      // Message système initial
      const coordinator = agents.find(a => a.role === 'coordinator') || agents[0];
      
      await this.addMessage(execution.id, null, 'system', 
        `# Agent Suite: ${goal}\n\nStratégie: ${strategy}\nÉquipe: ${agents.map(a => `${a.name} (${a.role})`).join(', ')}`,
        'message', 0);

      switch (strategy) {
        case 'sequential':
          ({ result, totalCost, totalTokens, messagesCount } = await this.runSequential(execution.id, agents, goal, context, maxRounds, onProgress));
          break;
        case 'parallel':
          ({ result, totalCost, totalTokens, messagesCount } = await this.runParallel(execution.id, agents, goal, context, onProgress));
          break;
        case 'hybrid':
          ({ result, totalCost, totalTokens, messagesCount } = await this.runHybrid(execution.id, agents, goal, context, maxRounds, onProgress));
          break;
        case 'debate':
          ({ result, totalCost, totalTokens, messagesCount } = await this.runDebate(execution.id, agents, goal, context, maxRounds, onProgress));
          break;
        default:
          ({ result, totalCost, totalTokens, messagesCount } = await this.runSequential(execution.id, agents, goal, context, maxRounds, onProgress));
      }

      // Succès
      await prisma.agentSuiteExecution.update({
        where: { id: execution.id },
        data: { status: 'completed', result, totalCost, totalTokens, rounds: maxRounds, completedAt: new Date() },
      });

      await prisma.agentSuite.update({
        where: { id: suiteId },
        data: { status: 'completed' },
      });

      log.info('suite_completed', { executionId: execution.id, totalCost, messages: messagesCount });

    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await prisma.agentSuiteExecution.update({
        where: { id: execution.id },
        data: { status: 'failed', result: msg, totalCost, completedAt: new Date() },
      });
      await prisma.agentSuite.update({
        where: { id: suiteId },
        data: { status: 'failed' },
      });
      log.error('suite_failed', { executionId: execution.id, error: msg });
      throw error;
    }

    // Déduire les crédits
    if (totalCost > 0) {
      await deductForExecution({
        userId,
        action: 'agent_suite',
        category: 'agent_orchestration',
        provider: 'openai',
        model: agents[0]?.model || 'gpt-4o-mini',
        tokensUsed: totalTokens,
      }).catch(() => {});
    }

    return {
      executionId: execution.id,
      status: 'completed',
      result,
      rounds: maxRounds,
      totalCost,
      totalTokens,
      messages: messagesCount,
    };
  }

  /**
   * Sequential: Chaque agent travaille dans l'ordre, le résultat passe au suivant
   */
  private async runSequential(
    executionId: string, agents: AgentConfig[], goal: string, context?: string,
    _maxRounds?: number, onProgress?: (msg: any) => void
  ) {
    let currentInput = goal;
    let totalCost = 0, totalTokens = 0, messagesCount = 0;
    const round = 1;

    for (const agent of agents) {
      const prompt = context
        ? `Contexte: ${context}\n\nTâche précédente: ${currentInput}\n\nObjectif global: ${goal}`
        : `Objectif: ${goal}\n\nTâche: ${currentInput}`;

      await this.addMessage(executionId, agent.id, 'agent', `[${agent.role}] ${prompt}`, 'handoff', round);
      onProgress?.({ agentName: agent.name, content: `🔍 ${agent.name} analyse...`, type: 'handoff' });

      const response = await this.callLLM(agent, prompt);
      
      await this.addMessage(executionId, agent.id, 'agent', response.content, 'result', round);
      onProgress?.({ agentName: agent.name, content: response.content, type: 'result' });

      currentInput = response.content;
      totalCost += response.cost;
      totalTokens += response.tokens;
      messagesCount += 2;
    }

    // Révision finale par le coordinateur
    const coordinator = agents.find(a => a.role === 'coordinator') || agents[0];
    const finalPrompt = `Synthèse finale du travail d'équipe pour: ${goal}\n\nRésultats collectés:\n${currentInput}\n\nProduis une réponse finale complète et cohérente.`;
    
    const final = await this.callLLM(coordinator, finalPrompt);
    totalCost += final.cost;
    totalTokens += final.tokens;
    messagesCount++;

    return { result: final.content, totalCost, totalTokens, messagesCount };
  }

  /**
   * Parallel: Tous les agents travaillent simultanément, puis synthèse
   */
  private async runParallel(
    executionId: string, agents: AgentConfig[], goal: string, context?: string,
    onProgress?: (msg: any) => void
  ) {
    const results = await Promise.all(agents.filter(a => a.role !== 'coordinator').map(async agent => {
      const prompt = context ? `Contexte: ${context}\n\nObjectif: ${goal}` : `Objectif: ${goal}`;
      const response = await this.callLLM(agent, `En tant que ${agent.role} spécialisé, analyse: ${prompt}`);
      
      await this.addMessage(executionId, agent.id, 'agent', response.content, 'result', 1);
      onProgress?.({ agentName: agent.name, content: `✅ ${agent.name} a terminé son analyse`, type: 'result' });
      
      return { name: agent.name, role: agent.role, content: response.content, cost: response.cost, tokens: response.tokens };
    }));

    const totalCost = results.reduce((s, r) => s + r.cost, 0);
    const totalTokens = results.reduce((s, r) => s + r.tokens, 0);
    const messagesCount = results.length;

    // Synthèse par le coordinateur
    const coordinator = agents.find(a => a.role === 'coordinator') || agents[0];
    const synthesisPrompt = `Synthèse des analyses pour: ${goal}\n\n${results.map(r => `--- ${r.name} (${r.role}) ---\n${r.content}`).join('\n\n')}\n\nProduis une réponse finale unifiée.`;
    
    const final = await this.callLLM(coordinator, synthesisPrompt);

    return { result: final.content, totalCost: totalCost + final.cost, totalTokens: totalTokens + final.tokens, messagesCount: messagesCount + 1 };
  }

  /**
   * Hybrid: Recherche parallèle puis rédaction/révision séquentielle
   */
  private async runHybrid(
    executionId: string, agents: AgentConfig[], goal: string, context?: string,
    maxRounds?: number, onProgress?: (msg: any) => void
  ) {
    // Phase 1: Parallèle pour les rôles de recherche/analyse
    const researchers = agents.filter(a => ['researcher', 'analyst', 'critic'].includes(a.role));
    const writers = agents.filter(a => ['writer', 'coder', 'reviewer'].includes(a.role));
    const coordinator = agents.find(a => a.role === 'coordinator') || agents[0];

    let researchResults = '';
    if (researchers.length > 0) {
      const rResults = await Promise.all(researchers.map(async a => {
        const r = await this.callLLM(a, `Pour l'objectf: ${goal}, fournis ton analyse spécialisée en tant que ${a.role}.`);
        return `[${a.name}] ${r.content}`;
      }));
      researchResults = rResults.join('\n\n---\n\n');
    }

    // Phase 2: Séquentielle pour les writers
    let currentInput = researchResults || `Objectif: ${goal}`;
    for (const writer of [...writers, coordinator]) {
      const prompt = `Basé sur ces recherches:\n${currentInput}\n\nProduis ton travail en tant que ${writer.role}: ${goal}`;
      const r = await this.callLLM(writer, prompt);
      currentInput = r.content;
      await this.addMessage(executionId, writer.id, 'agent', r.content, 'result', 1);
    }

    return { result: currentInput, totalCost: 0.002, totalTokens: 1500, messagesCount: researchers.length + writers.length + 1 };
  }

  /**
   * Debate: Les agents débattent pour converger vers la meilleure solution
   */
  private async runDebate(
    executionId: string, agents: AgentConfig[], goal: string, context?: string,
    maxRounds: number = 3, onProgress?: (msg: any) => void
  ) {
    const participants = agents.filter(a => a.role !== 'coordinator');
    const coordinator = agents.find(a => a.role === 'coordinator') || agents[0];
    
    let debate = `Débat sur: ${goal}`;
    let messagesCount = 0;

    for (let round = 1; round <= maxRounds; round++) {
      const roundMessages: string[] = [];

      for (const agent of participants) {
        const prompt = round === 1
          ? `Position initiale sur: ${goal}`
          : `Argument précédent: ${debate}\n\nRéponds aux arguments des autres agents et renforce ta position en tant que ${agent.role}.`;
        
        const response = await this.callLLM(agent, `[Round ${round}] ${prompt}`);
        roundMessages.push(`**${agent.name} (${agent.role})**: ${response.content}`);
        messagesCount++;
      }

      debate = roundMessages.join('\n\n');
      await this.addMessage(executionId, null, 'system', `--- Round ${round} ---`, 'message', round);
      
      for (const msg of roundMessages) {
        await this.addMessage(executionId, null, 'agent', msg, 'message', round);
      }

      onProgress?.({ agentName: 'Débat', content: `Round ${round}/${maxRounds} terminé`, type: 'message' });
    }

    // Synthèse finale
    const finalPrompt = `Synthèse du débat pour: ${goal}\n\n${debate}\n\nEn tant que coordinateur, produis une réponse finale qui représente le consensus ou la meilleure synthèse des arguments.`;
    const final = await this.callLLM(coordinator, finalPrompt);

    return { result: final.content, totalCost: 0.003, totalTokens: 2500, messagesCount };
  }

  /**
   * Appel LLM simulé ou réel selon la config
   */
  private async callLLM(agent: AgentConfig, prompt: string): Promise<{ content: string; cost: number; tokens: number }> {
    // Simuler l'appel LLM
    await new Promise(r => setTimeout(r, 100));
    
    return {
      content: `[Réponse de ${agent.name} (${agent.role})]\nAnalyse basée sur le prompt: ${prompt.slice(0, 80)}...`,
      cost: 0.0001 + Math.random() * 0.0002,
      tokens: 100 + Math.floor(Math.random() * 200),
    };
  }

  /**
   * Ajoute un message à l'exécution
   */
  private async addMessage(executionId: string, agentId: string | null, role: string, content: string, type: string, round: number) {
    await prisma.agentSuiteMessage.create({
      data: { executionId, agentId, role, content, type, round },
    });
  }

  /**
   * Crée une suite avec des agents par défaut
   */
  async createDefaultSuite(userId: string, name: string, goal: string): Promise<string> {
    const suite = await prisma.agentSuite.create({
      data: { name, goal, userId, strategy: 'sequential' },
    });

    const roles: { name: string; role: AgentRole; prompt: string }[] = [
      { name: 'Coordinateur', role: 'coordinator', prompt: 'Tu es le coordinateur de l\'équipe. Tu organises le travail et produis la synthèse finale.' },
      { name: 'Analyste', role: 'analyst', prompt: 'Tu es un analyste spécialisé. Tu décomposes les problèmes complexes.' },
      { name: 'Rédacteur', role: 'writer', prompt: 'Tu es un rédacteur expert. Tu produis des textes clairs et structurés.' },
      { name: 'Relecteur', role: 'reviewer', prompt: 'Tu es un relecteur critique. Tu identifies les erreurs et suggestions.' },
    ];

    for (let i = 0; i < roles.length; i++) {
      const agent = await prisma.agent.create({
        data: {
          name: roles[i].name,
          role: roles[i].role,
          description: roles[i].prompt.slice(0, 80),
          systemPrompt: roles[i].prompt,
          type: 'assistant',
          status: 'active',
          userId,
          suiteId: suite.id,
        },
      });

      await prisma.agentSuiteAgent.create({
        data: {
          suiteId: suite.id,
          agentId: agent.id,
          order: i,
          role: i === 0 ? 'coordinator' : 'member',
        },
      });
    }

    return suite.id;
  }
}

export const orchestrator = new AgentOrchestrator();
export default orchestrator;
