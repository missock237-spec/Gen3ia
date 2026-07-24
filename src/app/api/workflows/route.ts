import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(r: NextRequest) {
  try {
    const a = r.headers.get('authorization');
    if (!a?.startsWith('Bearer ')) return NextResponse.json({ error: 'Auth' }, { status: 401 });
    const { verify } = await import('jsonwebtoken');
    const d = verify(a.slice(7), process.env.AUTH_SECRET || 's') as any;
    const w = await db.workflow.findMany({ where: { userId: d.userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return NextResponse.json(w);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    const { name, description, steps, trigger, userId } = b;
    if (!name || !userId) return NextResponse.json({ error: 'name et userId requis' }, { status: 400 });
    const w = await db.workflow.create({ data: { name, description: description || '', steps: steps || '[]', trigger: trigger || 'manual', userId } });
    return NextResponse.json(w, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
