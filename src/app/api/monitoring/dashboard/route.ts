// ============================================================
// MONITORING DASHBOARD — Métriques en temps réel
// ============================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalUsers,
      totalAgents,
      activeAgents,
      totalExecutions,
      todayExecutions,
      totalWorkflows,
      activeWorkflows,
      recentErrors,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.agent.count(),
      prisma.agent.count({ where: { status: "active" } }),
      prisma.agentExecution.count(),
      prisma.agentExecution.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.workflow.count(),
      prisma.workflow.count({ where: { status: "active" } }),
      prisma.monitoringEvent.findMany({
        where: { severity: { in: ["error", "critical"] }, resolved: false },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        users: { total: totalUsers },
        agents: { total: totalAgents, active: activeAgents },
        executions: { total: totalExecutions, today: todayExecutions },
        workflows: { total: totalWorkflows, active: activeWorkflows },
        errors: { unresolved: recentErrors.length, recent: recentErrors },
        timestamp: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("Dashboard monitoring error:", error);
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des métriques" },
      { status: 500 }
    );
  }
}