import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendVerificationCode } from '@/lib/email/auth-emails';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json({ error: 'Email et code requis' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const verification = await db.emailVerification.findFirst({
      where: {
        email: normalizedEmail,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) {
      return NextResponse.json({ error: 'Code invalide ou expire' }, { status: 400 });
    }

    if (verification.attempts >= 5) {
      await db.emailVerification.update({ where: { id: verification.id }, data: { used: true } });
      return NextResponse.json({ error: 'Trop de tentatives. Demandez un nouveau code.' }, { status: 400 });
    }

    // Comparaison anti-timing
    const storedBuffer = Buffer.from(verification.code);
    const inputBuffer = Buffer.from(code);
    const codeMatches = storedBuffer.length === inputBuffer.length &&
      crypto.timingSafeEqual(storedBuffer, inputBuffer);

    if (!codeMatches) {
      await db.emailVerification.update({
        where: { id: verification.id },
        data: { attempts: verification.attempts + 1 },
      });
      return NextResponse.json({
        error: 'Code invalide',
        remaining: 5 - (verification.attempts + 1),
      }, { status: 400 });
    }

    await db.$transaction([
      db.emailVerification.update({
        where: { id: verification.id },
        data: { used: true },
      }),
      db.user.update({
        where: { id: verification.userId },
        data: { isEmailVerified: true, emailVerified: new Date() },
      }),
      db.emailVerification.updateMany({
        where: { email: normalizedEmail, used: false },
        data: { used: true },
      }),
    ]);

    return NextResponse.json({ message: 'Email verifie avec succes' });
  } catch (error) {
    console.error('Verify-email error:', error);
    return NextResponse.json({ error: 'Erreur verification' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const verification = await db.emailVerification.findFirst({
      where: { email: email.toLowerCase().trim(), used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (verification) {
      await db.emailVerification.update({
        where: { id: verification.id },
        data: { used: true },
      });
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    await db.emailVerification.create({
      data: {
        email: email.toLowerCase().trim(),
        code,
        userId: user?.id || 'unknown',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    if (user) {
      sendVerificationCode(email, user.name, code).catch(err =>
        console.error('[Email] Erreur renvoi code:', err)
      );
    }

    return NextResponse.json({ message: 'Nouveau code envoye' });
  } catch (error) {
    console.error('Resend verification error:', error);
    return NextResponse.json({ error: 'Erreur' }, { status: 500 });
  }
}
