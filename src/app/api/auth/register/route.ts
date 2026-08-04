import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as argon2 from 'argon2';
import { sign } from 'jsonwebtoken';
import { sendWelcomeEmail, sendVerificationCode } from '@/lib/email/auth-emails';
import crypto from 'crypto';
import { attributeSignup } from '@/lib/recommend';




export const dynamic = "force-dynamic";
const JWT_SECRET = process.env.AUTH_SECRET;

export async function POST(request: NextRequest) {
  try {
    const { email, name, password, partner, partnerKey, sid, ref } = await request.json();

    if (!email || !name || !password) {
      return NextResponse.json({ error: 'Email, nom et mot de passe requis' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Minimum 8 caractères' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Format d'email invalide" }, { status: 400 });
    }
    if (!JWT_SECRET || JWT_SECRET.length < 32) {
      console.error('[AUTH] AUTH_SECRET manquant ou trop court');
      return NextResponse.json({ error: 'Erreur de configuration serveur' }, { status: 500 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email déjà utilisé' }, { status: 409 });
    }

    const hashedPassword = await argon2.hash(password, { type: argon2.argon2id });
    const user = await db.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        plan: 'free',
        role: 'user',
        isActive: true,
        credits: 10,
      },
    });

    // Attribution partenaire (recommandation SaaS) - best effort, jamais bloquant
    await attributeSignup({
      partnerId: typeof partner === 'string' && partner ? partner : undefined,
      partnerApiKey: typeof partnerKey === 'string' && partnerKey ? partnerKey : undefined,
      sessionId: typeof sid === 'string' && sid ? sid : undefined,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
      referrer: typeof ref === 'string' && ref ? ref : undefined,
      metadata: { email },
    });

    const token = sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await db.activityLog.create({
      data: { action: 'Inscription', details: JSON.stringify({ email }), category: 'auth', userId: user.id },
    });

    const code = crypto.randomInt(100000, 1000000).toString();
    await db.emailVerification.create({
      data: { email, code, userId: user.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    Promise.all([
      sendWelcomeEmail(email, name),
      sendVerificationCode(email, name, code),
    ]).catch(err => console.error('[Email] Erreur envoi:', err));

    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json({ token, user: userWithoutPassword }, { status: 201 });
  } catch (error) {
    console.error('[AUTH] Register error:', error);
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
