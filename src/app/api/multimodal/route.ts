// GET/POST /api/multimodal — Sessions multimodales
// SECURITE: withAuth() + correction IDOR (userId du token, pas du body)
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/with-auth';

// GET — Sessions de l'utilisateur authentifié
export const GET = withAuth(async (r: NextRequest, ctx: { params?: Promise<any> }, auth) => {
  try {
    const s = await db.multimodalSession.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return NextResponse.json(s);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 50, windowMs: 60000 },
});

// POST — Créer une session (userId du token, jamais du body)
export const POST = withAuth(async (r: NextRequest, ctx: { params?: Promise<any> }, auth) => {
  try {
    const b = await r.json();
    const { type } = b;
    // SECURITY: userId vient du token authentifié — JAMAIS du body (prévient IDOR)
    if (!type) return NextResponse.json({ error: 'Type requis' }, { status: 400 });

    const s = await db.multimodalSession.create({ data: { userId: auth.userId, type, status: 'active' } });
    return NextResponse.json(s, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 20, windowMs: 60000 },
});
