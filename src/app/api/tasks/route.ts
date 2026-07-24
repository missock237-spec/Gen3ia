import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(r: NextRequest) {
  try {
    const a = r.headers.get('authorization');
    if (!a?.startsWith('Bearer ')) return NextResponse.json({ error: 'Auth' }, { status: 401 });
    const { verify } = await import('jsonwebtoken');
    const d = verify(a.slice(7), process.env.AUTH_SECRET || 's') as any;
    const tasks = await db.task.findMany({ where: { userId: d.userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return NextResponse.json(tasks);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    const { title, description, priority, agentId, userId } = b;
    if (!title || !userId) return NextResponse.json({ error: 'title et userId requis' }, { status: 400 });
    const t = await db.task.create({ data: { title, description: description || '', priority: priority || 'medium', agentId, userId } });
    return NextResponse.json(t, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
