// ============================================================
// GET /api/admin/supervision — Dashboard admin temps réel
// ============================================================
// Interface d'administration pour superviser tous les agents
// en cours, voir les logs en direct, et forcer l'arrêt d'un
// agent défaillant.
// ============================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";





export const dynamic = "force-dynamic";
interface SupervisionData {
  activeExecutions: number;
  agents: Array<{
    id: string;
    name: string;
    status: string;
    userId: string;
    lastExecution: string | null;
    totalExecutions: number;
    totalCost: number;
  }>;
  supervisorLogs: Array<{
    id: string;
    agentId: string;
    sessionId: string;
    iteration: number;
    status: string;
    decision: string | null;
    reason: string | null;
    currentCost: number;
    createdAt: Date;
  }>;
  pendingApprovals: number;
  recentErrors: Array<{
    id: string;
    agentId: string;
    error: string | null;
    createdAt: Date;
  }>;
  stats: {
    totalUsers: number;
    totalAgents: number;
    totalExecutions: number;
    totalCost: number;
    activeSubscriptions: number;
    runningExecutions: number;
  };
}

export async function GET() {
  try {
    const [
      activeExecutions,
      agents,
      supervisorLogs,
      pendingApprovalsCount,
      recentErrors,
      stats,
    ] = await Promise.all([
      // Exécutions en cours
      prisma.agentExecution.count({ where: { status: "running" } }),

      // Tous les agents avec leurs stats
      prisma.agent.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          userId: true,
          executions: {
            select: { status: true, estimatedCost: true, createdAt: true, error: true },
            orderBy: { createdAt: "desc" },
            take: 100,
          },
        },
        take: 50,
      }),

      // Derniers logs supervisor
      prisma.supervisorLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      }),

      // Approbations en attente
      prisma.approvalRequest.count({ where: { status: "pending" } }),

      // Erreurs récentes
      prisma.agentExecution.findMany({
        where: { status: "failed" },
        orderBy: { createdAt: "desc" },
        select: { id: true, agentId: true, error: true, createdAt: true },
        take: 20,
      }),

      // Stats globales
      Promise.all([
        prisma.user.count(),
        prisma.agent.count(),
        prisma.agentExecution.count(),
        prisma.agentExecution.aggregate({ _sum: { estimatedCost: true } }),
        prisma.subscription.count({ where: { status: "active" } }),
        prisma.agentExecution.count({ where: { status: "running" } }),
      ]).then(([totalUsers, totalAgents, totalExecutions, costAgg, activeSubscriptions, runningExecs]) => ({
        totalUsers,
        totalAgents,
        totalExecutions,
        totalCost: costAgg._sum.estimatedCost ?? 0,
        activeSubscriptions,
        runningExecutions: runningExecs,
      })),
    ]);

    // Transformer les agents avec leurs dernières stats
    const agentData = agents.map((agent) => {
      const lastExec = agent.executions[0];
      return {
        id: agent.id,
        name: agent.name,
        status: agent.status,
        userId: agent.userId.slice(0, 8),
        lastExecution: lastExec?.createdAt.toISOString() ?? null,
        totalExecutions: agent.executions.length,
        totalCost: agent.executions.reduce((s, e) => s + (e.estimatedCost ?? 0), 0),
      };
    });

    const data: SupervisionData = {
      activeExecutions,
      agents: agentData,
      supervisorLogs,
      pendingApprovals: pendingApprovalsCount,
      recentErrors,
      stats,
    };

    logger.info("admin_supervision_fetched", {
      agentsCount: agents.length,
      activeExecs: activeExecutions,
      pendingApprovals: pendingApprovalsCount,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error("admin_supervision_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des données" },
      { status: 500 },
    );
  }
}
