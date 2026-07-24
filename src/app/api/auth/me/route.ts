import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verify } from 'jsonwebtoken';

const JWT_SECRET = process.env.AUTH_SECRET || 'genova-dev-secret-change-in-production';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Token requis' }, { status: 401 });
    const token = authHeader.slice(7);
    const decoded = verify(token, JWT_SECRET) as { userId: string };
    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, avatar: true, plan: true, role: true, isActive: true, isEmailVerified: true, createdAt: true, _count: { select: { agents: true } } },
    });
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
  }
}
