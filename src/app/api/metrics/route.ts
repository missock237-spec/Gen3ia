/**
 * GET /api/metrics — Prometheus Metrics Endpoint
 * 
 * Exposes application metrics for Prometheus/Grafana scraping
 * 
 * Security:
 * - Protected by API key (METRICS_API_KEY env var)
 * - Or admin authentication
 * - Or localhost in development
 * 
 * Covers: agents, executions, credits, webhooks, errors, performance
 */

import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Verify access to metrics endpoint
 */
async function verifyMetricsAccess(request: NextRequest): Promise<boolean> {
  // Check API key
  const apiKey = request.headers.get("x-api-key");
  const expectedKey = process.env.METRICS_API_KEY;
  
  if (apiKey && expectedKey && apiKey === expectedKey) {
    return true;
  }

  // Check admin auth
  try {
    const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
    if (token && token.role === "admin") {
      return true;
    }
  } catch (e) {
    // Token verification failed
  }

  // Allow localhost in development
  if (process.env.NODE_ENV === "development") {
    const host = request.headers.get("host") || "";
    if (host.startsWith("127.0.0.1") || host.startsWith("localhost")) {
      return true;
    }
  }

  return false;
}

interface MetricsData {
  users: number;
  activeAgents: number;
  totalExecutions: number;
  totalCreditsUsed: number;
  activeSubscriptions: number;
  failedExecutions: number;
  avgExecutionTime: number;
  uptime: number;
  activeApiKeys: number;
  totalWebhooks: number;
  totalTerminalSessions: number;
  totalConversations: number;
  totalWorkflows: number;
  dbConnectionCount: number;
  executionByStatus: { status: string; count: number }[];
  creditsByPlan: { plan: string; total: number }[];
  recentErrors: number;
}

async function collectMetrics(): Promise<MetricsData> {
  const now = Date.now();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);
  const last1h = new Date(now - 3600000);

  const [
    users,
    activeAgents,
    totalExecutions,
    creditUsage,
    activeSubscriptions,
    failedExecutions,
    apiKeys,
    webhooks,
    terminalSessions,
    conversations,
    workflows,
    executions,
    allUsers,
    recentLogs,
  ] = await Promise.all([
    prisma.user.count({ where: [{ field: 'isActive', op: '==', value: true }] }),
    prisma.agent.count({ where: [{ field: 'status', op: '!=', value: 'inactive' }] }),
    prisma.agentExecution.count(),
    prisma.creditTransaction.aggregate({
      where: [{ field: 'type', op: '==', value: 'usage' }],
      _sum: { amount: true },
    }).catch(() => ({ _sum: { amount: 0 } })),
    prisma.subscription.count({ where: [{ field: 'status', op: '==', value: 'active' }] }).catch(() => 0),
    prisma.agentExecution.count({ where: [{ field: 'status', op: '==', value: 'failed' }] }).catch(() => 0),
    prisma.apiKey.count({ where: [] }).catch(() => 0),
    prisma.agentExecution.count({
      where: [{ field: 'createdAt', op: '>=', value: last24h }],
    }).catch(() => 0),
    prisma.agentExecution.count({
      where: [{ field: 'status', op: '==', value: 'running' }],
    }).catch(() => 0),
    prisma.conversation.count().catch(() => 0),
    prisma.workflow.count({ where: [{ field: 'status', op: '==', value: 'active' }] }).catch(() => 0),
    prisma.agentExecution.findMany().catch(() => []),
    prisma.user.findMany({ select: ['plan', 'credits'] }).catch(() => []),
    prisma.auditLog.findMany({
      where: [{ field: 'createdAt', op: '>=', value: last1h }],
      select: ['action', 'type'],
    }).catch(() => []),
  ]);

  // Erreurs récentes (1h) à partir des audit_logs
  const recentErrors = (recentLogs as Array<Record<string, unknown>>).filter((l) => {
    const a = String(l.action ?? l.type ?? '').toLowerCase();
    return a.includes('error') || a.includes('fail');
  }).length;

  // Exécutions par statut (groupement en mémoire)
  const statusCount: Record<string, number> = {};
  for (const e of executions as Array<Record<string, unknown>>) {
    const s = String(e.status ?? 'unknown');
    statusCount[s] = (statusCount[s] ?? 0) + 1;
  }
  const executionByStatus = Object.entries(statusCount).map(([status, count]) => ({ status, count }));

  // Crédits par plan (groupement en mémoire)
  const planCredits: Record<string, number> = {};
  for (const u of allUsers as Array<Record<string, unknown>>) {
    const p = String(u.plan ?? 'free');
    planCredits[p] = (planCredits[p] ?? 0) + Number(u.credits ?? 0);
  }
  const creditsByPlan = Object.entries(planCredits).map(([plan, total]) => ({ plan, total }));

  // Temps moyen d'exécution des 100 dernières terminées
  const recentExecs = await prisma.agentExecution.findMany({
    where: [
      { field: 'status', op: '==', value: 'completed' },
      { field: 'completedAt', op: '!=', value: null },
    ],
    orderBy: [{ field: 'createdAt', direction: 'desc' }],
    limit: 100,
    select: ['createdAt', 'completedAt'],
  }).catch(() => []);

  let avgExecutionTime = 0;
  if (recentExecs.length > 0) {
    const durations = (recentExecs as Array<Record<string, unknown>>)
      .filter(e => e.completedAt)
      .map(e => new Date(e.completedAt as string).getTime() - new Date(e.createdAt as string).getTime());
    avgExecutionTime = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
  }

  return {
    users,
    activeAgents,
    totalExecutions,
    totalCreditsUsed: Math.abs(creditUsage._sum?.amount ?? 0),
    activeSubscriptions,
    failedExecutions,
    avgExecutionTime,
    uptime: Math.floor(process.uptime()),
    activeApiKeys: apiKeys,
    totalWebhooks: webhooks,
    totalTerminalSessions: terminalSessions,
    totalConversations: conversations,
    totalWorkflows: workflows,
    dbConnectionCount: 0,
    executionByStatus,
    creditsByPlan,
    recentErrors,
  };
}

