// GET/DELETE /api/conversations/[id]
// SECURITE: withAuth() + ownership (ne permet l'acces qu'a la conversation de l'utilisateur)
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type RouteParams } from '@/lib/with-auth';

export const GET = withAuth(async (r: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const params = ctx.params ? await ctx.params : {};
    const id = typeof params['id'] === 'string' ? params['id'] : '';
    if (!id) return NextResponse.json({ error: 'Conversation id manquant' }, { status: 400 });

    // SECURITY: ownership — la conversation doit appartenir a auth.userId
    const conv = await db.conversation.findFirst({
      where: { id, userId: auth.userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conv) return NextResponse.json({ error: 'Conversation non trouvée' }, { status: 404 });
    return NextResponse.json(conv);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 60, windowMs: 60000 },
});

export const DELETE = withAuth(async (r: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const params = ctx.params ? await ctx.params : {};
    const id = typeof params['id'] === 'string' ? params['id'] : '';
    if (!id) return NextResponse.json({ error: 'Conversation id manquant' }, { status: 400 });

    // SECURITY: ownership avant suppression
    const conv = await db.conversation.findFirst({ where: { id, userId: auth.userId }, select: { id: true } });
    if (!conv) return NextResponse.json({ error: 'Conversation non trouvée' }, { status: 404 });

    await db.conversation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 20, windowMs: 60000 },
});
