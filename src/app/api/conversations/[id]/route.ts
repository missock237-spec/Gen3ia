import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(r: NextRequest, { params }: { params: { id: string } }) {
  try {
    const conv = await db.conversation.findUnique({ where: { id: params.id }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!conv) return NextResponse.json({ error: 'Conversation non trouvée' }, { status: 404 });
    return NextResponse.json(conv);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function DELETE(r: NextRequest, { params }: { params: { id: string } }) {
  try { await db.conversation.delete({ where: { id: params.id } }); return NextResponse.json({ success: true }); }
  catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
