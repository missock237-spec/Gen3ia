import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(r: NextRequest) {
  try {
    const a = r.headers.get('authorization');
    if (!a?.startsWith('Bearer ')) return NextResponse.json({ error: 'Auth' }, { status: 401 });
    const { verify } = await import('jsonwebtoken');
    const d = verify(a.slice(7), process.env.AUTH_SECRET || 's') as any;
    const [sub, invs, crs] = await Promise.all([
      db.subscription.findUnique({ where: { userId: d.userId } }),
      db.invoice.findMany({ where: { userId: d.userId }, orderBy: { createdAt: 'desc' }, take: 12 }),
      db.creditTransaction.findMany({ where: { userId: d.userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return NextResponse.json({ subscription: sub, invoices: invs, credits: crs });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
