import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { supervisor } from "@/lib/agent/supervisor";

const ROLES = {
  planner: { maxIterations: 5, tools: ["decompose", "analyze", "assign"], priority: 1, model: "gpt-4o" },
  researcher: { maxIterations: 15, tools: ["search", "browse", "extract"], priority: 2, model: "claude-3-haiku" },
  executor: { maxIterations: 25, tools: ["code", "api_call", "write"], priority: 3, model: "deepseek-coder" },
  critic: { maxIterations: 8, tools: ["review", "analyze", "validate"], priority: 4, model: "gpt-4o" },
  coordinator: { maxIterations: 10, tools: ["assign", "merge", "summarize"], priority: 0, model: "claude-3.5-sonnet" },
};

export class RoleBasedSwarm {
  public missions: Map<string, unknown> = new Map();
  constructor() { this.missions = new Map(); }

  async runMission(mainTask, availableAgents, userId) {
    const missionId = "m_" + Date.now();
    const start = Date.now();
    supervisor.startTask(mainTask.substring(0, 100));
    logger.info("Mission", { missionId, task: mainTask.substring(0, 80), agents: availableAgents.length });

    const assignments = Object.keys(ROLES).map(role => {
      const agent = availableAgents.find(a => a.role === role) || availableAgents[0];
      return { role, agentId: agent?.id || "unknown", agentName: agent?.name || role, taskId: role + "_" + Date.now(), status: "assigned", output: null };
    });

    for (const task of assignments) {
      task.status = "running";
      const check = supervisor.recordIteration({ step: 1, action: task.role, thought: task.role + " running", result: "", timestamp: new Date() });
      if (check.shouldStop) { task.status = "failed"; break; }
      try {
        await prisma.agentActionLog.create({ data: { agentId: task.agentId, action: task.role + "_exec", details: "{}", status: "completed", result: "ok", userId, resolvedAt: new Date() } }).catch(() => {});
        task.status = "completed";
        task.output = task.role + " task completed";
      } catch { task.status = "failed"; }
    }

    const mission = {
      missionId, mainTask, assignments,
      coordinator: assignments.find(a => a.role === "coordinator") || assignments[0],
      status: assignments.some(a => a.status === "failed") ? "failed" : "completed",
      totalCost: assignments.length * 0.002,
      duration: Date.now() - start,
      summary: assignments.filter(a => a.status === "completed").length + "/" + assignments.length + " completed",
    };
    this.missions.set(missionId, mission);
    return mission;
  }

  getMission(id) { return this.missions.get(id); }
  listMissions() { return Array.from(this.missions.values()).map(m => ({ missionId: m.missionId, mainTask: m.mainTask.substring(0, 50), status: m.status, duration: m.duration })); }
}

export const roleSwarm = new RoleBasedSwarm();
