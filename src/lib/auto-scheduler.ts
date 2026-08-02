import { db } from "./db";
import { logger } from "./logger";
import { getAgentQueue } from "./bullmq";

export type TriggerType = "schedule" | "event" | "webhook" | "instant";
export type ScheduleFrequency = "every_minute" | "every_5_minutes" | "every_15_minutes" | "every_hour" | "every_6_hours" | "every_day" | "every_week" | "custom_cron";

const INPUT_TEMPLATES: Record<string, string> = {
  daily_report: "Genere un rapport quotidien des activites.",
  weekly_summary: "Resume les evenements importants de la semaine.",
  monitor_system: "Verifie l'etat du systeme et signale les anomalies.",
};

const FREQ_TO_CRON: Record<string, string> = {
  every_minute: "* * * * *",
  every_5_minutes: "*/5 * * * *",
  every_15_minutes: "*/15 * * * *",
  every_hour: "0 * * * *",
  every_6_hours: "0 */6 * * *",
  every_day: "0 6 * * *",
  every_week: "0 6 * * 1",
};

class AutoScheduler {
  private intervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private isRunning = false;

  // Lazy init — do not connect to DB or Redis at build time
  async start(): Promise<void> {
    if (this.isRunning) return;
    if (process.env.NEXT_PHASE === 'phase-production-build') return;
    this.isRunning = true;
    logger.info("auto_scheduler_started");
    await this.scheduleAllAgents();
  }

  stop(): void {
    this.isRunning = false;
    for (const [, interval] of this.intervals) clearInterval(interval);
    this.intervals.clear();
    logger.info("auto_scheduler_stopped");
  }

  async scheduleAllAgents(): Promise<void> {
    const agents = await db.agent.findMany({
      where: { status: { not: "inactive" }, type: { in: ["assistant", "analyst", "whatsapp", "custom"] } },
      include: { user: { select: { plan: true, credits: true } } },
    });
    logger.info("auto_scheduler_agents_found", { count: agents.length });
    for (const agent of agents) await this.scheduleAgent(agent);
  }

  async scheduleAgent(agent: { id: string; name: string; type: string; config: string; userId: string; user?: { plan: string; credits: number } }): Promise<void> {
    let cfg: any = null;
    try { const p = JSON.parse(agent.config); if (p.autoExecute) cfg = p.autoExecute; } catch { return; }
    if (!cfg || !cfg.isActive) return;
    if (agent.user && agent.user.credits < 10) { logger.warn("auto_no_credits", { agentId: agent.id }); return; }
    if (agent.user && agent.user.plan === "free") {
      const today = await db.agentExecution.count({ where: { agentId: agent.id, createdAt: { gte: new Date(Date.now() - 86400000) } } });
      if (today >= 1) return;
    }
    switch (cfg.trigger) {
      case "schedule": if (cfg.schedule) this.scheduleCron(agent.id, agent.userId, cfg, cfg.cronExpression); break;
      case "instant": await this.executeNow(agent.id, agent.userId, cfg); break;
    }
  }

  private scheduleCron(agentId: string, userId: string, config: any, customCron?: string): void {
    const cron = config.schedule === "custom_cron" ? (customCron ?? "0 6 * * *") : (FREQ_TO_CRON[config.schedule] ?? "0 6 * * *");
    const ms = this.cronToInterval(cron); if (ms <= 0) return;
    const key = `agent:${agentId}`;
    if (this.intervals.has(key)) clearInterval(this.intervals.get(key)!);
    const interval = setInterval(async () => { try { await this.executeNow(agentId, userId, config); } catch {} }, ms);
    this.intervals.set(key, interval);
    logger.info("auto_scheduled", { agentId, cron, intervalMs: ms });
  }

  private async executeNow(agentId: string, userId: string, config: any): Promise<void> {
    if (config.cooldownMinutes > 0) {
      const last = await db.agentExecution.findFirst({ where: { agentId, status: "completed" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      if (last && Date.now() - last.createdAt.getTime() < config.cooldownMinutes * 60000) return;
    }
    await getAgentQueue().add("auto-execution", { agentId, userId, input: config.input ?? INPUT_TEMPLATES.daily_report, sessionId: `auto_${agentId}_${Date.now()}`, auto: true });
    logger.info("auto_queued", { agentId });
  }

  private cronToInterval(cron: string): number {
    const p = cron.split(" ");
    if (p.length < 5) return 0;
    if (p[0] === "*") return 60000;
    if ((p[0] as string).startsWith("*/")) return parseInt((p[0] as string).slice(2)) * 60000;
    if (p[0] === "0" && p[1] === "*") return 3600000;
    if (p[0] === "0" && p[1] === "6") return 86400000;
    return 3600000;
  }
}

export const autoScheduler = new AutoScheduler();