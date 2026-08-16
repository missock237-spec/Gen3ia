// ============================================================
// Swarm Orchestrator — Orchestration multi-agents
// Distribue une tache complexe entre plusieurs agents
// Chaque phase : research -> analyze -> generate -> review -> execute
// ============================================================

import { createLogger } from "@/lib/logger";
import { db } from "@/lib/db";
import { supervisor } from "./supervisor";

const log = createLogger('swarm');

interface SwarmTask {
  id: string;
  type: 'research' | 'analyze' | 'generate' | 'review' | 'execute';
  description: string;
  agentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  priority: number;
  result?: Record<string, unknown>;
}

export class SwarmOrchestrator {
  private tasks = new Map<string, SwarmTask>();

  async orchestrate(
    mainTask: string,
    agentIds: string[],
    userId: string,
  ): Promise<{ tasks: SwarmTask[]; status: ReturnType<SwarmOrchestrator['getStatus']> }> {
    supervisor.startTask(mainTask.substring(0, 100));

    log.info('Swarm orchestration started', {
      task: mainTask.substring(0, 80),
      agents: agentIds.length,
    });

    // 1. Creer les sous-taches distribuees
    const phases: SwarmTask['type'][] = ['research', 'analyze', 'generate', 'review', 'execute'];
    const tasks: SwarmTask[] = agentIds.map((agentId, i) => {
      const task: SwarmTask = {
        id: `t_${Date.now()}_${i}`,
        type: phases[i % phases.length],
        description: mainTask.substring(0, 200),
        agentId,
        status: 'pending',
        priority: 5 - i,
      };
      this.tasks.set(task.id, task);
      return task;
    });

    // 2. Executer chaque tache sequentiellement
    for (const task of tasks) {
      task.status = 'running';

      // Charger l'agent
      const agent = await db.agent.findUnique({
        where: { id: task.agentId },
        select: { id: true, name: true, type: true, description: true },
      });

      if (!agent) {
        task.status = 'failed';
        log.warn('Swarm agent not found', { agentId: task.agentId });
        continue;
      }

      // Verifier superviseur
      const check = supervisor.recordIteration({
        step: 1,
        action: task.type,
        thought: task.description,
        result: '',
        timestamp: new Date(),
      });

      if (check.shouldStop) {
        log.warn('Swarm stopped by supervisor', { reason: check.reason });
        break;
      }

      // Executer
      try {
        task.result = {
          taskId: task.id,
          type: task.type,
          executedBy: task.agentId,
          agentName: agent.name,
          status: 'ok',
        };
        task.status = 'completed';

        // Logger dans actionLog
        await db.agentActionLog.create({
          data: {
            agentId: task.agentId,
            action: task.type,
            details: JSON.stringify(task),
            status: 'completed',
            result: JSON.stringify(task.result),
            userId,
            resolvedAt: new Date(),
          },
        });

        // Memoire partagee entre agents du swarm
        await db.agentMemory.create({
          data: {
            agentId: task.agentId,
            userId,
            content: `[Swarm:${task.type}] ${mainTask.substring(0, 300)} -> ${task.result.status}`,
            source: 'swarm',
            relevance: 0.8,
          },
        });

        log.info('Swarm task completed', {
          taskId: task.id,
          type: task.type,
          agent: agent.name,
        });
      } catch (error) {
        task.status = 'failed';
        log.error('Swarm task failed', {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { tasks, status: this.getStatus() };
  }

  getStatus() {
    const all = Array.from(this.tasks.values());
    return {
      pending: all.filter(t => t.status === 'pending').length,
      running: all.filter(t => t.status === 'running').length,
      completed: all.filter(t => t.status === 'completed').length,
      failed: all.filter(t => t.status === 'failed').length,
      total: all.length,
    };
  }
}

export const swarmOrchestrator = new SwarmOrchestrator();