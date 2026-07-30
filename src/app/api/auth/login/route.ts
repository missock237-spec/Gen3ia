import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as argon2 from 'argon2';
import { sign } from 'jsonwebtoken';

const JWT_SECRET = process.env.AUTH_SECRET;

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }

    if (!JWT_SECRET || JWT_SECRET.length < 32) {
      console.error('[AUTH] AUTH_SECRET manquant ou trop court');
      return NextResponse.json({ error: 'Erreur de configuration serveur' }, { status: 500 });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 });
    }

    const valid = await argon2.verify(user.password, password);
    if (!valid) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 });
    }

    const token = sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const refreshToken = sign(
      { userId: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    await db.activityLog.create({
      data: {
        action: 'Connexion',
        details: JSON.stringify({ email }),
        category: 'auth',
        userId: user.id,
      },
    });

    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json({
      token,
      refreshToken,
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
