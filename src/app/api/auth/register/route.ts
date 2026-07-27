import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as argon2 from 'argon2';
import { sign } from 'jsonwebtoken';
import { sendWelcomeEmail, sendVerificationCode } from '@/lib/email/auth-emails';
import crypto from 'crypto';

const JWT_SECRET = process.env.AUTH_SECRET || 'genova-dev-secret';

export async function POST(request: NextRequest) {
  try {
    const { email, name, password } = await request.json();
    if (!email || !name || !password) {
      return NextResponse.json({ error: 'Email, nom et mot de passe requis' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Minimum 8 caracteres' }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: 'Email deja utilise' }, { status: 409 });

    const hashedPassword = await argon2.hash(password, { type: argon2.argon2id });
    const user = await db.user.create({
      data: { email, name, password: hashedPassword, plan: 'free', role: 'user', isActive: true },
    });

    const token = sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    await db.activityLog.create({
      data: { action: 'Inscription', details: JSON.stringify({ email }), category: 'auth', userId: user.id },
    });

    // Creer un code de verification email
    const code = crypto.randomInt(100000, 1000000).toString();
    await db.emailVerification.create({
      data: {
        email,
        code,
        userId: user.id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    // Envoyer les emails (non bloquant)
    Promise.all([
      sendWelcomeEmail(email, name),
      sendVerificationCode(email, name, code),
    ]).catch(err => console.error('[Email] Erreur envoi emails inscription:', err));

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json({ token, user: userWithoutPassword }, { status: 201 });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
