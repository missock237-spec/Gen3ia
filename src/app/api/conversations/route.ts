import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Auth required' }, { status: 401 });
    const { verify } = await import('jsonwebtoken');
    const decoded = verify(authHeader.slice(7), process.env.AUTH_SECRET || 'secret') as any;
    const conversations = await db.conversation.findMany({
      where: { userId: decoded.userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { _count: { select: { messages: true } } },
    });
    return NextResponse.json(conversations);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, type, userId } = body;
    if (!title || !userId) return NextResponse.json({ error: 'title et userId requis' }, { status: 400 });
    const conversation = await db.conversation.create({
      data: { title, type: type || 'chat', userId },
    });
    return NextResponse.json(conversation, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
