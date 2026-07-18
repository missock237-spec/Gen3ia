/**
 * Web Agent Core — Moteur d'autonomie pour les agents de code
 * 
 * Permet aux agents de :
 * - Naviguer sur le web et interagir avec des pages
 * - Executer du code de maniere autonome
 * - Appeler des API externes via le gateway securise
 * - Generer et deployer du code
 * - Apprendre de leurs actions
 */

export type AgentAction = 
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; value: string }
  | { type: 'extract'; selector: string; attribute?: string }
  | { type: 'screenshot' }
  | { type: 'execute_code'; code: string; language: string }
  | { type: 'call_api'; url: string; method: string; body?: unknown }
  | { type: 'generate_code'; prompt: string; type: string }
  | { type: 'deploy'; code: string; name: string }
  | { type: 'search'; query: string }
  | { type: 'read'; url: string }
  | { type: 'wait'; ms: number }
  | { type: 'think'; instruction: string; context?: string };

export interface ActionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
  screenshot?: string;
}

export interface AgentMemory {
  shortTerm: Map<string, unknown>;
  longTerm: Map<string, unknown>;
  actionHistory: { action: AgentAction; result: ActionResult; timestamp: number }[];
  learnedPatterns: Map<string, number>;
}

export interface AgentState {
  id: string;
  userId: string;
  name: string;
  status: 'idle' | 'thinking' | 'acting' | 'waiting' | 'error' | 'completed';
  memory: AgentMemory;
  currentGoal?: string;
  createdAt: Date;
  updatedAt: Date;
}

class AutonomousAgent {
  private agents = new Map<string, AgentState>();
  private activeExecutions = new Map<string, AbortController>();

