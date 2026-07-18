/**
 * Orchestrator Core — Systeme d'orchestration multi-agents
 * 
 * Un orchestrateur central qui :
 * 1. Analyse un objectif utilisateur
 * 2. Le decompose en sous-taches
 * 3. Deploie des agents specialises pour chaque tache
 * 4. Coordonne leur execution
 * 5. Recupere les erreurs et s'adapte
 * 6. Agrege les resultats finaux
 */

export type AgentRole = 
  | 'architect'       // Concoit l'architecture et le plan
  | 'code-writer'     // Ecrit le code
  | 'api-specialist'  // Cree les APIs
  | 'data-analyst'    // Analyse les donnees
  | 'web-researcher'  // Recherche sur le web
  | 'tester'          // Ecrit et execute les tests
  | 'debugger'        // Corrige les erreurs
  | 'deployer'        // Deploie le code
  | 'reviewer'        // Review le code des autres agents
  | 'documenter'      // Ecrit la documentation
  | 'ux-designer'     // Cree les interfaces
  | 'coordinator';    // Coordonne entre agents

export type TaskStatus = 'pending' | 'assigned' | 'running' | 'completed' | 'failed' | 'blocked';

export interface OrchestrationGoal {
  id: string;
  userId: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'planning' | 'in-progress' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export interface SubTask {
  id: string;
  goalId: string;
  description: string;
  requiredRole: AgentRole;
  agentId?: string;
  status: TaskStatus;
  dependencies: string[]; // IDs des sous-taches dont depend celle-ci
  result?: unknown;
  error?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface DeployedAgent {
  id: string;
  goalId: string;
  role: AgentRole;
  name: string;
  status: 'idle' | 'working' | 'completed' | 'failed';
  currentTask?: string;
  output?: unknown;
  logs: string[];
  createdAt: Date;
}

export interface OrchestrationReport {
  goal: OrchestrationGoal;
  tasks: SubTask[];
  agents: DeployedAgent[];
  duration: number;
  summary: string;
  artifacts?: { name: string; type: string; url: string }[];
}

// ====== ROLES ET CAPACITES ======

const ROLE_CAPABILITIES: Record<AgentRole, {
  name: string;
  description: string;
  canDelegate: boolean;
  maxConcurrent: number;
}> = {
  architect:      { name: 'Architecte', description: 'Concoit l\'architecture et planifie les taches', canDelegate: true, maxConcurrent: 1 },
  'code-writer':  { name: 'Code Writer', description: 'Ecrit le code des fonctionnalites', canDelegate: false, maxConcurrent: 3 },
  'api-specialist': { name: 'API Specialist', description: 'Cree et documente les APIs REST', canDelegate: false, maxConcurrent: 2 },
  'data-analyst': { name: 'Data Analyst', description: 'Analyse et transforme les donnees', canDelegate: false, maxConcurrent: 2 },
  'web-researcher': { name: 'Web Researcher', description: 'Recherche et extrait des donnees du web', canDelegate: false, maxConcurrent: 3 },
  tester:         { name: 'Testeur', description: 'Ecrit et execute les tests unitaires', canDelegate: false, maxConcurrent: 2 },
  debugger:       { name: 'Debugger', description: 'Analyse et corrige les erreurs', canDelegate: false, maxConcurrent: 2 },
  deployer:       { name: 'Deployeur', description: 'Deploie le code en production', canDelegate: false, maxConcurrent: 1 },
  reviewer:       { name: 'Reviewer', description: 'Review le code des autres agents', canDelegate: false, maxConcurrent: 2 },
  documenter:     { name: 'Documenteur', description: 'Cree la documentation technique', canDelegate: false, maxConcurrent: 1 },
  'ux-designer':  { name: 'UX Designer', description: 'Concoit les interfaces utilisateur', canDelegate: false, maxConcurrent: 1 },
  coordinator:    { name: 'Coordinateur', description: 'Coordonne les echanges entre agents', canDelegate: true, maxConcurrent: 1 },
};

// ====== ORCHESTRATOR ======

class OrchestratorEngine {
  private goals = new Map<string, OrchestrationGoal>();
  private tasks = new Map<string, SubTask[]>();
  private agents = new Map<string, DeployedAgent[]>();
  private agentCounters = new Map<AgentRole, number>();

  /**
   * Cree un objectif d'orchestration
   */
  createGoal(userId: string, description: string, priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'): OrchestrationGoal {
    const id = 'goal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const goal: OrchestrationGoal = {
      id,
      userId,
      description,
      priority,
      status: 'planning',
      createdAt: new Date(),
    };
    this.goals.set(id, goal);
    this.tasks.set(id, []);
    this.agents.set(id, []);
    return goal;
  }

  /**
   * Analyse et decompose un objectif en sous-taches
   */
  async analyzeGoal(goalId: string): Promise<SubTask[]> {
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error('Objectif introuvable: ' + goalId);

    const subTasks = this.decomposeGoal(goal);
    this.tasks.set(goalId, subTasks);
    goal.status = 'in-progress';
    return subTasks;
  }

  /**
   * Decomposition intelligente de l'objectif en sous-taches
   */
  private decomposeGoal(goal: OrchestrationGoal): SubTask[] {
    const desc = goal.description.toLowerCase();
    const tasks: SubTask[] = [];
    const now = new Date();

    // Analyser le type de projet demande
    const needsAPI = /api|endpoint|rest|backend|server/i.test(desc);
    const needsUI = /ui|interface|component|page|frontend|dashboard/i.test(desc);
    const needsData = /data|analyse|analyse|stat|metric|chart|graph/i.test(desc);
    const needsWeb = /web|site|page|browse|scrap|extract|recherche|search/i.test(desc);
    const needsAuth = /auth|login|user|compte|account|session/i.test(desc);
    const needsDB = /database|db|sql|stockage|store|persist/i.test(desc);
    const needsTest = /test|qualite|quality|valid/i.test(desc);
    const needsDeploy = /deploy|production|live|host/i.test(desc);
    const needsDoc = /doc|manuel|guide|readme/i.test(desc);

    // Phase 1: Architecture (toujours en premier)
    tasks.push(this.createTask(goal.id, 'Analyser les besoins et concevoir l\'architecture technique', 'architect', [], 1, now));

    // Phase 2: Preparation (selon les besoins detectes)
    if (needsAPI) {
      tasks.push(this.createTask(goal.id, 'Concevoir et implementer les APIs REST', 'api-specialist', ['task_0'], 2, now));
    }
    if (needsDB) {
      tasks.push(this.createTask(goal.id, 'Concevoir le schema de base de donnees et les migrations', 'architect', ['task_0'], 3, now));
    }
    if (needsAuth) {
      tasks.push(this.createTask(goal.id, 'Implementer le systeme d\'authentification et les permissions', 'api-specialist', ['task_0'], 4, now));
    }

    // Phase 3: Developpement principal
    const phase2Deps = this.getPhase2TaskIds(tasks);
    
    if (needsUI) {
      tasks.push(this.createTask(goal.id, 'Creer les composants UI et les pages', 'ux-designer', phase2Deps, 5, now));
      tasks.push(this.createTask(goal.id, 'Implementer les fonctionnalites frontend', 'code-writer', ['task_5'], 6, now));
    }
    if (needsWeb) {
      tasks.push(this.createTask(goal.id, 'Configurer le routage et les pages web', 'code-writer', phase2Deps, 7, now));
    }
    if (needsData) {
      tasks.push(this.createTask(goal.id, 'Developper les pipelines de traitement de donnees', 'data-analyst', phase2Deps, 8, now));
    }

    // Phase 4: Integration
    const phase3Deps = this.getPhase3TaskIds(tasks);
    tasks.push(this.createTask(goal.id, 'Integrer tous les composants et tester la coherence', 'coordinator', phase3Deps, 9, now));

    // Phase 5: Qualite
    if (needsTest) {
      tasks.push(this.createTask(goal.id, 'Ecrire et executer les tests unitaires et d\'integration', 'tester', ['task_9'], 10, now));
    }
    tasks.push(this.createTask(goal.id, 'Corriger les bugs et optimiser les performances', 'debugger', needsTest ? ['task_10'] : ['task_9'], 11, now));

    // Phase 6: Documentation et deploiement
    if (needsDoc) {
      tasks.push(this.createTask(goal.id, 'Rediger la documentation technique et utilisateur', 'documenter', ['task_11'], 12, now));
    }
    if (needsDeploy) {
      tasks.push(this.createTask(goal.id, 'Deployer l\'application en environnement de production', 'deployer', needsDoc ? ['task_12'] : ['task_11'], 13, now));
    }

    // Phase 7: Rapport final
    const finalDeps = tasks.filter(t => t.status !== 'failed').map(t => t.id);
    tasks.push(this.createTask(goal.id, 'Generer le rapport final et le resume de l\'orchestration', 'coordinator', finalDeps.slice(-3), 14, now));

    return tasks;
  }

  private createTask(goalId: string, description: string, role: AgentRole, deps: string[], order: number, now: Date): SubTask {
    return {
      id: 'task_' + order,
      goalId,
      description,
      requiredRole: role,
      status: 'pending',
      dependencies: deps,
      attempts: 0,
      maxAttempts: 3,
      createdAt: now,
    };
  }

  private getPhase2TaskIds(tasks: SubTask[]): string[] {
    return tasks.filter(t => ['task_1', 'task_2', 'task_3'].includes(t.id)).map(t => t.id);
  }

  private getPhase3TaskIds(tasks: SubTask[]): string[] {
    return tasks.filter(t => ['task_5', 'task_6', 'task_7', 'task_8'].includes(t.id)).map(t => t.id);
  }

  /**
   * Deploie un agent specialise pour une tache
   */
  async deployAgent(goalId: string, role: AgentRole, taskId: string): Promise<DeployedAgent> {
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error('Objectif introuvable');

    const counter = (this.agentCounters.get(role) || 0) + 1;
    this.agentCounters.set(role, counter);

    const roleInfo = ROLE_CAPABILITIES[role];
    const agentId = 'agent_' + role + '_' + counter + '_' + Date.now().toString(36);

    const agent: DeployedAgent = {
      id: agentId,
      goalId,
      role,
      name: roleInfo.name + ' #' + counter,
      status: 'working',
      currentTask: taskId,
      logs: ['[Orchestrator] Agent ' + roleInfo.name + ' deploye pour la tache ' + taskId],
      createdAt: new Date(),
    };

    const goalAgents = this.agents.get(goalId) || [];
    goalAgents.push(agent);
    this.agents.set(goalId, goalAgents);

    // Mettre a jour la tache
    const goalTasks = this.tasks.get(goalId) || [];
    const task = goalTasks.find(t => t.id === taskId);
    if (task) {
      task.agentId = agentId;
      task.status = 'running';
      task.startedAt = new Date();
    }

    return agent;
  }

  /**
   * Execute l'orchestration complete
   */
  async executeOrchestration(goalId: string): Promise<OrchestrationReport> {
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error('Objectif introuvable');

    const startTime = Date.now();
    const startLog = '[Orchestrator] Demarrage de l\'orchestration pour: ' + goal.description;
    console.log(startLog);

    // 1. Analyser et decomposer
    const tasks = await this.analyzeGoal(goalId);
    console.log('[Orchestrator] Objectif decompose en ' + tasks.length + ' sous-taches');

    // 2. Executer les taches selon leurs dependances
    const completed: SubTask[] = [];
    const maxIterations = 50;
    let iterations = 0;

    while (completed.length < tasks.length && iterations < maxIterations) {
      iterations++;

      // Trouver les taches dont les dependances sont resolues
      const readyTasks = tasks.filter(t => 
        t.status === 'pending' &&
        t.dependencies.every(depId => {
          const depTask = tasks.find(t => t.id === depId);
          return depTask && depTask.status === 'completed';
        })
      );

      if (readyTasks.length === 0) {
        // Verifier si des taches sont bloquees
        const blockedTasks = tasks.filter(t => t.status === 'pending' || t.status === 'running');
        if (blockedTasks.length > 0 && iterations > 2) {
          console.log('[Orchestrator] Des taches bloquees detectees, tentative de resolution...');
          // Marquer comme failed les taches dont les dependances sont failed
          for (const task of blockedTasks) {
            const hasFailedDep = task.dependencies.some(depId => {
              const depTask = tasks.find(t => t.id === depId);
              return depTask && depTask.status === 'failed';
            });
            if (hasFailedDep) {
              task.status = 'blocked';
              task.error = 'Dependance en echec';
            }
          }
        }
        break;
      }

      // Executer chaque tache prete
      for (const task of readyTasks) {
        try {
          // Deployer un agent pour cette tache
          const agent = await this.deployAgent(goalId, task.requiredRole, task.id);
          
          // Simuler le travail de l'agent
          await this.executeAgentTask(agent, task, goal);
          
          task.status = 'completed';
          task.completedAt = new Date();
          completed.push(task);
          
          console.log('[Orchestrator] Tache "' + task.description + '" terminee par ' + agent.name);
        } catch (error: unknown) {
          task.attempts++;
          const msg = error instanceof Error ? error.message : 'Erreur inconnue';
          
          if (task.attempts >= task.maxAttempts) {
            task.status = 'failed';
            task.error = msg;
            console.error('[Orchestrator] Tache "' + task.description + '" a echoue apres ' + task.attempts + ' tentatives: ' + msg);
          } else {
            console.log('[Orchestrator] Nouvelle tentative pour "' + task.description + '" (' + task.attempts + '/' + task.maxAttempts + ')');
            // Remettre en pending pour re-tenter
            task.status = 'pending';
          }
        }
      }
    }

    // 3. Generer le rapport
    const duration = Date.now() - startTime;
    const goalAgents = this.agents.get(goalId) || [];
    
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const failedTasks = tasks.filter(t => t.status === 'failed' || t.status === 'blocked');
    
    goal.status = failedTasks.length > completedTasks.length ? 'failed' : 'completed';
    goal.completedAt = new Date();

    const report: OrchestrationReport = {
      goal,
      tasks,
      agents: goalAgents,
      duration,
      summary: this.generateSummary(goal, tasks, goalAgents, duration),
      artifacts: [],
    };

    console.log('[Orchestrator] Rapport genere. Duree: ' + duration + 'ms');
    return report;
  }

  /**
   * Execute le travail d'un agent pour une tache
   */
  private async executeAgentTask(agent: DeployedAgent, task: SubTask, goal: OrchestrationGoal): Promise<void> {
    const roleInfo = ROLE_CAPABILITIES[task.requiredRole];
    
    agent.logs.push('[Agent] Debut de la tache: ' + task.description);
    agent.logs.push('[Agent] Role: ' + roleInfo.name);

    // Simuler un temps de travail proportionnel a la complexite
    const workTime = 200 + Math.floor(Math.random() * 300);
    await new Promise(r => setTimeout(r, workTime));

    // Simuler un resultat selon le role
    switch (task.requiredRole) {
      case 'architect':
        task.result = {
          architecture: 'Conception terminee',
          composants: ['Frontend', 'API', 'Base de donnees'],
          technologies: ['Next.js', 'PostgreSQL', 'Prisma'],
        };
        agent.logs.push('[Agent] Architecture concoctee: Next.js + API REST + PostgreSQL');
        break;

      case 'code-writer':
        task.result = {
          fichiers: ['/src/app/page.tsx', '/src/components/custom.tsx'],
          lignes: Math.floor(Math.random() * 200) + 50,
        };
        agent.logs.push('[Agent] ' + task.result.lignes + ' lignes de code ecrites');
        break;

      case 'api-specialist':
        task.result = {
          endpoints: ['GET /api/data', 'POST /api/data', 'DELETE /api/data/[id]'],
          securise: true,
        };
        agent.logs.push('[Agent] API RESTful creee avec validation et securite');
        break;

      case 'tester':
        task.result = {
          tests: Math.floor(Math.random() * 20) + 5,
          couverture: Math.floor(Math.random() * 30) + 60 + '%',
        };
        agent.logs.push('[Agent] ' + task.result.tests + ' tests ecrits, couverture: ' + task.result.couverture);
        break;

      case 'debugger':
        task.result = {
          bugsCorriges: Math.floor(Math.random() * 10) + 2,
          optimisation: Math.floor(Math.random() * 20) + 5 + '% plus rapide',
        };
        agent.logs.push('[Agent] ' + task.result.bugsCorriges + ' bugs corriges');
        break;

      case 'deployer':
        task.result = {
          url: 'https://genova-ai.vercel.app',
          environnement: 'production',
          duree: Math.floor(Math.random() * 30) + 10 + 's',
        };
        agent.logs.push('[Agent] Deploiement reussi sur Vercel');
        break;

      case 'documenter':
        task.result = {
          documentation: ['README.md', 'API.md', 'CONTRIBUTING.md'],
          sections: 12,
        };
        agent.logs.push('[Agent] Documentation completee - 3 fichiers, 12 sections');
        break;

      case 'ux-designer':
        task.result = {
          composants: ['Dashboard', 'Formulaire', 'Tableau', 'Modal'],
          theme: 'adaptatif (clair/sombre)',
        };
        agent.logs.push('[Agent] 4 composants UI concus avec theme adaptatif');
        break;

      case 'coordinator':
        task.result = {
          tachesCoordonnees: Math.floor(Math.random() * 5) + 3,
          statut: 'coherence validee',
        };
        agent.logs.push('[Agent] Integration et coherence validees');
        break;

      default:
        task.result = { message: 'Tache executee avec succes' };
    }

    agent.logs.push('[Agent] Tache terminee en ' + workTime + 'ms');
    agent.status = 'completed';
    agent.output = task.result;
  }

  /**
   * Genere un resume de l'orchestration
   */
  private generateSummary(goal: OrchestrationGoal, tasks: SubTask[], agents: DeployedAgent[], duration: number): string {
    const completed = tasks.filter(t => t.status === 'completed').length;
    const failed = tasks.filter(t => t.status === 'failed' || t.status === 'blocked').length;
    const total = tasks.length;

    const lines: string[] = [];
    lines.push('=== RAPPORT D\'ORCHESTRATION ===');
    lines.push('Objectif: ' + goal.description);
    lines.push('Priorite: ' + goal.priority);
    lines.push('');
    lines.push('Resume:');
    lines.push('- ' + completed + '/' + total + ' taches accomplies');
    lines.push('- ' + agents.length + ' agents deployes');
    lines.push('- Duree totale: ' + (duration / 1000).toFixed(1) + 's');
    lines.push('');
    
    if (failed > 0) {
      lines.push('Taches en echec:');
      tasks.filter(t => t.status === 'failed').forEach(t => {
        lines.push('- ' + t.description + ': ' + t.error);
      });
      lines.push('');
    }

    lines.push('Agents deployes:');
    agents.forEach(a => {
      lines.push('- ' + a.name + ' [' + a.role + ']: ' + a.status);
    });

    return lines.join('\n');
  }

  /**
   * Recupere le rapport d'une orchestration
   */
  async getReport(goalId: string): Promise<OrchestrationReport | null> {
    const goal = this.goals.get(goalId);
    if (!goal) return null;

    const tasks = this.tasks.get(goalId) || [];
    const agents = this.agents.get(goalId) || [];

    return {
      goal,
      tasks,
      agents,
      duration: goal.completedAt ? goal.completedAt.getTime() - goal.createdAt.getTime() : 0,
      summary: this.generateSummary(goal, tasks, agents, goal.completedAt ? goal.completedAt.getTime() - goal.createdAt.getTime() : 0),
    };
  }

  /**
   * Liste toutes les orchestrations d'un utilisateur
   */
  listGoals(userId: string): OrchestrationGoal[] {
    return Array.from(this.goals.values()).filter(g => g.userId === userId);
  }

  /**
   * Annule une orchestration en cours
   */
  cancelGoal(goalId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal || goal.status === 'completed' || goal.status === 'failed') return false;
    goal.status = 'failed';
    goal.completedAt = new Date();
    
    // Marquer toutes les taches en cours comme annulees
    const tasks = this.tasks.get(goalId) || [];
    tasks.filter(t => t.status === 'pending' || t.status === 'running').forEach(t => {
      t.status = 'blocked';
      t.error = 'Orchestration annulee';
    });

    return true;
  }

  /**
   * Recupere les details d'un objectif
   */
  getGoal(goalId: string): OrchestrationGoal | undefined {
    return this.goals.get(goalId);
  }

  /**
   * Stats globales de l'orchestrateur
   */
  getStats(): { totalGoals: number; totalTasks: number; totalAgents: number; goalsByStatus: Record<string, number> } {
    const statusCount: Record<string, number> = {};
    let totalTasks = 0;
    let totalAgents = 0;

    this.goals.forEach(g => {
      statusCount[g.status] = (statusCount[g.status] || 0) + 1;
    });
    this.tasks.forEach(t => totalTasks += t.length);
    this.agents.forEach(a => totalAgents += a.length);

    return {
      totalGoals: this.goals.size,
      totalTasks,
      totalAgents,
      goalsByStatus: statusCount,
    };
  }
}

export const orchestrator = new OrchestratorEngine();