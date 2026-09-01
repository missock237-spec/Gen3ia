import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute } from "@/lib/api"
import { requireAdmin } from "@/lib/auth/guards"

/** Tableau de bord administrateur : statistiques globales, utilisateurs, audit. */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    await requireAdmin(req)

    const [users, agents, tasks, transactions, payments, documents, memories, apiKeys, auditLogs] =
      await Promise.all([
        db.user.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { id: true, email: true, name: true, role: true, plan: true, credits: true, createdAt: true },
        }),
        db.agent.count(),
        db.task.groupBy({ by: ["status"], _count: { status: true } }),
        db.transaction.aggregate({ _sum: { amount: true }, _count: { id: true } }),
        db.payment.aggregate({ _sum: { amount: true }, _count: { id: true } }),
        db.document.count(),
        db.memory.count(),
        db.apiKey.count(),
        db.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 60,
          select: { id: true, userId: true, action: true, entityType: true, entityId: true, detail: true, ip: true, createdAt: true },
        }),
      ])

    const totalCredits = users.reduce((acc, u) => acc + u.credits, 0)
    const taskCounts: Record<string, number> = {}
    for (const group of tasks) taskCounts[group.status] = group._count.status

    return Response.json({
      ok: true,
      stats: {
        users: users.length,
        agents,
        tasks: taskCounts,
        documents,
        memories,
        apiKeys,
        totalCredits,
        transactions: { count: transactions._count.id, volume: transactions._sum.amount ?? 0 },
        payments: { count: payments._count.id, volume: payments._sum.amount ?? 0 },
      },
      users,
      auditLogs,
    })
  })
}
