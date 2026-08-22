// ============================================================
// GET /api/admin/supervision — Dashboard admin temps réel
// ============================================================
//  Interface d'administration pour superviser tous les agents
//  en cours, voir les logs en direct, et forcer l'arrêt d'un
//  agent défaillant.
//
//  SÉCURITÉ (hardened) :
//  - Layer 1 (middleware) : exige un session cookie + payload role=admin
//    (Edge-only, vérif crypto reportée en Layer 2)
//  - Layer 2 (cette route) : applySecurity() appelle
//    getAdminAuth().verifySessionCookie(sessionCookie, true) — vérif
//    cryptographique Firebase + custom claims réels (pas forgeables).
//  - Aucune donnée n'est retournée sans rôle admin vérifié côté serveur.
//
//  BUGFIX (migration Firestore) : la façade ne supporte pas les
//  relations imbriquées Prisma (`select: { executions: {...} }` est
//  ignoré — les agents arrivaient SANS `executions` et la route
//  crashait sur `agent.executions[0]` → 500 systématique).
//  Les exécutions récentes sont désormais chargées en UNE requête
//  puis jointes en mémoire par agentId.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applySecurity } from "@/lib/security";

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

/** Ligne d'exécution telle que retournée par la façade Firestore. */
type ExecutionRow = {
  id: string;
  agentId?: string;
  status?: string;
  estimatedCost?: number;
  error?: string | null;
  createdAt?: Date | string;
};

function toDate(value: Date | string | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  // Layer 2 — vérification cryptographique Firebase (server runtime).
  // Le middleware Edge ne peut que décoder le JWT sans vérifier la signature
  // (firebase-admin n'est pas Edge-safe) ; on doit donc re-valider ici.
  // applySecurity() appelle getAdminAuth().verifySessionCookie(sessionCookie, true)
  // qui vérifie signature + expiration + révocation via Firebase Admin SDK.
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    requireRole: "admin",
  });
  if (secError || !auth) {
    return (
      secError ||
      NextResponse.json(
        { success: false, error: "Accès réservé aux administrateurs" },
        { status: 403 },
      )
    );
  }

  try {
    const [
      activeExecutions,
      agents,
      recentExecutions,
      supervisorLogs,
      pendingApprovalsCount,
      stats,
    ] = await Promise.all([
      // Exécutions en cours
      prisma.agentExecution.count({ where: { status: "running" } }),

      // Agents récents (documents complets — la façade ignore les
      // projections avec relations imbriquées, on projette en mémoire)
      prisma.agent.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      }),

      // Exécutions récentes globales — UNE requête, jointure mémoire ensuite
      // (remplace la relation imbriquée Prisma `executions: { take: 100 }`)
      prisma.agentExecution.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
      }),

      // Derniers logs supervisor
      prisma.supervisorLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      }),

      // Approbations en attente
      prisma.approvalRequest.count({ where: { status: "pending" } }),

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
        totalCost: costAgg?._sum?.estimatedCost ?? 0,
        activeSubscriptions,
        runningExecutions: runningExecs,
      })),
    ]);

    // Jointure mémoire : groupe les exécutions par agentId (déjà triées desc)
    const execsByAgent = new Map<string, ExecutionRow[]>();
    for (const exec of recentExecutions as ExecutionRow[]) {
      if (!exec.agentId) continue;
      const list = execsByAgent.get(exec.agentId) ?? [];
      list.push(exec);
      execsByAgent.set(exec.agentId, list);
    }

    // Transformer les agents avec leurs dernières stats
    const agentData = (agents as Array<Record<string, unknown>>).map((agent) => {
      const execs = execsByAgent.get(agent.id as string) ?? [];
      const lastExec = execs[0];
      const lastExecDate = toDate(lastExec?.createdAt);
      return {
        id: agent.id as string,
        name: (agent.name as string) ?? "Agent",
        status: (agent.status as string) ?? "unknown",
        userId: String(agent.userId ?? "").slice(0, 8),
        lastExecution: lastExecDate ? lastExecDate.toISOString() : null,
        // Note : limité aux 500 exécutions les plus récentes de la plateforme
        totalExecutions: execs.length,
        totalCost: execs.reduce((s, e) => s + (e.estimatedCost ?? 0), 0),
      };
    });

    // Erreurs récentes (extraites des exécutions déjà chargées — 1 requête de moins)
    const recentErrors = (recentExecutions as ExecutionRow[])
      .filter((e) => e.status === "failed")
      .slice(0, 20)
      .map((e) => ({
        id: e.id,
        agentId: e.agentId ?? "",
        error: e.error ?? null,
        createdAt: toDate(e.createdAt) ?? new Date(0),
      }));

    const data: SupervisionData = {
      activeExecutions,
      agents: agentData,
      supervisorLogs: supervisorLogs as SupervisionData["supervisorLogs"],
      pendingApprovals: pendingApprovalsCount,
      recentErrors,
      stats,
    };

    logger.info("admin_supervision_fetched", {
      adminId: auth.userId,
      agentsCount: agents.length,
      activeExecs: activeExecutions,
      pendingApprovals: pendingApprovalsCount,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error("admin_supervision_error", {
      adminId: auth.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Erreur lors de la récupération des données" },
      { status: 500 },
    );
  }
}
