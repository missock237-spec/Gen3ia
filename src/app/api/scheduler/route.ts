import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';




export const dynamic = "force-dynamic";
export async function GET(r: NextRequest) {
  try {
    const a = r.headers.get('authorization');
    if (!a?.startsWith('Bearer ')) return NextResponse.json({ error: 'Auth' }, { status: 401 });
    const { verify } = await import('jsonwebtoken');
    const d = verify(a.slice(7), process.env.AUTH_SECRET || 's') as any;
    const t = await db.scheduledTask.findMany({ where: { userId: d.userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return NextResponse.json(t);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    const { name, schedule, payload, userId } = b;
    if (!name || !schedule || !userId) return NextResponse.json({ error: 'name, schedule et userId requis' }, { status: 400 });
    const t = await db.scheduledTask.create({ data: { name, schedule, payload: payload || '{}', userId } });
    return NextResponse.json(t, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
