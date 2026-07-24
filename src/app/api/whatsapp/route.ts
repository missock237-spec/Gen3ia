import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(r: NextRequest) {
  try {
    const a = r.headers.get('authorization');
    if (!a?.startsWith('Bearer ')) return NextResponse.json({ error: 'Auth' }, { status: 401 });
    const { verify } = await import('jsonwebtoken');
    const d = verify(a.slice(7), process.env.AUTH_SECRET || 's') as any;
    const c = await db.whatsAppConfig.findUnique({ where: { userId: d.userId } });
    return NextResponse.json(c || null);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    const { userId, phoneNumber, apiToken, isActive } = b;
    if (!userId || !phoneNumber) return NextResponse.json({ error: 'userId et phoneNumber requis' }, { status: 400 });
    const c = await db.whatsAppConfig.upsert({ where: { userId }, update: { phoneNumber, apiToken, isActive: isActive || false }, create: { userId, phoneNumber, apiToken, isActive: isActive || false } });
    return NextResponse.json(c, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
