import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verify } from 'jsonwebtoken';
import * as argon2 from 'argon2';





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
    const { current, newPass } = await request.json();
    if (!current || !newPass) return NextResponse.json({ error: 'Champs requis' }, { status: 400 });
    if (newPass.length < 8) return NextResponse.json({ error: 'Minimum 8 caractères' }, { status: 400 });

    const user = await db.user.findUnique({ where: { id: decoded.userId }, select: { password: true } });
    if (!user?.password) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

    const valid = await argon2.verify(user.password, current);
    if (!valid) return NextResponse.json({ error: 'Mot de passe actuel incorrect' }, { status: 401 });

    const hashed = await argon2.hash(newPass, { type: argon2.argon2id });
    await db.user.update({ where: { id: decoded.userId }, data: { password: hashed } });

    return NextResponse.json({ success: true, message: 'Mot de passe modifié' });
  } catch {
    return NextResponse.json({ error: 'Erreur lors du changement' }, { status: 500 });
  }
}
