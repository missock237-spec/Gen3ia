import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/with-auth';

// GET /api/conversations — Liste des conversations de l'utilisateur authentifié
export const GET = withAuth(async (request: NextRequest, ctx: { params?: Promise<Record<string, string | string[]>> }, auth) => {
  try {
    const conversations = await db.conversation.findMany({
      where: { userId: auth.userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { _count: { select: { messages: true } } },
    });
    return NextResponse.json(conversations);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 60, windowMs: 60000 },
});

// POST /api/conversations — Crée une conversation pour l'utilisateur authentifié
export const POST = withAuth(async (request: NextRequest, ctx: { params?: Promise<Record<string, string | string[]>> }, auth) => {
  try {
    const { title, type, agentId } = await request.json();
    if (!title) return NextResponse.json({ error: 'title requis' }, { status: 400 });
    if (typeof title !== 'string' || title.length > 200) {
      return NextResponse.json({ error: 'title trop long (max 200)' }, { status: 400 });
    }
    const conversation = await db.conversation.create({
      data: { title, type: type || 'chat', userId: auth.userId, agentId: agentId || null },
    });
    return NextResponse.json(conversation, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 20, windowMs: 60000 },
});
