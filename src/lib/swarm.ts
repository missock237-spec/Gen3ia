// ============================================================
// SWARM — Orchestrateur d'essaims d'agents multi-compétences
// ============================================================
// Permet à plusieurs agents de collaborer, se déléguer des
// tâches et se superviser en parallèle.
// Pattern : Un orchestrateur central répartit le travail entre
// des agents spécialisés qui communiquent via un bus d'événements.
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";
import { checkpointManager } from "./checkpoint";
import { supervisor } from "./supervisor";

export type AgentRole = "coordinator" | "researcher" | "analyst" | "writer" | "reviewer" | "coder" | "custom";

export interface SwarmAgent {
  id: string;
  name: string;
  role: AgentRole;
  model: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
}

export interface SwarmTask {
  id: string;
  type: string;
  input: string;
  assignedTo: string;
  dependsOn: string[];  // IDs des tâches à attendre
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
  cost: number;
  tokens: number;
}

export interface SwarmExecution {
  id: string;
  sessionId: string;
  userId: string;
  goal: string;
  coordinatorAgentId: string;
  agents: SwarmAgent[];
  tasks: SwarmTask[];
  status: "planning" | "executing" | "completed" | "failed";
  totalCost: number;
  totalTokens: number;
  startedAt: Date;
  completedAt?: Date;
}

class SwarmOrchestrator {
  /**
   * Planifie les tâches pour un objectif donné.
   * L'orchestrateur découpe l'objectif en sous-tâches
   * et les assigne aux agents spécialisés.
   */
  async plan(goal: string, agents: SwarmAgent[]): Promise<SwarmTask[]> {
    const coordinator = agents.find((a) => a.role === "coordinator");
    if (!coordinator) {
      throw new Error("Un agent coordinateur est requis pour le swarm");
    }

    logger.info("swarm_planning_started", {
      goal: goal.slice(0, 100),
      agentCount: agents.length,
      roles: agents.map((a) => a.role),
    });

    // Découpage intelligent basé sur les rôles disponibles
    const tasks: SwarmTask[] = [];
    const roleMap = new Map<AgentRole, SwarmAgent>();
    for (const agent of agents) {
      roleMap.set(agent.role, agent);
    }

    // Étape 1 : Recherche (si un researcher est disponible)
    if (roleMap.has("researcher")) {
      tasks.push({
        id: `task_research_${Date.now()}`,
        type: "research",
        input: `Recherche sur: ${goal}`,
        assignedTo: roleMap.get("researcher")!.id,
        dependsOn: [],
        status: "pending",
        cost: 0,
        tokens: 0,
      });
    }

    // Étape 2 : Analyse (si analyste disponible)
    if (roleMap.has("analyst")) {
      const dependsOn = tasks.filter((t) => t.type === "research").map((t) => t.id);
      tasks.push({
        id: `task_analysis_${Date.now()}`,
        type: "analysis",
        input: `Analyse des données pour: ${goal}`,
        assignedTo: roleMap.get("analyst")!.id,
        dependsOn,
        status: "pending",
        cost: 0,
        tokens: 0,
      });
    }

    // Étape 3 : Synthèse/Rédaction
    const writerRole = roleMap.get("writer") ?? roleMap.get("reviewer");
    if (writerRole) {
      const dependsOn = tasks.map((t) => t.id);
      tasks.push({
        id: `task_synthesis_${Date.now()}`,
        type: "synthesis",
        input: `Synthèse finale pour: ${goal}`,
        assignedTo: writerRole.id,
        dependsOn,
        status: "pending",
        cost: 0,
        tokens: 0,
      });
    }

    // Étape 4 : Révision
    if (roleMap.has("reviewer") && writerRole?.role !== "reviewer") {
      const dependsOn = tasks.filter((t) => t.type === "synthesis").map((t) => t.id);
      tasks.push({
        id: `task_review_${Date.now()}`,
        type: "review",
        input: `Révision de la synthèse pour: ${goal}`,
        assignedTo: roleMap.get("reviewer")!.id,
        dependsOn,
        status: "pending",
        cost: 0,
        tokens: 0,
      });
    }

    logger.info("swarm_planning_completed", {
      tasksCount: tasks.length,
      tasks: tasks.map((t) => ({ type: t.type, agentId: t.assignedTo.slice(0, 8), dependsOn: t.dependsOn.length })),
    });

    return tasks;
  }

