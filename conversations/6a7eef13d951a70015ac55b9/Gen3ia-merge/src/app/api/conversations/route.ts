import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/with-auth';



// GET /api/conversations — Liste des conversations de l'utilisateur authentifié


export const dynamic = "force-dynamic";
export const GET = withAuth(async (request: NextRequest, ctx: { params?: Promise<Record<string, string | string[]>> }, auth) => {
  try {
    // Facade Firestore : where/orderBy en tableaux, limit au lieu de take,
    // include:{_count:{messages}} -> comptage en mémoire.
    const conversations = await db.conversation.findMany({
      where: [{ field: 'userId', op: '==', value: auth.userId }],
      orderBy: [{ field: 'updatedAt', direction: 'desc' }],
      limit: 50,
    });

    if (conversations.length === 0) return NextResponse.json([]);

    const ids = conversations.map((c) => String((c as Record<string, unknown>).id));
    const messages = await db.message.findMany();
    const countByConv = messages.reduce<Record<string, number>>((acc, m) => {
      const convId = String((m as Record<string, unknown>).conversationId || '');
      if (ids.includes(convId)) acc[convId] = (acc[convId] || 0) + 1;
      return acc;
    }, {});

    const enriched = conversations.map((c) => ({
      ...c,
      _count: { messages: countByConv[String((c as Record<string, unknown>).id)] || 0 },
    }));
    return NextResponse.json(enriched);
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
