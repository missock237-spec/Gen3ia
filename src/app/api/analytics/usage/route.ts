// GET /api/analytics/usage — Historique d'usage quotidien
// SECURITE: withAuth() + OWNERSHIP (accès aux données de l'utilisateur authentifié)
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/with-auth';





export const dynamic = "force-dynamic";
export const GET = withAuth(async (request: NextRequest, ctx: { params?: Promise<any> }, auth) => {
  try {
    // Utiliser auth.userId du token — jamais d'un paramètre client
    const usage = await db.usageDaily.findMany({
      where: { userId: auth.userId },
      orderBy: { date: 'desc' },
      take: 30,
    });
    return NextResponse.json(usage);
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 50, windowMs: 60000 },
});
