import { prisma } from "@/lib/db";

interface HourlyStats {
  hour: number;
  count: number;
  success: number;
  failed: number;
}

interface RealtimeStats {
  period: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  totalCostUsd: number;
  executionsByHour: HourlyStats[];
  recentExecutions: Array<{ id: string; agentId: string; action: string; status: string; createdAt: Date }>;
}

export class DashboardService {
  async getRealtimeStats(userId: string, hours = 24): Promise<RealtimeStats> {
    const since = new Date(Date.now() - hours * 3600000);
    const [execs, recent] = await Promise.all([
      prisma.agentActionLog.findMany({ where: { userId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 1000 }),
      prisma.agentActionLog.findMany({ where: { userId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, agentId: true, action: true, status: true, createdAt: true } }),
    ]);

    const total = execs.length;
    const successful = execs.filter((e) => e.status === "completed").length;
    const failed = execs.filter((e) => e.status === "failed").length;

    const hourlyMap = new Map<number, HourlyStats>();
    for (let i = 0; i < 24; i++) hourlyMap.set(i, { hour: i, count: 0, success: 0, failed: 0 });

    for (const log of execs) {
      const hr = new Date(log.createdAt).getHours();
      const entry = hourlyMap.get(hr);
      if (entry) { entry.count++; if (log.status === "completed") entry.success++; else if (log.status === "failed") entry.failed++; }
    }

    return {
      period: `${hours}h`, totalExecutions: total, successfulExecutions: successful, failedExecutions: failed,
      successRate: total > 0 ? (successful / total) * 100 : 0, totalCostUsd: total * 0.002,
      executionsByHour: Array.from(hourlyMap.values()), recentExecutions: recent,
    };
  }

  async getUserStats(userId: string) {
    const [agentCount, activeCount, totalExecutions] = await Promise.all([
      prisma.agent.count({ where: { userId } }),
      prisma.agent.count({ where: { userId, status: "active" } }),
      prisma.agentActionLog.count({ where: { userId } }),
    ]);
    return { agentCount, activeCount, totalExecutions };
  }
}

export const dashboardService = new DashboardService();
