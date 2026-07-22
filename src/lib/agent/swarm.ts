import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { supervisor } from "./supervisor";

export class SwarmOrchestrator {
  constructor() { this.tasks = new Map(); }

  async orchestrate(mainTask, agentIds, userId) {
    supervisor.startTask(mainTask.substring(0, 100));
    logger.info("Swarm", { task: mainTask.substring(0, 80), agents: agentIds.length });
    const types = ["research", "analyze", "generate", "review", "execute"];
    const tasks = agentIds.map((agentId, i) => {
      const t = { id: "t_" + Date.now() + "_" + i, type: types[i % 5], description: mainTask.substring(0, 200), agentId, status: "pending", priority: 5 - i };
      this.tasks.set(t.id, t);
      return t;
    });
    for (const task of tasks) {
      task.status = "running";
      const agent = await prisma.agent.findUnique({ where: { id: task.agentId } });
      if (!agent) { task.status = "failed"; continue; }
      const check = supervisor.recordIteration({ step: 1, action: task.type, thought: task.description, result: "", timestamp: new Date() });
      if (check.shouldStop) { logger.warn("Swarm stop", { reason: check.reason }); break; }
      try {
        task.result = { taskId: task.id, type: task.type, executedBy: task.agentId, status: "ok" };
        task.status = "completed";
        await prisma.agentActionLog.create({ data: { agentId: task.agentId, action: task.type, details: JSON.stringify(task), status: "completed", result: JSON.stringify(task.result), userId, resolvedAt: new Date() } });
      } catch (e) { task.status = "failed"; logger.error("Swarm fail", { error: e.message || "unknown" }); }
    }
    return tasks;
  }

  getStatus() {
    const all = Array.from(this.tasks.values());
    return { pending: all.filter(t => t.status === "pending").length, running: all.filter(t => t.status === "running").length, completed: all.filter(t => t.status === "completed").length, failed: all.filter(t => t.status === "failed").length };
  }
}

export const swarmOrchestrator = new SwarmOrchestrator();
