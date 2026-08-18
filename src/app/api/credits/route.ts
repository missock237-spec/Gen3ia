import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/with-auth';

// GET /api/credits — Solde et historique de crédits de l'utilisateur authentifié

export const dynamic = "force-dynamic";
export const GET = withAuth(async (request: NextRequest, ctx: { params?: Promise<any> }, auth) => {
  try {
    const [lastTx, history] = await Promise.all([
      db.credit.findFirst({
        where: [{ field: 'userId', op: '==', value: auth.userId }],
        orderBy: [{ field: 'updatedAt', direction: 'desc' }],
      }),
      db.creditTransaction.findMany({
        where: [{ field: 'userId', op: '==', value: auth.userId }],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: 50,
      }),
    ]);

    const totalSpent = history
      .filter(tx => tx.type === 'spend')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    return NextResponse.json({
      balance: lastTx?.balance ?? 0,
      totalSpent,
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
    console.error('GET /credits error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 30, windowMs: 60000 },
});
