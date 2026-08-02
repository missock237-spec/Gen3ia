import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verify } from 'jsonwebtoken';





export const dynamic = "force-dynamic";
const JWT_SECRET = process.env.AUTH_SECRET;

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ') || !JWT_SECRET || JWT_SECRET.length < 32) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const decoded = verify(token, JWT_SECRET) as { userId: string };

    const { name, email } = await request.json();

    if (!name || name.trim().length < 1) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
    }

    const updateData: Record<string, string> = { name: name.trim() };

    if (email && email !== '') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Format d\'email invalide' }, { status: 400 });
      }
      const existing = await db.user.findFirst({
        where: { email, NOT: { id: decoded.userId } },
      });
      if (existing) {
        return NextResponse.json({ error: 'Email déjà utilisé' }, { status: 409 });
      }
      updateData.email = email;
    }

    const user = await db.user.update({
      where: { id: decoded.userId },
      data: updateData,
      select: { id: true, email: true, name: true, plan: true, role: true },
    });

    return NextResponse.json({ success: true, user });
  } catch {
    return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
  }
}
