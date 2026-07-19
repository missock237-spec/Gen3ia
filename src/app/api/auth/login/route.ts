import { NextRequest, NextResponse } from 'next/server';
import {
  hashPassword,
  verifyPassword,
  generateAuthTokens,
  generateSessionToken,
  sanitizeEmail,
  validateEmail,
  checkRateLimit,
  getRateLimitRemaining,
} from '@/lib/auth';

interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitKey = `login:${ip}`;

    if (!checkRateLimit(rateLimitKey, 5, 60000)) {
      return NextResponse.json(
        {
          error: 'Trop de tentatives. Réessayez dans une minute.',
          retryAfter: 60,
          remaining: 0,
        },
        { status: 429 }
      );
    }

    const body: LoginRequest = await request.json();
    const { password, rememberMe } = body;
    const email = sanitizeEmail(body.email || '');

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email et mot de passe requis' },
        { status: 400 }
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        { error: 'Format d\'email invalide' },
        { status: 400 }
      );
    }

    // Simulated user lookup (replace with Prisma query)
    const user = {
      id: 'usr_' + Buffer.from(email).toString('hex').slice(0, 16),
      email,
      name: email.split('@')[0],
      plan: 'free',
      role: 'user' as const,
      passwordHash: hashPassword(password), // In real app, this comes from DB
    };

    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: 'Email ou mot de passe incorrect' },
        { status: 401 }
      );
    }

    const tokens = generateAuthTokens({
      userId: user.id,
      email: user.email,
      plan: user.plan,
      role: user.role,
    });

    const sessionToken = generateSessionToken();

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        role: user.role,
      },
      accessToken: tokens.accessToken,
      expiresIn: tokens.accessTokenExpiresIn,
    });

    // Set secure HTTP-only cookies
    const cookieBase = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };

    response.cookies.set('genova_session', sessionToken, {
      ...cookieBase,
      maxAge: rememberMe ? 604800 : 86400, // 7 days or 1 day
    });

    response.cookies.set('genova_refresh', tokens.refreshToken, {
      ...cookieBase,
      maxAge: 604800, // 7 days
    });

    return response;
  } catch (err) {
    console.error('[Login Error]:', err);
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    );
  }
}
