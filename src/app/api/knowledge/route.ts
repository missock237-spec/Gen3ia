import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(r: NextRequest) {
  try {
    const a = r.headers.get('authorization');
    if (!a?.startsWith('Bearer ')) return NextResponse.json({ error: 'Auth' }, { status: 401 });
    const { verify } = await import('jsonwebtoken');
    const d = verify(a.slice(7), process.env.AUTH_SECRET || 's') as any;
    const k = await db.knowledge.findMany({ where: { userId: d.userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return NextResponse.json(k);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    const { content, category, userId } = b;
    if (!content || !userId) return NextResponse.json({ error: 'content et userId requis' }, { status: 400 });
    const k = await db.knowledge.create({ data: { content, category: category || 'general', userId } });
    return NextResponse.json(k, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
