// ============================================================
// GET /api/metrics — Métriques Prometheus
// ============================================================
// Utilise prom-client (déjà installé) pour exposer les métriques
// ============================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface MetricsData {
  users: number;
  activeAgents: number;
  totalExecutions: number;
  totalCreditsUsed: number;
  activeSubscriptions: number;
  uptime: number;
}

async function collectMetrics(): Promise<MetricsData> {
  const [
    users,
    activeAgents,
    totalExecutions,
    creditSum,
    activeSubscriptions,
  ] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.agent.count({ where: { status: { not: "inactive" } } }),
    prisma.agentExecution.count(),
    prisma.creditTransaction.aggregate({
      where: { type: "usage" },
      _sum: { amount: true },
    }),
    prisma.subscription.count({ where: { status: "active" } }),
  ]);

  return {
    users,
    activeAgents,
    totalExecutions,
    totalCreditsUsed: Math.abs(creditSum._sum.amount ?? 0),
    activeSubscriptions,
    uptime: Math.floor(process.uptime()),
  };
}

export async function GET() {
  try {
    const metrics = await collectMetrics();

    // Format Prometheus (texte simple)
    const prometheusMetrics = [
      "# HELP genova_users_total Nombre total d'utilisateurs actifs",
      "# TYPE genova_users_total gauge",
      `genova_users_total ${metrics.users}`,
      "",
      "# HELP genova_active_agents_total Nombre d'agents actifs",
      "# TYPE genova_active_agents_total gauge",
      `genova_active_agents_total ${metrics.activeAgents}`,
      "",
      "# HELP genova_executions_total Nombre total d'exécutions",
      "# TYPE genova_executions_total counter",
      `genova_executions_total ${metrics.totalExecutions}`,
      "",
      "# HELP genova_credits_used_total Crédits totaux consommés",
      "# TYPE genova_credits_used_total counter",
      `genova_credits_used_total ${metrics.totalCreditsUsed}`,
      "",
      "# HELP genova_active_subscriptions_total Abonnements actifs",
      "# TYPE genova_active_subscriptions_total gauge",
      `genova_active_subscriptions_total ${metrics.activeSubscriptions}`,
      "",
      "# HELP genova_uptime_seconds Uptime du service en secondes",
      "# TYPE genova_uptime_seconds gauge",
      `genova_uptime_seconds ${metrics.uptime}`,
      "",
      "# HELP genova_start_time Timestamp de démarrage",
      "# TYPE genova_start_time gauge",
      `genova_start_time ${Date.now() - metrics.uptime * 1000}`,
    ].join("\n");

    return new NextResponse(prometheusMetrics, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    return new NextResponse(
      "# ERROR Failed to collect metrics",
      { status: 500, headers: { "Content-Type": "text/plain" } },
    );
  }
}