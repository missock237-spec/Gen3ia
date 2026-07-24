import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(r: NextRequest, { params }: { params: { id: string } }) {
  try {
    const a = await db.agent.findUnique({ where: { id: params.id }, include: { permissions: true, _count: { select: { tasks: true, memories: true } } } });
    if (!a) return NextResponse.json({ error: 'Agent non trouvé' }, { status: 404 });
    return NextResponse.json(a);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function PATCH(r: NextRequest, { params }: { params: { id: string } }) {
  try { const b = await r.json(); const a = await db.agent.update({ where: { id: params.id }, data: b }); return NextResponse.json(a); }
  catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function DELETE(r: NextRequest, { params }: { params: { id: string } }) {
  try { await db.agent.delete({ where: { id: params.id } }); return NextResponse.json({ success: true }); }
  catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
