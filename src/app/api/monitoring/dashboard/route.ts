// ============================================================
// GET /api/monitoring/dashboard — Tableau de bord temps reel
// ============================================================
// Metriques business : temps d'execution, couts, taux de succes,
// files d'attente, erreurs, alertes
// ============================================================
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const lastHour = new Date(now.getTime() - 3600000);
    const lastDay = new Date(now.getTime() - 86400000);

    const [totalExecs, hourlyExecs, dailyExecs, failedExecs, avgDuration, totalCost, queueStatus, agentsByType] = await Promise.all([
      prisma.agentExecution.count(),
      prisma.agentExecution.count({ where: { createdAt: { gte: lastHour } } }),
      prisma.agentExecution.count({ where: { createdAt: { gte: lastDay } } }),
      prisma.agentExecution.count({ where: { status: "failed", createdAt: { gte: lastHour } } }),
      prisma.agentExecution.aggregate({ _avg: { totalDuration: true }, where: { status: "completed" } }),
      prisma.agentExecution.aggregate({ _sum: { estimatedCost: true }, where: { createdAt: { gte: lastDay } } }),
      prisma.agentExecution.groupBy({ by: ["status"], _count: true }),
      prisma.agent.groupBy({ by: ["type"], _count: true }),
    ]);

    const successRate = dailyExecs > 0 ? ((dailyExecs - failedExecs) / dailyExecs * 100).toFixed(1) : "100";

    return NextResponse.json({
      timestamp: now.toISOString(),
      metrics: {
        totalExecutions: totalExecs,
        executionsLastHour: hourlyExecs,
        executionsLastDay: dailyExecs,
        failedLastHour: failedExecs,
        successRate: `${successRate}%`,
        avgDurationMs: Math.round(avgDuration._avg.totalDuration ?? 0),
        costLastDay: (totalCost._sum.estimatedCost ?? 0).toFixed(4),
      },
      queue: Object.fromEntries(queueStatus.map((s: any) => [s.status, s._count])),
      agentsByType: Object.fromEntries(agentsByType.map((a: any) => [a.type, a._count])),
    });
  } catch (error) {
    logger.error("monitoring_dashboard_error", { error: String(error) });
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}