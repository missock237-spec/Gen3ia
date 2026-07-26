// ============================================================
// Credit API — Interrogation du solde et historique des crédits
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getCreditEngine } from '@/lib/billing/credit-engine';
import { getAuthenticatedUser } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'balance';
    const engine = getCreditEngine();

    switch (action) {
      case 'balance': {
        const balance = await engine.getUserBalance(user.userId);
        const userProfile = await db.user.findUnique({
          where: { id: user.userId },
          select: { plan: true },
        });
        return NextResponse.json({
          balance,
          plan: userProfile?.plan || 'free',
        });
      }

      case 'history': {
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
        const skip = (page - 1) * limit;

        const [transactions, total] = await Promise.all([
          db.creditTransaction.findMany({
            where: { userId: user.userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip,
          }),
          db.creditTransaction.count({ where: { userId: user.userId } }),
        ]);

        return NextResponse.json({
          transactions,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      }

      case 'usage-today': {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [totalSpent, callCount] = await Promise.all([
          db.creditTransaction.aggregate({
            where: {
              userId: user.userId,
              type: 'debit',
              createdAt: { gte: today },
            },
            _sum: { amount: true },
          }),
          db.creditTransaction.count({
            where: {
              userId: user.userId,
              type: 'debit',
              createdAt: { gte: today },
            },
          }),
        ]);

        return NextResponse.json({
          creditsUsedToday: Math.abs(totalSpent._sum.amount || 0),
          transactionsToday: callCount,
        });
      }

      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
