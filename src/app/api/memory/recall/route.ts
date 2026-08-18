// POST /api/memory/recall — Rappel de memoires d'un agent
// SECURITE: withAuth() + correction IDOR (userId du token, pas du body) + rate limit
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type RouteParams } from '@/lib/with-auth';

export const dynamic = "force-dynamic";
export const POST = withAuth(async (r: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const b = await r.json();
    const { query, category } = b;
    if (!query) return NextResponse.json({ error: 'query requis' }, { status: 400 });

    // SECURITY: userId vient du token, jamais du body (previent IDOR)
    const memories = await db.agentMemory.findMany({
      where: { userId: auth.userId, ...(category ? { category } : {}), content: { contains: query, mode: 'insensitive' } },
      orderBy: { relevance: 'desc' },
      take: 10,
    });
    return NextResponse.json(memories);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 30, windowMs: 60000 },
});
