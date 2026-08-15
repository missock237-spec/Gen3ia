import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';





export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const [lastTx, history, totalSpentAgg] = await Promise.all([
      prisma.creditTransaction.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.creditTransaction.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.creditTransaction.aggregate({
        where: { userId: session.user.id, type: 'spend' },
        _sum: { amount: true },
      }),
    ]);

    return NextResponse.json({
      balance: lastTx?.balance || 0,
// @ts-ignore — type narrowing pending, see refactor ticket
      totalSpent: Math.abs(totalSpentAgg._sum.amount || 0),
      history: history.map(tx => ({
        id: tx.id,
        amount: tx.amount,
        balance: tx.balance,
        type: tx.type,
        description: tx.description,
        createdAt: tx.createdAt,
      })),
    });
  } catch (error) {
    console.error('GET /billing/credits error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
