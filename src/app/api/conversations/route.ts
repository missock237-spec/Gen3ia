import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verify } from 'jsonwebtoken';

const JWT_SECRET = process.env.AUTH_SECRET;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ') || !JWT_SECRET || JWT_SECRET.length < 32) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const decoded = verify(authHeader.slice(7), JWT_SECRET) as { userId: string };
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
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ') || !JWT_SECRET || JWT_SECRET.length < 32) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const decoded = verify(authHeader.slice(7), JWT_SECRET) as { userId: string };
    const { title, type, agentId } = await request.json();
    if (!title) return NextResponse.json({ error: 'title requis' }, { status: 400 });
    const conversation = await db.conversation.create({
      data: { title, type: type || 'chat', userId: decoded.userId, agentId: agentId || null },
    });
    return NextResponse.json(conversation, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