  /**
   * Exécute les tâches planifiées en respectant les dépendances.
   */
  async execute(
    sessionId: string,
    agents: SwarmAgent[],
    tasks: SwarmTask[],
    onProgress?: (task: SwarmTask) => void,
  ): Promise<{ completedTasks: SwarmTask[]; totalCost: number; totalTokens: number }> {
    const completedTasks: SwarmTask[] = [];
    let totalCost = 0;
    let totalTokens = 0;

    const agentMap = new Map(agents.map((a) => [a.id, a]));

    // Phase 1 : Exécution des tâches sans dépendances
    const ready = tasks.filter((t) => t.dependsOn.length === 0);
    const blocked = tasks.filter((t) => t.dependsOn.length > 0);

    for (const task of ready) {
      task.status = "running";
      logger.info("swarm_task_started", { taskId: task.id, type: task.type, agentId: task.assignedTo.slice(0, 8) });

      // Simulation d'exécution — REMPLACER par l'appel LLM réel
      await new Promise((resolve) => setTimeout(resolve, 500));
      task.status = "completed";
      task.result = `[${task.type.toUpperCase()}] Résultat pour: ${task.input.slice(0, 50)}...`;
      task.cost = 0.0002;
      task.tokens = 150;
      totalCost += task.cost;
      totalTokens += task.tokens;
      completedTasks.push(task);

      onProgress?.(task);

      // Sauvegarde checkpoint
      await checkpointManager.save({
        agentId: task.assignedTo,
        sessionId: `${sessionId}_${task.id}`,
        step: 1,
        context: { task: task.type, input: task.input, result: task.result },
        memory: [{ role: "user", content: task.input, timestamp: new Date().toISOString() }, { role: "assistant", content: task.result ?? "", timestamp: new Date().toISOString() }],
        actions: [{ action: task.type, input: task.input, output: task.result ?? "", timestamp: new Date().toISOString(), cost: task.cost }],
        totalCost: task.cost,
        totalTokens: task.tokens,
      });
    }

    // Phase 2 : Exécution des tâches avec dépendances
    for (const task of blocked) {
      // Vérifier que toutes les dépendances sont complétées
      const depsCompleted = task.dependsOn.every((depId) =>
        completedTasks.some((ct) => ct.id === depId && ct.status === "completed"),
      );

      if (!depsCompleted) {
        task.status = "failed";
        task.error = `Dépendances non satisfaites: ${task.dependsOn.join(", ")}`;
        completedTasks.push(task);
        continue;
      }

      task.status = "running";
      await new Promise((resolve) => setTimeout(resolve, 300));
      task.status = "completed";
      task.result = `[${task.type.toUpperCase()}] Résultat synthèse pour: ${task.input.slice(0, 50)}...`;
      task.cost = 0.0003;
      task.tokens = 200;
      totalCost += task.cost;
      totalTokens += task.tokens;
      completedTasks.push(task);

      onProgress?.(task);
    }

    logger.info("swarm_execution_completed", {
      tasksCompleted: completedTasks.filter((t) => t.status === "completed").length,
      tasksFailed: completedTasks.filter((t) => t.status === "failed").length,
      totalCost,
      totalTokens,
    });

    return { completedTasks, totalCost, totalTokens };
  }

  /**
   * Exécution complète : Planification + Exécution.
   */
  async runSwarm(params: {
    sessionId: string;
    userId: string;
    goal: string;
    agents: SwarmAgent[];
  }): Promise<{ execution: SwarmExecution; result: string }> {
    const { sessionId, userId, goal, agents } = params;

    logger.info("swarm_run_started", { sessionId, goal: goal.slice(0, 100), agents: agents.length });

    const tasks = await this.plan(goal, agents);
    const { completedTasks, totalCost, totalTokens } = await this.execute(sessionId, agents, tasks);

    const allCompleted = completedTasks.every((t) => t.status === "completed");

    const execution: SwarmExecution = {
      id: `swarm_${sessionId}`,
      sessionId,
      userId,
      goal,
      coordinatorAgentId: agents.find((a) => a.role === "coordinator")?.id ?? agents[0]!.id,
      agents,
      tasks: completedTasks,
      status: allCompleted ? "completed" : "failed",
      totalCost,
      totalTokens,
      startedAt: new Date(),
      completedAt: new Date(),
    };

    const result = completedTasks
      .filter((t) => t.status === "completed")
      .map((t) => t.result)
      .join("\n\n");

    logger.info("swarm_run_completed", {
      sessionId,
      status: execution.status,
      tasksCompleted: completedTasks.filter((t) => t.status === "completed").length,
      totalCost,
      totalTokens,
    });

    return { execution, result };
  }
}

export const swarmOrchestrator = new SwarmOrchestrator();
export default swarmOrchestrator;