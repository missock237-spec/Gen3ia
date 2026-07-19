import { NextRequest, NextResponse } from 'next/server';
import {
  hashPassword,
  sanitizeEmail,
  validateEmail,
  validatePassword,
  checkRateLimit,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(`register:${ip}`, 3, 60000)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans une minute.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const email = sanitizeEmail(body.email || '');
    const { password, name } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, mot de passe et nom requis' },
        { status: 400 }
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        { error: 'Format d\'email invalide' },
        { status: 400 }
      );
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { error: passwordCheck.message },
        { status: 400 }
      );
    }

    if (name.length < 2 || name.length > 50) {
      return NextResponse.json(
        { error: 'Le nom doit contenir entre 2 et 50 caractères' },
        { status: 400 }
      );
    }

    const passwordHash = hashPassword(password);

    // Simulated user creation (replace with Prisma)
    const user = {
      id: `usr_${Buffer.from(email).toString('hex').slice(0, 16)}`,
      email,
      name,
      plan: 'free' as const,
      role: 'user' as const,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({
      message: 'Inscription réussie. Vérifiez votre email pour activer votre compte.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('[Register Error]:', err);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
