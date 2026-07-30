import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(r: NextRequest) {
  try {
    const a = r.headers.get('authorization');
    if (!a?.startsWith('Bearer ')) return NextResponse.json({ error: 'Auth' }, { status: 401 });
    const { verify } = await import('jsonwebtoken');
    const d = verify(a.slice(7), process.env.AUTH_SECRET || 's') as any;
    const s = await db.multimodalSession.findMany({ where: { userId: d.userId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return NextResponse.json(s);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    const { userId, type } = b;
    if (!userId || !type) return NextResponse.json({ error: 'userId et type requis' }, { status: 400 });
    const s = await db.multimodalSession.create({ data: { userId, type, status: 'active' } });
    return NextResponse.json(s, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
