import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export class AgentScheduler {
// @ts-ignore
  constructor() { this.interval = null; }

// @ts-ignore
  start() { if (!this.interval) { this.interval = setInterval(() => this.check(), 60000); logger.info("Scheduler started"); } }
// @ts-ignore
  stop() { if (this.interval) { clearInterval(this.interval); this.interval = null; } }

  async schedule(input) {
    const freq = input.frequency || "daily";
    const map = { once: "once", hourly: "0 * * * *", daily: "0 8 * * *", weekly: "0 8 * * 1", monthly: "0 8 1 * *", custom: input.cronExpression || "0 8 * * *" };
    const task = await prisma.scheduledTask.create({
      data: { name: input.name, description: input.description || "", schedule: map[freq], timezone: input.timezone || "UTC", status: "active", nextRun: map[freq] === "once" ? new Date(Date.now() + 60000) : new Date(Date.now() + 86400000), payload: JSON.stringify(input.payload || {}), userId: input.userId, agentId: input.agentId },
    });
    return { id: task.id, nextRun: task.nextRun };
  }

  async unschedule(taskId) { await prisma.scheduledTask.update({ where: { id: taskId }, data: { status: "cancelled" } }); }
  async listByUser(userId) { return prisma.scheduledTask.findMany({ where: { userId }, orderBy: { nextRun: "asc" }, include: { agent: { select: { id: true, name: true, type: true } } } }); }

  async check() {
    try {
      const tasks = await prisma.scheduledTask.findMany({ where: { status: "active", nextRun: { lte: new Date() } } });
      for (const t of tasks) {
        logger.info("Exec scheduled", { taskId: t.id });
        await prisma.agentActionLog.create({ data: { agentId: t.agentId || "", action: "scheduled", details: t.payload, status: "running", userId: t.userId } });
        const next = t.schedule === "once" ? null : new Date(Date.now() + 86400000);
        await prisma.scheduledTask.update({ where: { id: t.id }, data: { lastRun: new Date(), runCount: { increment: 1 }, nextRun: next, status: next ? "active" : "completed" } });
      }
    } catch (e) { logger.error("Scheduler error", { error: e instanceof Error ? e.message : "unknown" }); }
  }
}
export const agentScheduler = new AgentScheduler();