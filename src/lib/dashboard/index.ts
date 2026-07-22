import { prisma } from "@/lib/db";

export class DashboardService {
  async getRealtimeStats(userId, hours = 24) {
    const since = new Date(Date.now() - hours * 3600000);
    const [execs, recent] = await Promise.all([
      prisma.agentActionLog.findMany({ where: { userId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 1000 }),
      prisma.agentActionLog.findMany({ where: { userId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, agentId: true, action: true, status: true, createdAt: true } }),
    ]);
    const total = execs.length;
    const successful = execs.filter(e => e.status === "completed").length;
    const failed = execs.filter(e => e.status === "failed").length;
    const hourly = {};
    for (let i = 0; i < 24; i++) hourly[i] = { hour: i, count: 0, success: 0, failed: 0 };
    for (const l of execs) { const hr = new Date(l.createdAt).getHours(); if (hourly[hr]) { hourly[hr].count++; if (l.status === "completed") hourly[hr].success++; else if (l.status === "failed") hourly[hr].failed++; } }
    return { period: hours + "h", totalExecutions: total, successfulExecutions: successful, failedExecutions: failed, successRate: total > 0 ? (successful / total) * 100 : 0, totalCostUsd: total * 0.002, executionsByHour: Object.values(hourly), recentExecutions: recent };
  }
}
export const dashboardService = new DashboardService();
