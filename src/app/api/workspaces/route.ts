import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(r: NextRequest) {
  try {
    const a = r.headers.get('authorization');
    if (!a?.startsWith('Bearer ')) return NextResponse.json({ error: 'Auth' }, { status: 401 });
    const { verify } = await import('jsonwebtoken');
    const d = verify(a.slice(7), process.env.AUTH_SECRET || 's') as any;
    const memberships = await db.workspaceMember.findMany({ where: { userId: d.userId }, include: { workspace: true } });
    return NextResponse.json(memberships.map(m => ({ ...m.workspace, role: m.role, memberId: m.id })));
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    const { name, slug, description, userId } = b;
    if (!name || !slug || !userId) return NextResponse.json({ error: 'name, slug et userId requis' }, { status: 400 });
    const w = await db.workspace.create({ data: { name, slug, description } });
    await db.workspaceMember.create({ data: { workspaceId: w.id, userId, role: 'owner' } });
    return NextResponse.json(w, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
