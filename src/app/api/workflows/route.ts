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

export async function GET(request: NextRequest) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    const workflows = await db.workflow.findMany({
      where: { userId: user.userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    // Parser les steps JSON
    const parsed = workflows.map(w => ({
      ...w,
      steps: typeof w.steps === 'string' ? JSON.parse(w.steps) : w.steps,
      stepCount: Array.isArray(w.steps) ? w.steps.length : (typeof w.steps === 'string' ? JSON.parse(w.steps).length : 0),
    }));
    return NextResponse.json(parsed);
  } catch { return NextResponse.json({ error: 'Erreur de chargement' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const user = getUser(request);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    const { name, description, steps, trigger } = await request.json();
    if (!name || name.trim().length < 1) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
    }
    const workflow = await db.workflow.create({
      data: {
        name: name.trim(),
        description: description || '',
        steps: typeof steps === 'string' ? steps : JSON.stringify(steps || []),
        trigger: trigger || 'manual',
        userId: user.userId,
        status: 'draft',
      },
    });
    return NextResponse.json(workflow, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur de création' }, { status: 500 }); }
}
