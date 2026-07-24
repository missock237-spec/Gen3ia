import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(r: NextRequest) {
  try {
    const a = r.headers.get('authorization');
    if (!a?.startsWith('Bearer ')) return NextResponse.json({ error: 'Auth' }, { status: 401 });
    const { verify } = await import('jsonwebtoken');
    const d = verify(a.slice(7), process.env.AUTH_SECRET || 's') as any;
    const usage = await db.usageDaily.findMany({ where: { userId: d.userId }, orderBy: { date: 'desc' }, take: 30 });
    return NextResponse.json(usage);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
