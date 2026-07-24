import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(r: NextRequest) {
  try {
    const a = r.headers.get('authorization');
    if (!a?.startsWith('Bearer ')) return NextResponse.json({ error: 'Auth' }, { status: 401 });
    const { verify } = await import('jsonwebtoken');
    const d = verify(a.slice(7), process.env.AUTH_SECRET || 's') as any;
    const g = await db.guardrail.findMany({ where: { userId: d.userId }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json(g);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    const { name, type, description, rules, severity, userId } = b;
    if (!name || !type || !userId) return NextResponse.json({ error: 'name, type, userId requis' }, { status: 400 });
    const g = await db.guardrail.create({ data: { name, type, description: description || '', rules: rules || '{}', severity: severity || 'warning', userId } });
    return NextResponse.json(g, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
