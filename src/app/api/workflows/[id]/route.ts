import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verify } from 'jsonwebtoken';

const JWT_SECRET = process.env.AUTH_SECRET;

function getUser(req: NextRequest): { userId: string } | null {
  try {
    const a = req.headers.get('authorization');
    if (!a?.startsWith('Bearer ') || !JWT_SECRET || JWT_SECRET.length < 32) return null;
    return verify(a.slice(7), JWT_SECRET) as { userId: string };
  } catch { return null; }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    const workflow = await db.workflow.findFirst({
      where: { id: params.id, userId: user.userId },
    });
    if (!workflow) return NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 });
    return NextResponse.json(workflow);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    const body = await request.json();
    const workflow = await db.workflow.updateMany({
      where: { id: params.id, userId: user.userId },
      data: { ...body, updatedAt: new Date() },
    });
    return NextResponse.json({ success: true, updated: workflow.count });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    await db.workflow.deleteMany({
      where: { id: params.id, userId: user.userId },
    });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'execute';

    const workflow = await db.workflow.findFirst({
      where: { id: params.id, userId: user.userId },
    });
    if (!workflow) return NextResponse.json({ error: 'Workflow non trouvé' }, { status: 404 });

    if (action === 'execute') {
      const updated = await db.workflow.update({
        where: { id: params.id },
        data: { status: 'active', updatedAt: new Date() },
      });
      return NextResponse.json({ success: true, status: 'active', workflow: updated });
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