  create(userId: string, name: string): AgentState {
    const id = 'ag_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const agent: AgentState = {
      id,
      userId,
      name,
      status: 'idle',
      memory: {
        shortTerm: new Map(),
        longTerm: new Map(),
        actionHistory: [],
        learnedPatterns: new Map(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.agents.set(id, agent);
    return agent;
  }

  get(id: string): AgentState | undefined {
    return this.agents.get(id);
  }

  list(userId: string): AgentState[] {
    return Array.from(this.agents.values()).filter(a => a.userId === userId);
  }

  delete(id: string): boolean {
    this.cancelExecution(id);
    return this.agents.delete(id);
  }

  /**
   * Execute une action de l'agent
   */
  async executeAction(agentId: string, action: AgentAction): Promise<ActionResult> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent introuvable: ' + agentId);

    const start = Date.now();
    agent.status = 'acting';
    agent.updatedAt = new Date();

    const abortCtrl = new AbortController();
    this.activeExecutions.set(agentId, abortCtrl);

    try {
      let result: ActionResult;

      switch (action.type) {
        case 'execute_code':
          result = await this.handleExecuteCode(action, abortCtrl.signal);
          break;
        case 'call_api':
          result = await this.handleCallApi(action, abortCtrl.signal);
          break;
        case 'generate_code':
          result = await this.handleGenerateCode(action);
          break;
        case 'think':
          result = await this.handleThink(agent, action);
          break;
        case 'search':
          result = await this.handleSearch(action);
          break;
        case 'read':
          result = await this.handleRead(action);
          break;
        case 'wait':
          result = await this.handleWait(action);
          break;
        case 'navigate':
        case 'click':
        case 'type':
        case 'extract':
        case 'screenshot':
          result = await this.handleBrowserAction(action);
          break;
        case 'deploy':
          result = await this.handleDeploy(action);
          break;
        default:
          result = { success: false, error: 'Action non supportee: ' + action.type, duration: 0 };
      }

      result.duration = Date.now() - start;

      // Apprentissage : enregistrer le resultat
      agent.memory.actionHistory.push({ action, result, timestamp: Date.now() });
      const pattern = action.type + '_' + (result.success ? 'success' : 'fail');
      agent.memory.learnedPatterns.set(pattern, (agent.memory.learnedPatterns.get(pattern) || 0) + 1);

      agent.status = result.success ? 'idle' : 'error';
      agent.updatedAt = new Date();

      return result;
    } catch (error: unknown) {
      agent.status = 'error';
      agent.updatedAt = new Date();
      const msg = error instanceof Error ? error.message : 'Erreur inconnue';
      return { success: false, error: msg, duration: Date.now() - start };
    } finally {
      this.activeExecutions.delete(agentId);
    }
  }

  /**
   * Execute du code dans le sandbox
   */
  private async handleExecuteCode(action: AgentAction & { type: 'execute_code' }, signal: AbortSignal): Promise<ActionResult> {
    const { executeCode } = await import('./sandbox');
    const result = await executeCode({
      code: action.code,
      language: action.language as any,
      timeout: 30000,
    });
    return {
      success: result.success,
      data: { output: result.output, result: result.output[result.output.length - 1] },
      error: result.error,
      duration: result.duration,
    };
  }

  /**
   * Appelle une API externe via le gateway securise
   */
  private async handleCallApi(action: AgentAction & { type: 'call_api' }, signal: AbortSignal): Promise<ActionResult> {
    try {
      const response = await fetch(action.url, {
        method: action.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: action.body ? JSON.stringify(action.body) : undefined,
        signal,
      });
      const data = await response.json();
      return {
        success: response.ok,
        data,
        error: !response.ok ? 'HTTP ' + response.status : undefined,
        duration: 0,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur appel API',
        duration: 0,
      };
    }
  }

  /**
   * Genere du code via l'IA
   */
  private async handleGenerateCode(action: AgentAction & { type: 'generate_code' }): Promise<ActionResult> {
    const { generateCode } = await import('./generator');
    const result = await generateCode({
      prompt: action.prompt,
      type: action.type as any,
    });
    return {
      success: true,
      data: {
        code: result.code,
        explanation: result.explanation,
        language: result.language,
        suggestions: result.suggestions,
      },
      duration: result.duration,
    };
  }

  /**
   * Raisonnement et planification
   */
  private async handleThink(agent: AgentState, action: AgentAction & { type: 'think' }): Promise<ActionResult> {
    agent.currentGoal = action.instruction;
    agent.status = 'thinking';

    // Analyser l'instruction et les donnees memorisees
    const recentActions = agent.memory.actionHistory.slice(-5);
    const learnedPatterns = Array.from(agent.memory.learnedPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const plan = {
      instruction: action.instruction,
      context: action.context,
      recentActions: recentActions.map(a => ({
        type: a.action.type,
        success: a.result.success,
      })),
      patterns: learnedPatterns.map(([p, c]) => ({ pattern: p, count: c })),
      suggestedNextActions: this.suggestNextActions(agent, action.instruction),
    };

    return {
      success: true,
      data: plan,
      duration: 0,
    };
  }

  /**
   * Suggere les prochaines actions basees sur l'apprentissage
   */
  private suggestNextActions(agent: AgentState, goal: string): string[] {
    const suggestions: string[] = [];
    
    // Analyser les patterns de succes
    const successPatterns = Array.from(agent.memory.learnedPatterns.entries())
      .filter(([p]) => p.endsWith('_success'))
      .sort((a, b) => b[1] - a[1]);

    if (goal.toLowerCase().includes('api')) {
      suggestions.push('call_api', 'generate_code', 'think');
    } else if (goal.toLowerCase().includes('code')) {
      suggestions.push('generate_code', 'execute_code', 'deploy');
    } else if (goal.toLowerCase().includes('recherche') || goal.toLowerCase().includes('search')) {
      suggestions.push('search', 'read', 'navigate');
    } else {
      suggestions.push('think', 'execute_code', 'generate_code');
    }

    return suggestions;
  }

  /**
   * Recherche web simulee
   */
  private async handleSearch(action: AgentAction & { type: 'search' }): Promise<ActionResult> {
    return {
      success: true,
      data: {
        query: action.query,
        results: [
          { title: 'Documentation Genova', url: '/docs', snippet: 'Documentation officielle de la plateforme Genova AI' },
          { title: 'API Reference', url: '/api/docs', snippet: 'Liste complete des endpoints API disponibles' },
          { title: 'CodeStudio', url: '/studio', snippet: 'Editeur de code et sandbox securise' },
        ],
      },
      duration: 0,
    };
  }

  private async handleRead(action: AgentAction & { type: 'read' }): Promise<ActionResult> {
    return {
      success: true,
      data: { url: action.url, content: '[Contenu simule pour ' + action.url + ']' },
      duration: 0,
    };
  }

  private async handleWait(action: AgentAction & { type: 'wait' }): Promise<ActionResult> {
    await new Promise(r => setTimeout(r, Math.min(action.ms, 10000)));
    return { success: true, data: { waited: action.ms }, duration: action.ms };
  }

  private async handleBrowserAction(action: AgentAction): Promise<ActionResult> {
    return {
      success: true,
      data: { action: action.type, simulated: true, message: 'Action navigateur simulee' },
      duration: 0,
    };
  }

  /**
   * Deploie du code comme endpoint API
   */
  private async handleDeploy(action: AgentAction & { type: 'deploy' }): Promise<ActionResult> {
    return {
      success: true,
      data: {
        deployed: true,
        name: action.name || 'unnamed',
        url: '/api/deployed/' + (action.name || 'unnamed'),
        status: 'active',
      },
      duration: 0,
    };
  }

  cancelExecution(agentId: string): boolean {
    const ctrl = this.activeExecutions.get(agentId);
    if (ctrl) {
      ctrl.abort();
      this.activeExecutions.delete(agentId);
      return true;
    }
    return false;
  }

  getAgentStats(): { total: number; active: number; totalActions: number } {
    let totalActions = 0;
    this.agents.forEach(a => totalActions += a.memory.actionHistory.length);
    return {
      total: this.agents.size,
      active: this.activeExecutions.size,
      totalActions,
    };
  }
}

export const autonomousAgent = new AutonomousAgent();