export async function GET(request: NextRequest) {
  try {
    // Verify access
    const hasAccess = await verifyMetricsAccess(request);
    if (!hasAccess) {
      logger.warn("Unauthorized metrics access attempt", {
        ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
        userAgent: request.headers.get("user-agent"),
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const m = await collectMetrics();

    const lines: string[] = [];
    const add = (help: string, type: string, name: string, value: number | string, labels?: string) => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
      lines.push(labels ? `${name}{${labels}} ${value}` : `${name} ${value}`);
      lines.push('');
    };

    // === Core metrics ===
    add("Nombre total d'utilisateurs actifs", 'gauge', 'gen3ia_users_total', m.users);
    add("Nombre d'agents actifs", 'gauge', 'gen3ia_active_agents_total', m.activeAgents);
    add("Nombre total d'exécutions", 'counter', 'gen3ia_executions_total', m.totalExecutions);
    add("Crédits totaux consommés", 'counter', 'gen3ia_credits_used_total', m.totalCreditsUsed);
    add("Abonnements actifs", 'gauge', 'gen3ia_active_subscriptions_total', m.activeSubscriptions);
    add("Exécutions échouées", 'counter', 'gen3ia_failed_executions_total', m.failedExecutions);
    add("Temps moyen d'exécution (ms)", 'gauge', 'gen3ia_avg_execution_time_ms', m.avgExecutionTime);
    add("Uptime du service en secondes", 'gauge', 'gen3ia_uptime_seconds', m.uptime);

    // === API & Auth ===
    add("Clés API actives", 'gauge', 'gen3ia_api_keys_total', m.activeApiKeys);
    add("Webhooks configurés", 'gauge', 'gen3ia_webhooks_total', m.totalWebhooks);

    // === Terminal & Chat ===
    add("Sessions terminal actives", 'gauge', 'gen3ia_terminal_sessions_total', m.totalTerminalSessions);
    add("Conversations totales", 'counter', 'gen3ia_conversations_total', m.totalConversations);
    add("Workflows actifs", 'gauge', 'gen3ia_workflows_total', m.totalWorkflows);

    // === Erreurs ===
    add("Erreurs récentes (1h)", 'counter', 'gen3ia_recent_errors_total', m.recentErrors);

    // === Exécutions par statut ===
    for (const es of m.executionByStatus) {
      add(`Exécutions avec statut ${es.status}`, 'gauge', 'gen3ia_executions_by_status', es.count, `status="${es.status}"`);
    }

    // === Crédits par plan ===
    for (const cp of m.creditsByPlan) {
      add(`Crédits pour le plan ${cp.plan}`, 'gauge', 'gen3ia_credits_by_plan', cp.total, `plan="${cp.plan}"`);
    }

    // === Timestamp de démarrage ===
    add("Timestamp de démarrage", 'gauge', 'gen3ia_start_time', Date.now() - m.uptime * 1000);

    logger.info("Metrics exported", {
      lines: lines.length,
      metrics: Object.keys(m).length,
    });

    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Metrics collection failed", { error, msg });
    
    return new NextResponse(
      '# ERROR Failed to collect metrics\n' + `# ${msg}`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
