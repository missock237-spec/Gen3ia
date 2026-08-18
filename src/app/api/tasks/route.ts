import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verify } from 'jsonwebtoken';

export const dynamic = "force-dynamic";
const JWT_SECRET = process.env.AUTH_SECRET;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ') || !JWT_SECRET || JWT_SECRET.length < 32) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const decoded = verify(authHeader.slice(7), JWT_SECRET) as { userId: string };
    // Facade Firestore : where/orderBy en tableaux, limit au lieu de take.
    const tasks = await db.task.findMany({
      where: [{ field: 'userId', op: '==', value: decoded.userId }],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      limit: 50,
    });
    return NextResponse.json(tasks);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ') || !JWT_SECRET || JWT_SECRET.length < 32) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const decoded = verify(authHeader.slice(7), JWT_SECRET) as { userId: string };
    const { title, description, priority, agentId, status } = await request.json();
    if (!title) return NextResponse.json({ error: 'title requis' }, { status: 400 });
    const task = await db.task.create({
      data: { title, description: description || '', priority: priority || 'medium', status: status || 'pending', agentId: agentId || null, userId: decoded.userId },
    });
    return NextResponse.json(task, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
