import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verify } from 'jsonwebtoken';

export const dynamic = "force-dynamic";
const JWT_SECRET = process.env.AUTH_SECRET;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ') || !JWT_SECRET || JWT_SECRET.length < 32) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = verify(token, JWT_SECRET) as { userId: string };

    const guardrail = await db.guardrail.findFirst({
      where: { id: (await params).id, userId: decoded.userId },
    });
    if (!guardrail) return NextResponse.json({ error: 'Garde-fou non trouvé' }, { status: 404 });

    const updated = await db.guardrail.update({
      where: { id: (await params).id },
      data: { isActive: !guardrail.isActive },
      select: { isActive: true },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}
