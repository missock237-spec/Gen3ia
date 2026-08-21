// ============================================================
// GET /api/analytics — Analytics agrégés pour AnalyticsView
// ============================================================
//  Appelé par analytics-view.tsx via fetch('/api/analytics?period=30d')
//  Agrège les données de crédit et d'exécution en une seule réponse.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const userId = auth.userId;
  const period = request.nextUrl.searchParams.get('period') || '30d';

  // Calculate date range
  const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
  const days = daysMap[period] || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  try {
    // ============================================================
    // 1. Fetch credit transactions (for creditsUsed, totalCost)
    // ============================================================
    const transactions = await db.creditTransaction.findMany({ where: {} });
    const userTxns = (transactions as Record<string, unknown>[])
      .filter((t) => {
        if (t.userId !== userId) return false;
        const d = new Date(t.createdAt as string);
        return d >= startDate;
      });

    const creditsUsed = userTxns.reduce((sum, t) => {
      const amount = t.amount as number;
      return sum + (amount < 0 ? Math.abs(amount) : 0);
    }, 0);

    const totalCost = userTxns.reduce((sum, t) => {
      try {
        const meta = JSON.parse((t.metadata as string) || '{}');
        return sum + (meta.usdCost || 0);
      } catch {
        return sum;
      }
    }, 0);

    // ============================================================
    // 2. Fetch AI costs (for token counts, cost breakdown)
    // ============================================================
    let totalTokens = 0;
    let totalCalls = 0;
    let totalLatency = 0;
    try {
      const aiCosts = await db.aICost.findMany({
        where: [{ field: 'userId', op: '==', value: userId }],
      });
      for (const cost of aiCosts as Record<string, unknown>[]) {
        const d = new Date(cost.createdAt as string);
        if (d < startDate) continue;
        totalTokens += (cost.totalTokens as number) || 0;
        totalCalls += 1;
        totalLatency += (cost.latencyMs as number) || 0;
      }
    } catch {
      // Graceful: leave at 0
    }

    // ============================================================
    // 3. Fetch agent executions (for success rate, top agents)
    // ============================================================
    let successRate = 0;
    let topAgents: { name: string; executions: number }[] = [];
    let agentExecutions: Record<string, unknown>[] = [];

    try {
      const allExecs = await db.agentExecution.findMany({ where: {} });
      agentExecutions = allExecs.filter((e) => {
        const r = e as Record<string, unknown>;
        if (r.userId !== userId) return false;
        const d = new Date(r.createdAt as string);
        return d >= startDate;
      }) as Record<string, unknown>[];

      const completed = agentExecutions.filter(
        (e) => e.status === 'completed',
      ).length;
      const failed = agentExecutions.filter(
        (e) => e.status === 'failed',
      ).length;
      const total = completed + failed;
      successRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

      // Group by agent for top agents
      const agentCountMap = new Map<string, number>();
      for (const exec of agentExecutions) {
        const agentId = exec.agentId as string;
        if (!agentId) continue;
        agentCountMap.set(agentId, (agentCountMap.get(agentId) || 0) + 1);
      }

      // Fetch agent names
      if (agentCountMap.size > 0) {
        const agentIds = Array.from(agentCountMap.keys());
        const agents = await db.agent.findMany({
          where: [{ field: 'id', op: 'in', value: agentIds }],
        });
        const nameMap = new Map<string, string>();
        for (const a of agents as Record<string, unknown>[]) {
          nameMap.set(a.id as string, a.name as string);
        }

        topAgents = Array.from(agentCountMap.entries())
          .map(([id, count]) => ({
            name: nameMap.get(id) || id,
            executions: count,
          }))
          .sort((a, b) => b.executions - a.executions)
          .slice(0, 10);
      }
    } catch {
      // Graceful: empty arrays
    }

    // ============================================================
    // 4. Daily usage (from credit transactions)
    // ============================================================
    const usageByDay: { date: string; count: number }[] = [];
    const dayMap = new Map<string, number>();
    for (const t of userTxns) {
      const dateStr = new Date(t.createdAt as string).toISOString().split('T')[0];
      dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + 1);
    }
    for (let i = 0; i <= days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      usageByDay.push({ date: key, count: dayMap.get(key) || 0 });
    }

    // ============================================================
    // 5. Agent & task counts
    // ============================================================
    let totalAgents = 0;
    let totalTasks = 0;
    try {
      const agents = await db.agent.findMany({
        where: [{ field: 'userId', op: '==', value: userId }],
      });
      totalAgents = (agents as unknown[]).length;

      const tasks = await db.task.findMany({
        where: [{ field: 'userId', op: '==', value: userId }],
      });
      totalTasks = (tasks as unknown[]).length;
    } catch {
      // Graceful: leave at 0
    }

    // ============================================================
    // 6. Build response matching AnalyticsData interface
    // ============================================================
    const avgResponseTime = totalCalls > 0 ? totalLatency / totalCalls : 0;

    const data = {
      period,
      totalUsers: 1, // Single-user analytics (the current user)
      totalAgents,
      totalTasks,
      totalTokens,
      totalCost: Math.round(totalCost * 10000) / 10000, // 4 decimal places
      successRate,
      totalMessages: totalCalls,
      totalVoiceCalls: 0, // Not tracked yet
      avgResponseTime: Math.round(avgResponseTime),
      dailyActiveUsers: 1, // Single-user view
      topAgents,
      usageByDay,
    };

    const res = NextResponse.json(data);
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json({
      period,
      totalUsers: 0,
      totalAgents: 0,
      totalTasks: 0,
      totalTokens: 0,
      totalCost: 0,
      successRate: 0,
      totalMessages: 0,
      totalVoiceCalls: 0,
      avgResponseTime: 0,
      dailyActiveUsers: 0,
      topAgents: [],
      usageByDay: [],
    });
    return secureResponse(res, request);
  }
}
