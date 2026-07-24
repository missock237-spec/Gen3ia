import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as argon2 from 'argon2';
import { sign } from 'jsonwebtoken';

const JWT_SECRET = process.env.AUTH_SECRET || 'genova-dev-secret-change-in-production';

export async function POST(request: NextRequest) {
  try {
    const { email, name, password } = await request.json();
    if (!email || !name || !password) {
      return NextResponse.json({ error: 'Email, nom et mot de passe requis' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Minimum 8 caractères' }, { status: 400 });
    }
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: 'Email déjà utilisé' }, { status: 409 });
    const hashedPassword = await argon2.hash(password, { type: argon2.argon2id });
    const user = await db.user.create({
      data: { email, name, password: hashedPassword, plan: 'free', role: 'user', isActive: true },
    });
    const token = sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    await db.activityLog.create({ data: { action: 'Inscription', details: JSON.stringify({ email }), category: 'auth', userId: user.id } });
    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json({ token, user: userWithoutPassword }, { status: 201 });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
